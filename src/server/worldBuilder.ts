/**
 * @file worldBuilder.ts
 * @description Parallel Book World Extractor & Substring-Validated NPC Builder for "The Library of Worlds".
 * Partitions a connected source's extracted full text into 5-8 logical sections, then invokes
 * Gemini (`gemini-4-argon` / `gemini-3.8-flash`) with structured JSON output to generate:
 * - Section headings
 * - Tier-themed NPCs (`name`, `role` matching the tier's world template)
 * - In-character explanations grounded strictly in each section's text
 * - Follow-up answers (`whatDoYouMean`, `whyBelieveYou`, `verbatimLine`)
 * - 1-2 verbatim `QuoteToken`s per section
 * - A source-level `exitQuestion` with `expectedAnswer` and `supportingQuoteIds`
 *
 * Every `QuoteToken.text` and `followUps.verbatimLine` is validated server-side via
 * `isExactSubstring` and `validateSourceSubstrings` to guarantee 100% verbatim substring fidelity.
 *
 * Use cases:
 * 1. Milestone 2 pipeline: Transforming extracted arXiv/web full text into playable 360° Book Worlds.
 * 2. Unconnected World generation: Building abstract-only sources when full text is unavailable or times out.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import { isExactSubstring, validateSourceSubstrings } from '../shared/substringValidator';
import type {
  ExitQuestion,
  QuoteToken,
  Section,
  Source,
  SourceTier,
} from '../shared/types';
import { parseJsonOutput, runReasoningInteraction } from './genaiClient';
import type { ExtractedSourceText } from './textExtractor';
import { classifySourceTier } from './tierClassifier';
import type { VerifiedCandidate } from './verifier';

interface RawChunk {
  index: number;
  rawHeading?: string;
  text: string;
}

interface LlmSectionExtraction {
  chunkIndex: number;
  heading: string;
  npcName: string;
  npcRole: string;
  explanation: string;
  whatDoYouMean: string;
  whyBelieveYou: string;
  verbatimLine: string;
  quotes: string[];
}

interface LlmWorldExtractionResponse {
  sections: LlmSectionExtraction[];
  exitQuestion: {
    question: string;
    expectedAnswer: string;
    supportingChunkIndices: number[];
  };
}

const WORLD_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chunkIndex: { type: 'integer' },
          heading: { type: 'string' },
          npcName: { type: 'string' },
          npcRole: { type: 'string' },
          explanation: { type: 'string' },
          whatDoYouMean: { type: 'string' },
          whyBelieveYou: { type: 'string' },
          verbatimLine: {
            type: 'string',
            description: 'An exact character-for-character substring copied from this section text.',
          },
          quotes: {
            type: 'array',
            items: { type: 'string' },
            description: '1 or 2 exact character-for-character substrings copied from this section text.',
          },
        },
        required: [
          'chunkIndex',
          'heading',
          'npcName',
          'npcRole',
          'explanation',
          'whatDoYouMean',
          'whyBelieveYou',
          'verbatimLine',
          'quotes',
        ],
      },
    },
    exitQuestion: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        expectedAnswer: { type: 'string' },
        supportingChunkIndices: {
          type: 'array',
          items: { type: 'integer' },
        },
      },
      required: ['question', 'expectedAnswer', 'supportingChunkIndices'],
    },
  },
  required: ['sections', 'exitQuestion'],
};

/**
 * Splits a source's extracted full text into 5 to 7 coherent reading-order chunks
 * so each chunk becomes one NPC station around the 360° Book World.
 *
 * @param fullText - Clean plain text extracted from the source.
 * @returns Array of 5 to 7 `RawChunk` objects.
 */
