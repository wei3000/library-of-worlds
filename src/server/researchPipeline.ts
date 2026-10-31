/**
 * @file researchPipeline.ts
 * @description End-to-end Milestone 2 Research Pipeline Orchestrator for "The Library of Worlds".
 * Coordinates disk caching, grounded candidate search, parallel bibliographic verification,
 * parallel full-text extraction, parallel Book World NPC & quote generation, and Lantern Path
 * ordering while streaming in-character Librarian narration events (`PipelineProgressEvent`).
 *
 * Use cases:
 * 1. Streaming real-time progress to the 3D Hub (`GET /api/research/stream`) as the Head Librarian
 *    narrates candidate discovery, ghost citation dismissal, and shelving.
 * 2. Executing uncached or cached pipeline runs via `POST /api/research`.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type {
  PipelineProgressEvent,
  ResearchPipelineResult,
  Source,
} from '../shared/types';
import {
  readCachedPipelineResult,
  writeCachedPipelineResult,
} from './pipelineCache';
import { proposeCandidateSources } from './researchAgent';
import { extractTextForCandidate } from './textExtractor';
import { verifyCandidateBatch } from './verifier';
import { buildSourceWorld } from './worldBuilder';

export type ProgressCallback = (event: PipelineProgressEvent) => void;

/**
 * Computes the Lantern Path ordering of source IDs from easiest tier (`imp` = 1)
 * to hardest tier (`archmage` = 5), preferring connected worlds first within the same tier.
 *
 * @param sources - Verified and tiered sources.
 * @returns Ordered array of `source.id` strings.
 */
export function computeLanternPathOrder(sources: Source[]): string[] {
  logFunctionCall('computeLanternPathOrder', { sourceCount: sources.length });

  return [...sources]
    .sort((a, b) => {
      const orderDiff =
        APP_CONFIG.tiers[a.tier].order - APP_CONFIG.tiers[b.tier].order;
      if (orderDiff !== 0) {
        return orderDiff;
      }
      if (a.connected !== b.connected) {
        return a.connected ? -1 : 1;
      }
      return (a.citationCount ?? 0) - (b.citationCount ?? 0);
    })
    .map((s) => s.id);
}

/**
 * Executes the complete research pipeline for a student's question, invoking `onProgress`
 * at every stage so the Hub UI can display the Librarian's live narration.
 *
 * @param params - Student question, `forceRefresh` flag, and optional `onProgress` listener.
 * @returns Completed `ResearchPipelineResult` (also saved to `cache/<hash>.json`).
 */
export async function executeResearchPipeline(params: {
  question: string;
  forceRefresh?: boolean;
  onProgress?: ProgressCallback;
}): Promise<ResearchPipelineResult> {
  const { question, forceRefresh = false, onProgress } = params;
  const startTime = Date.now();

  logFunctionCall('executeResearchPipeline', {
    question,
    forceRefresh,
  });

  const emit = (
    stage: PipelineProgressEvent['stage'],
    narration: string,
    extra?: Partial<PipelineProgressEvent>
  ): void => {
    const event: PipelineProgressEvent = {
      stage,
      narration,
      elapsedMs: Date.now() - startTime,
      ...extra,
    };
    onProgress?.(event);
  };

  // 1. Check disk cache unless forceRefresh is set
  emit('cache_check', 'Inspecting the Grand Catalogue ledger for prior inquiries…');
  if (!forceRefresh) {
    const cached = await readCachedPipelineResult(question);
    if (cached && cached.sources.length > 0) {
      emit(
        'complete',
        `Retrieved ${cached.sources.length} verified volumes from the Grand Catalogue (${cached.ghostCitationCount} ghost citations previously warded off). Shelving now…`,
        { result: cached }
      );
      return cached;
    }
  }

  // 2. Research Agent (Gemini + Google Search Grounding)
  emit(
    'searching',
    'Searching the stacks… consulting scholarly registries and technical archives for candidate sources…'
  );
  const { themes, candidates } = await proposeCandidateSources(question);

  emit(
    'candidates_found',
    `Searching the stacks… ${candidates.length} candidates found across ${themes.length} thematic aisles. Verifying bindings against Crossref, arXiv, and Semantic Scholar…`
  );

  // 3. Parallel Verification (10s timeout per external call)
  emit(
    'verifying',
    `Verifying ${candidates.length} candidate citations in parallel against Crossref, arXiv, Semantic Scholar, and live URLs…`
  );
  const { verifiedCandidates, ghostCitationCount } =
    await verifyCandidateBatch(candidates);

  const ghostWord = ghostCitationCount === 1 ? 'ghost citation' : 'ghost citations';
  emit(
    'verified',
    `${candidates.length} candidates inspected… ${ghostCitationCount} ${ghostWord} dismissed… ${verifiedCandidates.length} genuine volumes verified!`
  );

  // 4. Parallel Full-Text Fetch (10s timeout per external call; timeouts become unconnected worlds)
  emit(
    'fetching_text',
    `Unrolling scrolls… fetching open-access full text in parallel for ${verifiedCandidates.length} verified volumes…`
  );
  const extractedTexts = await Promise.all(
    verifiedCandidates.map((candidate) => extractTextForCandidate(candidate))
  );

  const connectedCount = extractedTexts.filter((t) => t.connected).length;
  const unconnectedCount = verifiedCandidates.length - connectedCount;

  // 5. Parallel World & NPC Extraction (with server-side exact substring validation)
  emit(
    'extracting_worlds',
    `Awakening inhabitants in ${connectedCount} connected Book Worlds (${unconnectedCount} abstract-only wings) and validating verbatim quote tokens…`
  );
  const sources = await Promise.all(
    verifiedCandidates.map((candidate, idx) =>
      buildSourceWorld({
        question,
        sourceIndex: idx,
        candidate,
        extractedText: extractedTexts[idx],
      })
    )
  );

  // 6. Compute Lantern Path & Cache to Disk
  emit(
    'shelving',
    `Searching the stacks… ${candidates.length} candidates found… ${ghostCitationCount} ${ghostWord} dismissed… shelving ${sources.length} volumes along the Lantern Path…`
  );
  const path = computeLanternPathOrder(sources);
  const durationMs = Date.now() - startTime;

  const result: ResearchPipelineResult = {
    question,
    sources,
    path,
    ghostCitationCount,
    fromCache: false,
    cachedAt: new Date().toISOString(),
    durationMs,
  };

  await writeCachedPipelineResult(result);

  emit(
    'complete',
    `Searching the stacks… ${candidates.length} candidates found… ${ghostCitationCount} ${ghostWord} dismissed… shelving ${sources.length} volumes (${connectedCount} connected worlds, ${unconnectedCount} unconnected wings) in ${(durationMs / 1000).toFixed(1)}s!`,
    { result }
  );

  return result;
}
