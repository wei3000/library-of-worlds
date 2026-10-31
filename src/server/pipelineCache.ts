/**
 * @file pipelineCache.ts
 * @description Disk-backed cache for the Research Pipeline (`cache/<sha256-hash>.json`).
 * Saves each completed research pipeline run to disk keyed by the SHA-256 hash of the
 * normalized research question so repeat questions during development and live demos
 * return instantaneously unless `forceRefresh` is requested.
 *
 * Use cases:
 * 1. Fast dev iteration: Re-loading the seed question or any previously asked question without
 *    waiting for external search, Crossref/arXiv verification, and multi-world extraction.
 * 2. Demo safety & force-refresh: Allows instant replay from disk cache or explicit live
 *    execution when `forceRefresh: true` is passed from the Hub UI.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { ResearchPipelineResult } from '../shared/types';

/**
 * Normalizes a research question string and computes its SHA-256 hex digest
 * for deterministic cache filename generation.
 *
 * @param question - Raw student research question.
 * @returns 16-character hex prefix of the SHA-256 hash of the normalized question.
 */
export function hashResearchQuestion(question: string): string {
  logFunctionCall('hashResearchQuestion', { question });
  const normalized = question.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 24);
}

/**
 * Resolves the absolute filesystem path for a question's cache file inside `APP_CONFIG.pipeline.cacheDir`.
 *
 * @param question - Student research question.
 * @returns Absolute path to `cache/<hash>.json`.
 */
export function getCacheFilePath(question: string): string {
  logFunctionCall('getCacheFilePath', { question });
  const hash = hashResearchQuestion(question);
  const cacheDir = path.resolve(process.cwd(), APP_CONFIG.pipeline.cacheDir);
  return path.join(cacheDir, `${hash}.json`);
}

/**
 * Attempts to read a previously cached `ResearchPipelineResult` from disk.
 * Returns `null` if no cache file exists or if the file cannot be parsed.
 *
 * @param question - Student research question.
 * @returns Cached `ResearchPipelineResult` with `fromCache: true`, or `null`.
 */
export async function readCachedPipelineResult(
  question: string
): Promise<ResearchPipelineResult | null> {
  logFunctionCall('readCachedPipelineResult', { question });
  const filePath = getCacheFilePath(question);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as ResearchPipelineResult;
    if (!parsed || !Array.isArray(parsed.sources)) {
      return null;
    }
    return {
      ...parsed,
      fromCache: true,
    };
  } catch {
    return null;
  }
}

/**
 * Persists a `ResearchPipelineResult` to `cache/<hash>.json`, creating the `cache/`
 * directory automatically if it does not yet exist.
 *
 * @param result - Completed pipeline result to store on disk.
 */
export async function writeCachedPipelineResult(result: ResearchPipelineResult): Promise<void> {
  logFunctionCall('writeCachedPipelineResult', {
    question: result.question,
    sourceCount: result.sources.length,
    ghostCitationCount: result.ghostCitationCount,
  });
  const filePath = getCacheFilePath(result.question);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf8');
}