export function partitionTextIntoSectionChunks(fullText: string): RawChunk[] {
  logFunctionCall('partitionTextIntoSectionChunks', { textLength: fullText.length });

  const paragraphs = fullText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const targetCount = 6;
  const totalLen = fullText.length;
  const targetChunkChars = Math.max(450, Math.floor(totalLen / targetCount));

  const chunks: RawChunk[] = [];
  let currentParas: string[] = [];
  let currentHeading: string | undefined;
  let currentLen = 0;

  for (const para of paragraphs) {
    if (para.startsWith('## ')) {
      const headingText = para.replace(/^##\s+/, '').trim();
      if (currentLen >= 350 && chunks.length < 7) {
        chunks.push({
          index: chunks.length,
          rawHeading: currentHeading,
          text: currentParas.join('\n\n'),
        });
        currentParas = [];
        currentLen = 0;
      }
      currentHeading = headingText;
      continue;
    }

    currentParas.push(para);
    currentLen += para.length;

    if (currentLen >= targetChunkChars && chunks.length < 6) {
      chunks.push({
        index: chunks.length,
        rawHeading: currentHeading,
        text: currentParas.join('\n\n'),
      });
      currentParas = [];
      currentHeading = undefined;
      currentLen = 0;
    }
  }

  if (currentParas.length > 0) {
    if (chunks.length >= 8) {
      chunks[chunks.length - 1].text += `\n\n${currentParas.join('\n\n')}`;
    } else {
      chunks.push({
        index: chunks.length,
        rawHeading: currentHeading,
        text: currentParas.join('\n\n'),
      });
    }
  }

  // Ensure between 5 and 8 sections if text is long enough
  while (chunks.length < 5 && chunks.some((c) => c.text.length > 500)) {
    let longestIdx = 0;
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i].text.length > chunks[longestIdx].text.length) {
        longestIdx = i;
      }
    }
    const toSplit = chunks[longestIdx].text;
    const mid = Math.floor(toSplit.length / 2);
    const splitPos = toSplit.indexOf('. ', mid);
    const cut = splitPos !== -1 ? splitPos + 1 : mid;
    const firstHalf = toSplit.slice(0, cut).trim();
    const secondHalf = toSplit.slice(cut).trim();
    if (firstHalf.length >= 120 && secondHalf.length >= 120) {
      chunks.splice(
        longestIdx,
        1,
        { index: 0, rawHeading: chunks[longestIdx].rawHeading, text: firstHalf },
        { index: 0, text: secondHalf }
      );
    } else {
      break;
    }
  }

  return chunks.slice(0, 8).map((c, idx) => ({
    index: idx,
    rawHeading: c.rawHeading,
    text: c.text,
  }));
}

/**
 * Ensures a candidate quote or verbatim line is an exact substring of `sectionText`.
 * First checks `isExactSubstring(candidate, sectionText)`. If the LLM slightly altered
 * whitespace or punctuation, attempts to locate a matching window in `sectionText`,
 * or falls back to selecting a substantive verbatim sentence directly from `sectionText`.
 *
 * @param candidate - Quote or verbatim line proposed by the model.
 * @param sectionText - Ground-truth text of the section.
 * @param fallbackSentenceIndex - Which sentence index to pick if no substring match is found.
 * @returns Guaranteed non-empty exact substring of `sectionText`.
 */
export function ensureExactSubstring(
  candidate: string | undefined,
  sectionText: string,
  fallbackSentenceIndex = 0
): string {
  logFunctionCall('ensureExactSubstring', {
    candidateLength: candidate?.length ?? 0,
    sectionLength: sectionText.length,
  });

  const cleanCandidate = (candidate ?? '').trim();
  if (cleanCandidate.length >= 15 && isExactSubstring(sectionText, cleanCandidate)) {
    return cleanCandidate;
  }

  // Try matching the first 45 chars of cleanCandidate inside sectionText
  if (cleanCandidate.length >= 30) {
    const prefix = cleanCandidate.slice(0, 35);
    const startIdx = sectionText.indexOf(prefix);
    if (startIdx !== -1) {
      const endPeriod = sectionText.indexOf('.', startIdx + prefix.length);
      const sliceEnd =
        endPeriod !== -1 && endPeriod - startIdx <= 280
          ? endPeriod + 1
          : Math.min(sectionText.length, startIdx + Math.min(cleanCandidate.length, 220));
      const sliced = sectionText.slice(startIdx, sliceEnd).trim();
      if (sliced.length >= 15 && isExactSubstring(sectionText, sliced)) {
        return sliced;
      }
    }
  }

  // Deterministic fallback: extract a substantive verbatim sentence directly from `sectionText`
  const sentences = sectionText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35 && s.length <= 280 && sectionText.includes(s));

  if (sentences.length > 0) {
    const chosen = sentences[fallbackSentenceIndex % sentences.length];
    if (isExactSubstring(sectionText, chosen)) {
      return chosen;
    }
  }

  // Final character slice fallback guaranteed to be an exact substring of `sectionText`
  const fallbackSlice = sectionText.slice(0, Math.min(180, sectionText.length)).trim();
  return fallbackSlice;
}

