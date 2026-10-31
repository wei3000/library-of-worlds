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
import { gradeExitDebrief } from './debriefGrader';
import { gradeExitGateSubmission } from './exitGateGrader';
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
 * Evaluates the student's comprehension answer (`pass` / `partial` / `wrong`) using the Gemini
 * reasoning model (`gemini-4-argon` with fallback chain) and returns the single best supporting
 * quote on `pass` or `partial` (validated as an exact substring of the section text).
 */
app.post(APP_CONFIG.endpoints.exitGrade, async (req, res) => {
  const {
    sourceId,
    sourceTitle,
    question,
    expectedAnswer,
    supportingQuoteIds,
    studentAnswer,
    connected,
    sections,
  } = req.body ?? {};
  logFunctionCall('POST /api/exit-grade', {
    sourceId,
    question,
    connected,
    studentAnswerLength: typeof studentAnswer === 'string' ? studentAnswer.length : 0,
  });

  try {
    const result = await gradeExitGateSubmission({
      sourceId: String(sourceId ?? ''),
      sourceTitle: typeof sourceTitle === 'string' ? sourceTitle : undefined,
      question: String(question ?? ''),
      expectedAnswer: String(expectedAnswer ?? ''),
      supportingQuoteIds: Array.isArray(supportingQuoteIds) ? supportingQuoteIds : [],
      studentAnswer: String(studentAnswer ?? ''),
      connected: Boolean(connected),
      sections: Array.isArray(sections) ? sections : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Exit Debrief & Claim Verification endpoint (`POST /api/debrief-grade`).
 * Evaluates the student's final synthesis at the Library Exit Door against shelved sources,
 * flagging unsupported or overstated claims (which spawn mischievous Elves) and suggesting next reads.
 */
app.post(APP_CONFIG.endpoints.debriefGrade, async (req, res) => {
  const { question, transcript, sources, visitedSourceIds } = req.body ?? {};
  logFunctionCall('POST /api/debrief-grade', {
    question,
    transcriptLength: typeof transcript === 'string' ? transcript.length : 0,
    sourceCount: Array.isArray(sources) ? sources.length : 0,
  });

  try {
    const result = await gradeExitDebrief({
      question: String(question ?? APP_CONFIG.seedQuestion),
      transcript: String(transcript ?? ''),
      sources: Array.isArray(sources) ? sources : [],
      visitedSourceIds: Array.isArray(visitedSourceIds) ? visitedSourceIds : [],
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  logFunctionCall('serverListen', { port, hasApiKey: Boolean(getGenAiClient()) });
});
