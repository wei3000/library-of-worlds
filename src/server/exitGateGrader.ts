/**
 * @file exitGateGrader.ts
 * @description LLM-powered Exit Gate comprehension & evidence grader for "The Library of Worlds".
 * When a student attempts to leave a Book World, Head Librarian Aurelius Finch evaluates both:
 * 1. The student's written synthesis answering the source's comprehension question in their own words.
 * 2. The verbatim `QuoteToken` presented from the student's Satchel (for connected worlds).
 *
 * Grading Outcomes (`ExitGrade`):
 * - `pass`: The student's explanation is accurate AND the presented Quote Token directly supports it.
 *   (Unlocks the Exit Gate, triggers the Great Kiskadee call, clears Menace).
 * - `weak_evidence`: The student's written reasoning is right, but the presented Quote Token does not
 *   substantiate that specific claim. (Does NOT increase Menace; asks the student to pick a better token).
 * - `partial`: The student's answer and evidence are on the right track, but miss a key nuance.
 *   (Aurelius supplies the missing nuance and unlocks the Exit Gate).
 * - `wrong`: The student's answer misunderstands or contradicts the source. (Logs a `MisconceptionRecord`
 *    whose correction is withheld until the student passes, triggers the Crow call, increments Menace,
 *   rephrases the question, and highlights `hintSectionId` in the 360° world).
 *
 * Use Cases:
 * - Invoked by `POST /api/exit-grade` in `src/server/index.ts`.
 * - Falls back gracefully to deterministic keyword + quote-ID verification if `GEMINI_API_KEY` is unavailable.
 */

import { logFunctionCall } from '../shared/logger';
import type { ExitGrade } from '../shared/types';
import { getGenAiClient, parseJsonOutput, runReasoningInteraction } from './genaiClient';

export interface ExitGradeInput {
  sourceId: string;
  sourceTitle?: string;
  question: string;
  expectedAnswer: string;
  supportingQuoteIds: string[];
  studentAnswer: string;
  presentedQuoteId?: string;
  presentedQuoteText?: string;
  connected: boolean;
  sections?: Array<{
    id: string;
    heading: string;
    quoteTokens?: Array<{ id: string; text: string }>;
  }>;
}

export interface ExitGradeResult {
  grade: ExitGrade;
  feedback: string;
  rephrasedQuestion?: string;
  hintSectionId?: string;
  correction?: string;
  sourceQuote?: string;
}

/**
 * Evaluates a student's Exit Gate comprehension answer and presented Quote Token using
 * the primary Gemini reasoning model (`gemini-4-argon` with fallback chain), or a deterministic
 * heuristic fallback when running offline.
 *
 * @param input - Student answer, presented quote token, and source reference material.
 * @returns Structured `ExitGradeResult` with `grade`, Victorian Librarian `feedback`, and optional hints/corrections.
 */
export async function gradeExitGateSubmission(input: ExitGradeInput): Promise<ExitGradeResult> {
  logFunctionCall('gradeExitGateSubmission', {
    sourceId: input.sourceId,
    question: input.question,
    presentedQuoteId: input.presentedQuoteId,
    connected: input.connected,
    studentAnswerLength: input.studentAnswer.length,
  });

  const cleanAnswer = input.studentAnswer.trim();
  if (cleanAnswer.length < 5) {
    return {
      grade: 'wrong',
      feedback:
        'The crows rustle overhead. A single word or fragment is not enough to prove comprehension, scholar — explain the mechanism in your own words.',
      rephrasedQuestion: `Take a moment to explain clearly: ${input.question}`,
      hintSectionId: findDefaultHintSectionId(input),
      correction: input.expectedAnswer,
      sourceQuote: findDefaultSupportingQuoteText(input),
    };
  }

  if (getGenAiClient()) {
    try {
      return await gradeWithGeminiReasoning(input);
    } catch (err) {
      logFunctionCall('gradeExitGateSubmission.fallbackOnError', {
        sourceId: input.sourceId,
        error: String(err),
      });
    }
  }

  return gradeDeterministically(input);
}

