/**
 * @file debriefGrader.ts
 * @description Milestone 4 Exit Debrief & Claim Verification grader for "The Library of Worlds".
 * When the student walks to the Library Exit Door in the 3D Hub, Head Librarian Aurelius Finch asks:
 * "Before you go — what is your answer to your question, and which sources do you trust most and why?"
 *
 * This module uses `gemini-4-argon` (with automatic fallback to `gemini-3.8-flash` / `gemini-3.5-flash-lite`)
 * to decompose the student's synthesis into atomic `TakeawayClaim[]` items and verify each claim against
 * the shelved `Source[]`:
 * - `supported`: Backed by a specific verified source (`supportedBy: source.id`).
 * - `unsupported` or `overstated`: Spawns a mischievous Library Elf in the Hub holding up the claim banner
 *   until the student either revises the claim, attaches a collected quote token, or dismisses it.
 *
 * Also generates 2–3 `suggestedNextReads` for the student's printable Borrowing Record PDF.
 *
 * Use cases:
 * 1. `POST /api/debrief-grade`: Evaluates the student's final synthesis and returns verified claims.
 * 2. Spawning mischievous Elves in the 3D Hub for every `'unsupported'` or `'overstated'` claim.
 * 3. Populating the final Takeaway & Suggested Next Reads sections of the Borrowing Record PDF.
 */

import { logFunctionCall } from '../shared/logger';
import type { ClaimStatus, Source, TakeawayClaim } from '../shared/types';
import { getGenAiClient, parseJsonOutput, runReasoningInteraction } from './genaiClient';

export interface DebriefGradeRequest {
  question: string;
  transcript: string;
  sources: Source[];
  visitedSourceIds?: string[];
}

export interface DebriefGradeResponse {
  librarianComment: string;
  claims: TakeawayClaim[];
  suggestedNextReads: Array<{
    title: string;
    reason: string;
    url?: string;
  }>;
}

const DEBRIEF_SCHEMA = {
  type: 'object',
  properties: {
    librarianComment: {
      type: 'string',
      description:
        '1 to 2 short sentences from Head Librarian Aurelius Finch reacting to the synthesis.',
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'A single concise claim extracted from the student synthesis.',
          },
          status: {
            type: 'string',
            enum: ['supported', 'unsupported', 'overstated'],
          },
          supportedBy: {
            type: 'string',
            description:
              'Exact source.id that backs this claim if status is supported, or empty string.',
          },
          explanation: {
            type: 'string',
            description:
              '1 short sentence explaining which source supports it, or why a mischievous Elf flags it as unsupported/overstated.',
          },
        },
        required: ['text', 'status', 'supportedBy', 'explanation'],
      },
    },
    suggestedNextReads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          reason: { type: 'string' },
          url: { type: 'string' },
        },
        required: ['title', 'reason'],
      },
    },
  },
  required: ['librarianComment', 'claims', 'suggestedNextReads'],
};

/**
 * Evaluates the student's final Exit Debrief synthesis using `gemini-4-argon` (with fallback chain),
 * extracting claims (`supported`, `unsupported`, `overstated`) and suggesting 2–3 next reads.
 *
 * @param req - Student's research question, takeaway synthesis transcript, and shelved sources.
 * @returns `DebriefGradeResponse` with librarian comment, verified claims, and suggested next reads.
 */
export async function gradeExitDebrief(req: DebriefGradeRequest): Promise<DebriefGradeResponse> {
  logFunctionCall('gradeExitDebrief', {
    question: req.question,
    transcriptLength: req.transcript.length,
    sourceCount: req.sources.length,
  });

  if (getGenAiClient()) {
    try {
      return await gradeExitDebriefWithLlm(req);
    } catch {
      return gradeExitDebriefHeuristic(req);
    }
  }

  return gradeExitDebriefHeuristic(req);
}

/**
 * Calls `gemini-4-argon` via `runStructuredJsonInteraction` to extract and verify student claims.
 */