/**
 * Builds a complete `Source` object (either a connected 5-8 section Book World or an
 * unconnected abstract-only Book World) for a single verified candidate.
 *
 * @param params - Research question, source index, verified candidate, and extracted text result.
 * @returns Validated `Source` ready for shelving in the 3D Hub.
 */
export async function buildSourceWorld(params: {
  question: string;
  sourceIndex: number;
  candidate: VerifiedCandidate;
  extractedText: ExtractedSourceText;
}): Promise<Source> {
  const { question, sourceIndex, candidate, extractedText } = params;
  logFunctionCall('buildSourceWorld', {
    sourceIndex,
    title: candidate.title,
    connected: extractedText.connected,
  });

  const sourceId = `src-${sourceIndex + 1}`;
  const tierInfo = classifySourceTier({
    title: candidate.title,
    url: candidate.url,
    doi: candidate.doi,
    arxivId: candidate.arxivId,
    venue: candidate.venue,
    venueTypeHint: candidate.venueTypeHint,
    citationCount: candidate.citationCount,
    year: candidate.year,
  });

  const tierMeta = APP_CONFIG.tiers[tierInfo.tier];

  // Unconnected world (no full text available or timed out)
  if (!extractedText.connected || !extractedText.fullText) {
    return buildUnconnectedSource({
      sourceId,
      candidate,
      tier: tierInfo.tier,
      venueType: tierInfo.venueType,
      tierReasons: tierInfo.tierReasons,
      licence: extractedText.licence,
    });
  }

  const chunks = partitionTextIntoSectionChunks(extractedText.fullText);

  const prompt = `You are constructing an interactive 3D Book World inside "${APP_CONFIG.appName}" for a first-year university student researching:
"${question}"

SOURCE METADATA:
- Title: "${candidate.title}"
- Tier: ${tierMeta.label} (${tierMeta.sourceKind})
- 3D Setting: ${tierMeta.settingName} (default NPC role style: ${tierMeta.npcDefaultRole})

Below are the ${chunks.length} sequential sections of this source's extracted text.
For EACH section (chunkIndex 0 to ${chunks.length - 1}):
1. Provide a clear \`heading\` (3-7 words).
2. Create an inhabitant \`npcName\` and \`npcRole\` fitting a Victorian "${tierMeta.settingName}".
3. Write an in-character \`explanation\` (2-3 sentences) explaining what THIS section teaches, grounded ONLY in that section's text.
4. Provide \`whatDoYouMean\` (plain-English clarification for a first-year student) and \`whyBelieveYou\` (what evidence/method in this section backs the claim).
5. Copy ONE exact character-for-character sentence from that section as \`verbatimLine\`.
6. Copy 1 or 2 exact character-for-character passages (1 sentence each, 40-220 chars) from that section into \`quotes\`. Every quote MUST be an exact substring of that section's text.
7. Formulate one \`exitQuestion\` testing whether the student understood the core methodological contribution of this source, its \`expectedAnswer\`, and \`supportingChunkIndices\` (which section indices contain the best quote evidence).

SECTIONS:
${chunks
  .map(
    (c) =>
      `=== SECTION [chunkIndex=${c.index}] ${c.rawHeading ? `(${c.rawHeading})` : ''} ===\n${c.text.slice(0, 2600)}`
  )
  .join('\n\n')}`;

  try {
    // Use gemini-3.8-flash first for parallel per-book extraction speed, falling back to gemini-4-argon
    const { outputText } = await runReasoningInteraction({
      action: `buildSourceWorld_${sourceId}`,
      input: prompt,
      responseFormat: WORLD_EXTRACTION_SCHEMA,
      modelsToTry: [
        APP_CONFIG.models.reasoningFallback,
        APP_CONFIG.models.reasoningPrimary,
        APP_CONFIG.models.reasoningLiteFallback,
      ],
    });

    const parsed = parseJsonOutput<LlmWorldExtractionResponse>(outputText);
    const sections: Section[] = chunks.map((chunk, idx) => {
      const llmSec =
        parsed.sections?.find((s) => s.chunkIndex === chunk.index) ??
        parsed.sections?.[idx];

      const secId = `${sourceId}-sec-${idx + 1}`;
      const verbatimLine = ensureExactSubstring(llmSec?.verbatimLine, chunk.text, 0);

      const rawQuotes =
        Array.isArray(llmSec?.quotes) && llmSec.quotes.length > 0
          ? llmSec.quotes.slice(0, 2)
          : [verbatimLine];

      const seenTexts = new Set<string>();
      const quoteTokens: QuoteToken[] = [];
      rawQuotes.forEach((qText, qIdx) => {
        const verifiedText = ensureExactSubstring(qText, chunk.text, qIdx);
        if (!seenTexts.has(verifiedText)) {
          seenTexts.add(verifiedText);
          quoteTokens.push({
            id: `${sourceId}-qt-${idx + 1}-${quoteTokens.length + 1}`,
            sourceId,
            sectionId: secId,
            text: verifiedText,
          });
        }
      });

      return {
        id: secId,
        heading: llmSec?.heading?.trim() || chunk.rawHeading || `Section ${idx + 1}`,
        text: chunk.text,
        npc: {
          name: llmSec?.npcName?.trim() || `${tierMeta.label} Guide ${idx + 1}`,
          role: llmSec?.npcRole?.trim() || tierMeta.npcDefaultRole,
        },
        explanation:
          llmSec?.explanation?.trim() ||
          `In this part of the work, the authors detail: "${verbatimLine}"`,
        followUps: {
          whatDoYouMean:
            llmSec?.whatDoYouMean?.trim() ||
            `In simpler terms for your literature review, this section establishes how the method operates on the data described here.`,
          whyBelieveYou:
            llmSec?.whyBelieveYou?.trim() ||
            `Because the text directly states: "${verbatimLine}"`,
          verbatimLine,
        },
        quoteTokens,
      };
    });

    const allQuoteIds = sections.flatMap((s) => s.quoteTokens.map((q) => q.id));
    const supportingIndices = parsed.exitQuestion?.supportingChunkIndices ?? [0, 1];
    const supportingQuoteIds = supportingIndices
      .map((ci) => sections[ci]?.quoteTokens[0]?.id)
      .filter((id): id is string => Boolean(id));

    const exitQuestion: ExitQuestion = {
      question:
        parsed.exitQuestion?.question?.trim() ||
        `According to "${candidate.title}", what is the key methodological insight or limitation you must account for in your evaluation?`,
      expectedAnswer:
        parsed.exitQuestion?.expectedAnswer?.trim() ||
        sections[0]?.explanation ||
        candidate.summary,
      supportingQuoteIds:
        supportingQuoteIds.length > 0 ? supportingQuoteIds : allQuoteIds.slice(0, 2),
    };

    const rawSource: Source = {
      id: sourceId,
      title: candidate.title,
      authors: candidate.authors,
      year: candidate.year,
      url: candidate.url,
      doi: candidate.doi,
      arxivId: candidate.arxivId,
      venue: candidate.venue,
      venueType: tierInfo.venueType,
      citationCount: candidate.citationCount,
      tier: tierInfo.tier,
      tierReasons: tierInfo.tierReasons,
      theme: candidate.theme,
      summary: candidate.summary,
      verified: true,
      connected: true,
      abstract: candidate.abstract,
      licence: extractedText.licence,
      sections,
      exitQuestion,
    };

    // Enforce server-side substring validation across all sections and tokens
    return validateSourceSubstrings(rawSource);
  } catch {
    // Graceful deterministic fallback if LLM extraction fails for this single source
    return buildDeterministicConnectedFallback({
      sourceId,
      candidate,
      tier: tierInfo.tier,
      venueType: tierInfo.venueType,
      tierReasons: tierInfo.tierReasons,
      licence: extractedText.licence,
      chunks,
    });
  }
}

