/**
 * @file index.ts
 * @description Express backend server for "The Library of Worlds".
 * Holds the `GEMINI_API_KEY` securely on the server side (loaded from `.env`) and exposes
 * JSON endpoints for the Three.js frontend. The browser never calls Gemini directly.
 *
 * Use cases:
 * 1. `/api/health`: Reports server readiness and whether `GEMINI_API_KEY` is configured.
 * 2. `/api/exit-grade`: Evaluates a student's exit gate answer and presented quote token
 *    (Milestone 1 deterministic + keyword/quote grader, upgraded to full Gemini 4 Argon grader in M2/M3).
 * 3. `/api/research`, `/api/world/:sourceId`, `/api/debrief-grade`, `/api/live-token`:
 *    Scaffolded endpoints ready for Milestone 2-5 pipeline integration.
 */

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import { getGenAiClient } from './genaiClient';

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
 * Exit Gate grading endpoint (`POST /api/exit-grade`).
 * Evaluates whether the student's answer and presented `QuoteToken` support the source's
 * exit question. Returns `{ grade, feedback, hintSectionId, correction, sourceQuote }`.
 */
app.post(APP_CONFIG.endpoints.exitGrade, async (req, res) => {
  const { sourceId, question, expectedAnswer, supportingQuoteIds, studentAnswer, presentedQuoteId, connected } =
    req.body ?? {};
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