/**
 * Calls the Gemini reasoning model (`gemini-4-argon`) to evaluate semantic comprehension
 * and verify whether the student's selected Quote Token supports their explanation.
 *
 * @param input - Exit gate submission payload.
 * @returns Validated `ExitGradeResult`.
 */
async function gradeWithGeminiReasoning(input: ExitGradeInput): Promise<ExitGradeResult> {
  logFunctionCall('gradeWithGeminiReasoning', {
    sourceId: input.sourceId,
    presentedQuoteId: input.presentedQuoteId,
  });

  const quoteInSupportingList =
    !input.connected ||
    (Boolean(input.presentedQuoteId) && input.supportingQuoteIds.includes(input.presentedQuoteId!));

  const sectionsSummary = (input.sections ?? []).map((s) => ({
    sectionId: s.id,
    heading: s.heading,
    quotes: (s.quoteTokens ?? []).map((q) => ({ id: q.id, text: q.text })),
  }));

  const systemInstruction = `You are Head Librarian Aurelius Finch, a warm, scholarly Victorian gentleman guarding the Exit Gate of a Book World in "The Library of Worlds".
Your job is to grade a university student's comprehension answer and presented Quote Token.

Grading rules:
1. "pass": The student's written answer accurately captures the core mechanism/finding in the Expected Answer, AND (if connected=true) the Presented Quote Token genuinely supports their answer.
2. "weak_evidence": The student's written answer is conceptually right or mostly right, BUT (when connected=true) the Presented Quote Token does NOT support that claim. Do NOT scold them; warmly tell them their reasoning is sound but they must select a better Quote Token from their Satchel.
3. "partial": The student's written answer is partially right and shows real engagement (and if connected=true, has a relevant quote token), but misses an important detail. In your feedback, supply the missing nuance yourself and let them pass.
4. "wrong": The student's written answer is factually wrong, irrelevant, or misunderstands the source. Do NOT give away the full answer in feedback! Instead, give an atmospheric Victorian hint pointing them to re-read the relevant section, provide a slightly clearer rephrasedQuestion, and put the full factual explanation in "correction".

Return ONLY valid JSON matching this exact structure:
{
  "grade": "pass" | "weak_evidence" | "partial" | "wrong",
  "feedback": "2-3 sentences in character as Head Librarian Aurelius Finch",
  "rephrasedQuestion": "Optional clearer version of the question if grade is wrong",
  "hintSectionId": "ID of the section the student should re-read if grade is wrong",
  "correction": "Concise 1-2 sentence explanation of the misconception and what the source actually says (only revealed after the student eventually passes)"
}`;

  const prompt = JSON.stringify(
    {
      sourceTitle: input.sourceTitle ?? input.sourceId,
      connectedWorld: input.connected,
      exitQuestion: input.question,
      expectedAnswer: input.expectedAnswer,
      recommendedSupportingQuoteIds: input.supportingQuoteIds,
      quoteIsDesignatedSupportingQuote: quoteInSupportingList,
      studentWrittenAnswer: input.studentAnswer,
      studentPresentedQuoteId: input.presentedQuoteId ?? null,
      studentPresentedQuoteText: input.presentedQuoteText ?? null,
      availableSections: sectionsSummary,
    },
    null,
    2
  );

  const { outputText } = await runReasoningInteraction({
    action: 'exitGateGrader.grade',
    input: prompt,
    systemInstruction,
    generationConfig: {
      temperature: 0.2,
    },
  });

  const parsed = parseJsonOutput<{
    grade?: string;
    feedback?: string;
    rephrasedQuestion?: string;
    hintSectionId?: string;
    correction?: string;
  }>(outputText);

  const validGrades: ExitGrade[] = ['pass', 'weak_evidence', 'partial', 'wrong'];
  const grade: ExitGrade = validGrades.includes(parsed.grade as ExitGrade)
    ? (parsed.grade as ExitGrade)
    : gradeDeterministically(input).grade;

  const validSectionIds = new Set((input.sections ?? []).map((s) => s.id));
  const hintSectionId =
    parsed.hintSectionId && validSectionIds.has(parsed.hintSectionId)
      ? parsed.hintSectionId
      : findDefaultHintSectionId(input);

  return {
    grade,
    feedback:
      parsed.feedback?.trim() ||
      'Aurelius adjusts his spectacles and nods thoughtfully at your submission.',
    rephrasedQuestion:
      grade === 'wrong'
        ? parsed.rephrasedQuestion?.trim() || `Look closely at the text: ${input.question}`
        : undefined,
    hintSectionId: grade === 'wrong' ? hintSectionId : undefined,
    correction:
      grade === 'wrong' ? parsed.correction?.trim() || input.expectedAnswer : undefined,
    sourceQuote: grade === 'wrong' ? findDefaultSupportingQuoteText(input) : undefined,
  };
}