/**
 * Constructs an Unconnected World `Source` (`connected: false`) when full text is unavailable
 * or timed out, preserving verified bibliographic metadata and abstract.
 *
 * @param params - Unconnected source parameters.
 * @returns Validated `Source` with `connected: false`.
 */
function buildUnconnectedSource(params: {
  sourceId: string;
  candidate: VerifiedCandidate;
  tier: SourceTier;
  venueType: Source['venueType'];
  tierReasons: string[];
  licence: string;
}): Source {
  logFunctionCall('buildUnconnectedSource', {
    sourceId: params.sourceId,
    title: params.candidate.title,
  });

  const { sourceId, candidate, tier, venueType, tierReasons, licence } = params;
  const basisText = candidate.abstract || candidate.summary;

  return {
    id: sourceId,
    title: candidate.title,
    authors: candidate.authors,
    year: candidate.year,
    url: candidate.url,
    doi: candidate.doi,
    arxivId: candidate.arxivId,
    venue: candidate.venue,
    venueType,
    citationCount: candidate.citationCount,
    tier,
    tierReasons,
    theme: candidate.theme,
    summary: candidate.summary,
    verified: true,
    connected: false,
    abstract: candidate.abstract,
    licence,
    exitQuestion: {
      question: `Based on the abstract of "${candidate.title}", how does this work frame the problem you are investigating?`,
      expectedAnswer: basisText,
      supportingQuoteIds: [],
    },
  };
}

