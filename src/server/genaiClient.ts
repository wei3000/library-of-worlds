/**
 * @file genaiClient.ts
 * @description Server-side wrapper around the official `@google/genai` SDK (`GoogleGenAI`).
 * Enforces key security, exponential backoff on HTTP 429/503 errors, automatic model fallback
 * (`gemini-4-argon` -> `gemini-3.8-flash` -> `gemini-3.5-flash-lite`), structured JSON output
 * parsing, and complete `INFO` logging of all GenAI calls (model, prompt, config, output)
 * with inline data stripped and secrets redacted.
 *
 * Use cases:
 * 1. Executing structured JSON interactions with Gemini 4 Argon / Gemini 3.8 Flash.
 * 2. Executing grounded Google Search + Python code execution research turns.
 * 3. Automatic retry & graceful degradation during high-load hackathon demos.
 */

import { GoogleGenAI } from '@google/genai';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall, logGenAiCall } from '../shared/logger';

let cachedClient: GoogleGenAI | null = null;

/**
 * Retrieves or initializes the singleton `GoogleGenAI` client using `process.env.GEMINI_API_KEY`.
 * Never logs or exposes the API key.
 *
 * @returns Initialized `GoogleGenAI` client instance, or `null` if `GEMINI_API_KEY` is not set.
 */
export function getGenAiClient(): GoogleGenAI | null {
  logFunctionCall('getGenAiClient', {});
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

/**
 * Sleeps for the specified duration in milliseconds.
 *
 * @param ms - Milliseconds to wait.
 * @returns Promise that resolves after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  logFunctionCall('sleep', { ms });
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines whether an error returned by the Gemini API is a transient 429 or 503 status.
 *
 * @param err - Error caught from SDK call.
 * @returns Object indicating whether the error is retryable and whether it is a 503 overload.
 */
function classifyError(err: unknown): { retryable: boolean; is503: boolean } {
  logFunctionCall('classifyError', { error: String(err) });
  const msg = String(err).toLowerCase();
  const is503 = msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable');
  const is429 = msg.includes('429') || msg.includes('rate limit') || msg.includes('quota');
  return { retryable: is503 || is429, is503 };
}

/**
 * Extracts and parses a JSON object or array from a model output string,
 * handling markdown code fences or leading/trailing prose gracefully.
 *
 * @param rawText - Raw string returned by the model.
 * @returns Parsed JSON value of type `T`.
 */
export function parseJsonOutput<T>(rawText: string): T {
  logFunctionCall('parseJsonOutput', { rawLength: rawText.length });
  const trimmed = rawText.trim();

  // 1. Direct parse attempt
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Continue to fence/brace extraction
  }

  // 2. Strip ```json ... ``` fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // Continue to brace extraction
    }
  }

  // 3. Extract outermost {...} or [...]
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate) as T;
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.slice(firstBracket, lastBracket + 1);
    return JSON.parse(candidate) as T;
  }

  throw new Error(`Failed to parse JSON from model output (length ${rawText.length})`);
}

/**
 * Calls the Gemini Interactions API (`client.interactions.create`) with exponential backoff
 * on 429/503 and automatic fallback across the configured reasoning model chain on repeated 503s.
 * Every call and output is logged via `logGenAiCall` with inline data stripped.
 *
 * @param params - Action label, input prompt, optional generation/tool/schema config, and optional model override list.
 * @returns The raw output text and interaction object from Gemini.
 */
export async function runReasoningInteraction(params: {
  action: string;
  input: string;
  systemInstruction?: string;
  generationConfig?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
  responseFormat?: Record<string, unknown>;
  modelsToTry?: string[];
}): Promise<{ outputText: string; modelUsed: string; rawInteraction: unknown }> {
  logFunctionCall('runReasoningInteraction', {
    action: params.action,
    modelsToTry: params.modelsToTry,
    hasTools: Boolean(params.tools?.length),
    hasResponseFormat: Boolean(params.responseFormat),
  });

  const client = getGenAiClient();
  if (!client) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const modelChain = params.modelsToTry ?? [
    APP_CONFIG.models.reasoningPrimary,
    APP_CONFIG.models.reasoningFallback,
    APP_CONFIG.models.reasoningLiteFallback,
  ];

  let lastError: unknown = null;

  for (const model of modelChain) {
    let delayMs: number = APP_CONFIG.retry.initialDelayMs;
    for (let attempt = 1; attempt <= APP_CONFIG.retry.maxAttemptsPerModel; attempt++) {
      const requestConfig: Record<string, unknown> = {
        model,
        input: params.input,
        ...(params.systemInstruction ? { system_instruction: params.systemInstruction } : {}),
        ...(params.generationConfig ? { generation_config: params.generationConfig } : {}),
        ...(params.tools ? { tools: params.tools } : {}),
        ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
      };

      try {
        const interactionsApi = (client as unknown as {
          interactions?: {
            create: (req: Record<string, unknown>) => Promise<{ output_text?: string }>;
          };
        }).interactions;

        if (interactionsApi && typeof interactionsApi.create === 'function') {
          const interaction = await interactionsApi.create(requestConfig);
          const outputText = interaction.output_text ?? '';
          logGenAiCall({
            action: params.action,
            model,
            prompt: params.input,
            config: {
              systemInstruction: params.systemInstruction,
              generationConfig: params.generationConfig,
              tools: params.tools,
              hasResponseFormat: Boolean(params.responseFormat),
              attempt,
            },
            output: {
              output_text: outputText,
              id: (interaction as Record<string, unknown>).id,
              status: (interaction as Record<string, unknown>).status,
              usage: (interaction as Record<string, unknown>).usage,
            },
          });
          return { outputText, modelUsed: model, rawInteraction: interaction };
        }

        // Fallback if SDK build exposes models.generateContent
        const response = await client.models.generateContent({
          model,
          contents: params.input,
          config: {
            ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
            ...(params.generationConfig ?? {}),
          },
        });
        const outputText = response.text ?? '';
        logGenAiCall({
          action: params.action,
          model,
          prompt: params.input,
          config: {
            systemInstruction: params.systemInstruction,
            generationConfig: params.generationConfig,
            attempt,
          },
          output: { text: outputText },
        });
        return { outputText, modelUsed: model, rawInteraction: response };
      } catch (err) {
        lastError = err;
        logGenAiCall({
          action: `${params.action} [ATTEMPT_${attempt}_FAILED]`,
          model,
          prompt: params.input,
          config: requestConfig,
          error: err,
        });

        const { retryable } = classifyError(err);
        if (!retryable || attempt === APP_CONFIG.retry.maxAttemptsPerModel) {
          break;
        }
        await sleep(delayMs);
        delayMs = Math.round(delayMs * APP_CONFIG.retry.backoffMultiplier);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`All Gemini models failed for action ${params.action}`);
}
