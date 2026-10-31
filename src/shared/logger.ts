/**
 * @file logger.ts
 * @description Centralised structured logger for "The Library of Worlds".
 * Fulfils the project guideline:
 * - Log as INFO all function calls (with their parameters).
 * - Log all GenAI calls with all their parameters (model used, prompt, config) and their outputs,
 *   stripping inline data (base64 blobs, audio/image buffers) and never logging API keys or secrets.
 *
 * Use cases:
 * 1. Function entry tracing (`logFunctionCall`) across both client and server modules.
 * 2. Gemini SDK telemetry (`logGenAiCall`) for complete observability during live demos.
 */

const SECRET_KEYS = new Set(['apikey', 'api_key', 'gemini_api_key', 'authorization', 'token', 'secret']);

/**
 * Recursively sanitizes an arbitrary value for safe logging by stripping inline base64 data
 * (`data`, `inlineData`, `inline_data`, long base64 strings) and redacting any secret keys.
 *
 * @param value - The parameter or output value to sanitize.
 * @param depth - Current recursion depth to prevent circular reference loops.
 * @returns A safe, serialisable clone with inline data and secrets stripped.
 */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[MaxDepth]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.startsWith('data:image/') || value.startsWith('data:audio/')) {
      return `[InlineDataURI length=${value.length}]`;
    }
    if (value.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
      return `[Base64Data length=${value.length}]`;
    }
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return '[BinaryBuffer]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    const lowerKey = k.toLowerCase();
    if (SECRET_KEYS.has(lowerKey)) {
      sanitized[k] = '[REDACTED_SECRET]';
    } else if (
      lowerKey === 'inlinedata' ||
      lowerKey === 'inline_data' ||
      ((lowerKey === 'data' || lowerKey === 'audio' || lowerKey === 'image') &&
        typeof v === 'string' &&
        v.length > 120)
    ) {
      sanitized[k] = `[StrippedInlineData length=${typeof v === 'string' ? v.length : 'object'}]`;
    } else {
      sanitized[k] = sanitizeForLog(v, depth + 1);
    }
  }
  return sanitized;
}

/**
 * Logs a function invocation at INFO level along with its sanitized parameters.
 *
 * @param functionName - Name of the function being invoked (e.g. `enterBookWorld`).
 * @param params - Key-value map of function parameters.
 */
export function logFunctionCall(functionName: string, params: Record<string, unknown> = {}): void {
  const safeParams = sanitizeForLog(params);
  console.info(`[INFO][FN] ${functionName}`, safeParams);
}

/**
 * Logs a Gemini API call at INFO level with its model, prompt/input, config, and sanitized output.
 * Automatically strips inline data (base64 images/audio) and never logs API keys.
 *
 * @param details - Object containing model name, prompt/input, config, and response output.
 */
export function logGenAiCall(details: {
  action: string;
  model: string;
  prompt: unknown;
  config?: unknown;
  output?: unknown;
  error?: unknown;
}): void {
  const safePayload = {
    action: details.action,
    model: details.model,
    prompt: sanitizeForLog(details.prompt),
    config: sanitizeForLog(details.config ?? {}),
    output: sanitizeForLog(details.output ?? null),
    ...(details.error ? { error: String(details.error) } : {}),
  };
  console.info(`[INFO][GENAI] ${details.action} (${details.model})`, safePayload);
}