/**
 * Builds a connected `Source` deterministically from `RawChunk[]` if the LLM extraction call
 * fails, ensuring the pipeline never breaks and every quote is an exact substring.
 *
 * @param params - Deterministic fallback parameters.
 * @returns Validated connected `Source`.
 */
function buildDeterministicConnectedFallback(params: {
  sourceId: string;
  candidate: VerifiedCandidate;
  tier: SourceTier;
  venueType: Source['venueType'];
  tierReasons: string[];
  licence: string;
  chunks: RawChunk[];
}): Source {
  logFunctionCall('buildDeterministicConnectedFallback', {
    sourceId: params.sourceId,
    title: params.candidate.title,
  });

  const { sourceId, candidate, tier, venueType, tierReasons, licence, chunks } = params;
  const tierMeta = APP_CONFIG.tiers[tier];

  const sections: Section[] = chunks.map((chunk, idx) => {
    const secId = `${sourceId}-sec-${idx + 1}`;
    const verbatim = ensureExactSubstring(undefined, chunk.text, 0);
    return {
      id: secId,
      heading: chunk.rawHeading || `Section ${idx + 1}`,
      text: chunk.text,
      npc: {
        name: `${tierMeta.label} Scholar ${idx + 1}`,
        role: tierMeta.npcDefaultRole,
      },
      explanation: `This section examines a key part of "${candidate.title}": "${verbatim}"`,
      followUps: {
        whatDoYouMean: `Look closely at how the authors structure the method in this section.`,
        whyBelieveYou: `The passage directly states: "${verbatim}"`,
        verbatimLine: verbatim,
      },
      quoteTokens: [
        {
          id: `${sourceId}-qt-${idx + 1}-1`,
          sourceId,
          sectionId: secId,
          text: verbatim,
        },
      ],
    };
  });

  const rawSource: Source = {
    id: sourceId,
    title: candidate.title,
    authors: candidate.authors,
    year: candidate.year,
    url: candidate.url,
    doi: candidate.doi,
    arxivId: candidate.arxivId,
    venue: candidate.venue,
    venueType,
    citationCount: candidate.citationCount,
    tier,
    tierReasons,
    theme: candidate.theme,
    summary: candidate.summary,
    verified: true,
    connected: true,
    abstract: candidate.abstract,
    licence,
    sections,
    exitQuestion: {
      question: `What central method or finding from "${candidate.title}" applies to your research question?`,
      expectedAnswer: candidate.summary,
      supportingQuoteIds: sections.map((s) => s.quoteTokens[0].id),
    },
  };

  return validateSourceSubstrings(rawSource);
}