async function gradeExitDebriefWithLlm(req: DebriefGradeRequest): Promise<DebriefGradeResponse> {
  const sourceCatalog = req.sources.map((s) => ({
    id: s.id,
    title: s.title,
    tier: s.tier,
    venue: s.venue ?? s.venueType,
    year: s.year,
    summary: s.summary,
    abstractSnippet: (s.abstract || s.summary).slice(0, 380),
  }));

  const prompt = `You are Head Librarian Aurelius Finch in a Victorian research library.
A first-year university student is leaving the library and answering your final Exit Debrief question:
"Before you go — what is your answer to your question, and which sources do you trust most and why?"

RESEARCH QUESTION: "${req.question}"
STUDENT SYNTHESIS: "${req.transcript}"

SHELVED VERIFIED SOURCES:
${JSON.stringify(sourceCatalog, null, 2)}

INSTRUCTIONS:
1. Break the student's synthesis into 2 to 4 distinct claims.
2. For each claim, set "status" to:
   - "supported" if it aligns with one of the shelved sources (and set "supportedBy" to that exact source.id).
   - "overstated" if the student makes an absolute claim ("100% accuracy", "proves beyond doubt", "blogs are just as reliable as peer-reviewed surveys") that goes beyond what the source or its tier warrants.
   - "unsupported" if the claim is invented or contradicts the shelved sources.
3. Keep "librarianComment" and each claim's "explanation" to 1-2 short, vivid sentences.
4. Provide 2-3 "suggestedNextReads" (real academic topics, survey directions, or unread high-tier volumes from the shelf) to deepen their literature review.`;

  const { outputText } = await runReasoningInteraction({
    action: 'gradeExitDebrief',
    input: prompt,
    responseFormat: DEBRIEF_SCHEMA,
  });

  const parsed = parseJsonOutput<{
    librarianComment: string;
    claims: Array<{
      text: string;
      status: 'supported' | 'unsupported' | 'overstated';
      supportedBy: string;
      explanation: string;
    }>;
    suggestedNextReads: Array<{ title: string; reason: string; url?: string }>;
  }>(outputText);

  const validSourceIds = new Set(req.sources.map((s) => s.id));
  const claims: TakeawayClaim[] = (parsed.claims ?? []).slice(0, 5).map((c, idx) => {
    const status: ClaimStatus =
      c.status === 'supported' || c.status === 'unsupported' || c.status === 'overstated'
        ? c.status
        : 'supported';
    const matchedSourceId = validSourceIds.has(c.supportedBy)
      ? c.supportedBy
      : status === 'supported'
        ? findBestMatchingSourceId(c.text, req.sources)
        : undefined;
    return {
      id: `claim-${idx + 1}`,
      text: c.text.trim(),
      status,
      supportedBy: matchedSourceId,
      explanation: c.explanation.trim(),
    };
  });

  if (claims.length === 0) {
    return gradeExitDebriefHeuristic(req);
  }

  return {
    librarianComment:
      parsed.librarianComment?.trim() ||
      'Let us inspect your synthesis against the volumes on our shelves.',
    claims,
    suggestedNextReads: (parsed.suggestedNextReads ?? []).slice(0, 3),
  };
}

/**
 * Deterministic fallback claim extractor and verifier when offline or if LLM calls fail.
 */
export function gradeExitDebriefHeuristic(req: DebriefGradeRequest): DebriefGradeResponse {
  logFunctionCall('gradeExitDebriefHeuristic', {
    transcriptLength: req.transcript.length,
  });

  const rawSentences = req.transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const sentences =
    rawSentences.length > 0 ? rawSentences.slice(0, 4) : [req.transcript.trim() || 'No synthesis provided.'];

  const overstatementPattern =
    /\b(always|never|100%|perfect|proves everything|guaranteed|all blogs are peer-reviewed|zero error)\b/i;

  const claims: TakeawayClaim[] = sentences.map((sentence, idx) => {
    const matchedId = findBestMatchingSourceId(sentence, req.sources);
    const matchedSource = req.sources.find((s) => s.id === matchedId);

    if (overstatementPattern.test(sentence)) {
      return {
        id: `claim-${idx + 1}`,
        text: sentence,
        status: 'overstated',
        explanation:
          'A mischievous Elf perks up! This phrasing overstates certainty beyond what empirical benchmarks support.',
      };
    }

    if (matchedSource) {
      return {
        id: `claim-${idx + 1}`,
        text: sentence,
        status: 'supported',
        supportedBy: matchedSource.id,
        explanation: `Supported by ${matchedSource.title} (${matchedSource.tier.toUpperCase()} tier).`,
      };
    }

    return {
      id: `claim-${idx + 1}`,
      text: sentence,
      status: 'unsupported',
      explanation:
        'A mischievous Elf giggles! None of the verified volumes on our shelves directly back this claim yet.',
    };
  });

  const flaggedCount = claims.filter((c) => c.status !== 'supported').length;
  const librarianComment =
    flaggedCount === 0
      ? 'Splendid synthesis! Every claim rests squarely on verified sources, and you weighed their tiers wisely.'
      : `A thoughtful synthesis, though ${flaggedCount} mischievous library ${flaggedCount === 1 ? 'elf has' : 'elves have'} appeared to challenge unbacked or overstated claims!`;

  return {
    librarianComment,
    claims,
    suggestedNextReads: [
      {
        title: 'Stowell et al. (2019) — Automatic acoustic identification of individuals in wild populations',
        reason: 'Foundational peer-reviewed methodology for open-set acoustic holdout splits and confounding background noise.',
        url: 'https://doi.org/10.1111/2041-210X.13103',
      },
      {
        title: 'Scheirer et al. (2013) — Toward Open Set Recognition (IEEE TPAMI)',
        reason: 'Formalizes open-space risk and Open-Set AUC / FAR-FRR evaluation metrics.',
        url: 'https://doi.org/10.1109/TPAMI.2012.256',
      },
      {
        title: 'Kuhn et al. (1955) — The Hungarian Method for the Assignment Problem',
        reason: 'Explains how unsupervised cluster IDs are matched to ground-truth individuals during evaluation.',
      },
    ],
  };
}

/**
 * Finds the best matching `Source.id` for a claim sentence by token overlap.
 */
function findBestMatchingSourceId(claimText: string, sources: Source[]): string | undefined {
  const words = claimText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  let bestId: string | undefined;
  let bestScore = 0;

  for (const src of sources) {
    const haystack = `${src.title} ${src.authors.join(' ')} ${src.tier} ${src.summary} ${src.abstract}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (haystack.includes(w)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = src.id;
    }
  }

  return bestScore >= 2 ? bestId : undefined;
}