/**
 * Deterministic fallback grader used when offline or if the LLM call fails.
 *
 * @param input - Exit gate submission payload.
 * @returns `ExitGradeResult` based on concept keyword overlap and supporting quote ID match.
 */
export function gradeDeterministically(input: ExitGradeInput): ExitGradeResult {
  logFunctionCall('gradeDeterministically', { sourceId: input.sourceId });
  const cleanAnswer = input.studentAnswer.trim().toLowerCase();
  const validQuoteIds = Array.isArray(input.supportingQuoteIds) ? input.supportingQuoteIds : [];
  const quoteMatches =
    !input.connected || (Boolean(input.presentedQuoteId) && validQuoteIds.includes(input.presentedQuoteId!));

  const expectedWords = String(input.expectedAnswer ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5);
  const matchedKeywords = expectedWords.filter((w) => cleanAnswer.includes(w));
  const keywordRatio =
    expectedWords.length > 0 ? matchedKeywords.length / Math.min(expectedWords.length, 5) : 0.5;

  if (cleanAnswer.length >= 15 && keywordRatio >= 0.35 && quoteMatches) {
    return {
      grade: 'pass',
      feedback:
        'Splendidly reasoned! Your explanation captures the heart of the source, and your chosen Quote Token backs it up verbatim. The Great Kiskadee sings — the way back to the Hub is open.',
    };
  }

  if (cleanAnswer.length >= 15 && keywordRatio >= 0.35 && !quoteMatches) {
    return {
      grade: 'weak_evidence',
      feedback:
        'Your reasoning is sound, scholar, yet the Quote Token you presented does not substantiate that specific claim. Inspect your Satchel and present a passage that directly proves your point.',
    };
  }

  if (cleanAnswer.length >= 12 && keywordRatio >= 0.2 && quoteMatches) {
    return {
      grade: 'partial',
      feedback: `You have the right intuition and a fitting Quote Token! To complete the picture: ${input.expectedAnswer}`,
    };
  }

  return {
    grade: 'wrong',
    feedback:
      'The shadows lengthen and the crows stir. That interpretation misses what this source actually establishes. Seek the glowing inhabitant who holds the relevant section and try again.',
    rephrasedQuestion: `Look closely at the section discussing this mechanism: ${input.question}`,
    hintSectionId: findDefaultHintSectionId(input),
    correction: input.expectedAnswer,
    sourceQuote: findDefaultSupportingQuoteText(input),
  };
}

/**
 * Finds the section ID that contains the primary supporting Quote Token for the source's Exit Gate question.
 */
function findDefaultHintSectionId(input: ExitGradeInput): string | undefined {
  const targetQuoteId = input.supportingQuoteIds?.[0];
  if (!targetQuoteId || !input.sections) {
    return input.sections?.[0]?.id;
  }
  const match = input.sections.find((s) =>
    (s.quoteTokens ?? []).some((q) => q.id === targetQuoteId)
  );
  return match?.id ?? input.sections[0]?.id;
}

/**
 * Finds the verbatim text of the primary supporting Quote Token so any logged misconception
 * always references a genuine substring of the source.
 */
function findDefaultSupportingQuoteText(input: ExitGradeInput): string {
  const targetQuoteId = input.supportingQuoteIds?.[0];
  if (targetQuoteId && input.sections) {
    for (const section of input.sections) {
      const token = (section.quoteTokens ?? []).find((q) => q.id === targetQuoteId);
      if (token) {
        return token.text;
      }
    }
  }
  return input.presentedQuoteText || input.expectedAnswer;
}
