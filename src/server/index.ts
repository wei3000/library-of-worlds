/**
 * @file index.ts
 * @description Express backend server for "The Library of Worlds".
 * Holds the `GEMINI_API_KEY` securely on the server side (loaded from `.env`) and exposes
 * JSON and SSE endpoints for the Three.js frontend. The browser never calls Gemini directly.
 *
 * Use cases:
 * 1. `/api/health`: Reports server readiness and whether `GEMINI_API_KEY` is configured.
 * 2. `/api/research/stream`: Server-Sent Events (SSE) endpoint that runs the Milestone 2
 *    Research Pipeline (`executeResearchPipeline`) and streams live Librarian narration
 *    (`PipelineProgressEvent`) to the Hub UI.
 * 3. `/api/research`: Standard JSON POST endpoint for executing or retrieving a cached
 *    research pipeline run.
 * 4. `/api/exit-grade`: Evaluates a student's exit gate answer and presented quote token.
 */

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import { getGenAiClient } from './genaiClient';
import { executeResearchPipeline } from './researchPipeline';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));

/**
 * Health check handler returning server status, active model configuration,
 * and whether a valid `GEMINI_API_KEY` is present in `.env` (without ever revealing the key).
 */
app.get(APP_CONFIG.endpoints.health, (_req, res) => {
  logFunctionCall('GET /api/health', {});
  const hasApiKey = Boolean(getGenAiClient());
  res.json({
    status: 'ok',
    hasApiKey,
    models: APP_CONFIG.models,
  });
});

/**
 * Server-Sent Events (SSE) endpoint (`GET /api/research/stream?question=...&force=...`)
 * that executes the Milestone 2 Research Pipeline and streams live Librarian narration
 * stages (`PipelineProgressEvent`) to the client.
 */
app.get(APP_CONFIG.endpoints.researchStream, async (req, res) => {
  const question = String(req.query.question || APP_CONFIG.seedQuestion).trim();
  const forceRefresh = req.query.force === 'true' || req.query.force === '1';

  logFunctionCall('GET /api/research/stream', {
    question,
    forceRefresh,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (payload: unknown): void => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    await executeResearchPipeline({
      question,
      forceRefresh,
      onProgress: (event) => {
        sendEvent(event);
      },
    });
    res.end();
  } catch (err) {
    sendEvent({
      stage: 'error',
      narration: `Alas! A disturbance in the ether interrupted the search: ${
        err instanceof Error ? err.message : String(err)
      }`,
      elapsedMs: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    res.end();
  }
});

/**
 * JSON POST endpoint (`POST /api/research`) to run the research pipeline and return
 * the final `ResearchPipelineResult`.
 */
app.post(APP_CONFIG.endpoints.research, async (req, res) => {
  const question = String(req.body?.question || APP_CONFIG.seedQuestion).trim();
  const forceRefresh = Boolean(req.body?.forceRefresh);

  logFunctionCall('POST /api/research', {
    question,
    forceRefresh,
  });

  try {
    const result = await executeResearchPipeline({
      question,
      forceRefresh,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Exit Gate grading endpoint (`POST /api/exit-grade`).
 * Evaluates whether the student's answer and presented `QuoteToken` support the source's
 * exit question. Returns `{ grade, feedback, hintSectionId, correction, sourceQuote }`.
 */
app.post(APP_CONFIG.endpoints.exitGrade, async (req, res) => {
  const {
    sourceId,
    question,
    expectedAnswer,
    supportingQuoteIds,
    studentAnswer,
    presentedQuoteId,
    connected,
  } = req.body ?? {};
  logFunctionCall('POST /api/exit-grade', {
    sourceId,
    question,
    presentedQuoteId,
    connected,
    studentAnswerLength: typeof studentAnswer === 'string' ? studentAnswer.length : 0,
  });

  const cleanAnswer = String(studentAnswer ?? '').trim().toLowerCase();
  const validQuoteIds: string[] = Array.isArray(supportingQuoteIds) ? supportingQuoteIds : [];
  const quoteMatches = !connected || validQuoteIds.includes(presentedQuoteId);

  // Check concept overlap with expectedAnswer keywords (words >= 5 chars)
  const expectedWords = String(expectedAnswer ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5);
  const matchedKeywords = expectedWords.filter((w) => cleanAnswer.includes(w));
  const keywordRatio =
    expectedWords.length > 0 ? matchedKeywords.length / Math.min(expectedWords.length, 5) : 0.5;

  if (cleanAnswer.length >= 15 && keywordRatio >= 0.35 && quoteMatches) {
    res.json({
      grade: 'pass',
      feedback:
        'Splendidly reasoned! Your explanation captures the heart of the source, and your chosen Quote Token backs it up verbatim. The kiskadee sings — the way back to the Hub is open.',
    });
    return;
  }

  if (cleanAnswer.length >= 15 && keywordRatio >= 0.35 && !quoteMatches) {
    res.json({
      grade: 'weak_evidence',
      feedback:
        'Your reasoning is sound, scholar, yet the Quote Token you presented does not substantiate that claim. Inspect your Satchel and present a passage that directly proves your point.',
    });
    return;
  }

  if (cleanAnswer.length >= 12 && keywordRatio >= 0.2 && quoteMatches) {
    res.json({
      grade: 'partial',
      feedback: `You have the right intuition and the right quote token! To complete the picture: ${expectedAnswer}`,
    });
    return;
  }

  res.json({
    grade: 'wrong',
    feedback:
      'The shadows lengthen and the crows stir. That interpretation misses what this source actually establishes. Seek the glowing inhabitant who holds the relevant section and try again.',
    rephrasedQuestion: `Look closely at the section discussing this mechanism: ${question}`,
  });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  logFunctionCall('serverListen', { port, hasApiKey: Boolean(getGenAiClient()) });
});
