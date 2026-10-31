/**
 * @file exitGateGrader.ts
 * @description LLM-powered Exit Gate comprehension grader & automatic evidence citer for
 * "The Library of Worlds".
 * When a student attempts to leave a Book World, Head Librarian Aurelius Finch evaluates
 * the student's written (or spoken) answer in their own words.
 *
 * Grading Outcomes (`ExitGrade` = `'pass' | 'partial' | 'wrong'`):
 * - `pass`: Lenient — if the student's answer captures the key idea in their own words (even if
 *   incomplete), it passes! Returns a 1-2 sentence reply and the single best supporting quote from
 *   the source (validated as an exact substring of its section text via `isExactSubstring`).
 * - `partial`: The student touches on a related point from the source, and Aurelius briefly adds
 *   the missing key detail in 1-2 short sentences while still unlocking the exit and returning
 *   the single best supporting quote (exact substring validated).
 * - `wrong`: The student's answer is off-topic or contradicts the source. Keeps menace, crows, and
 *   `hintSectionId` glow, and withholds the supporting quote until the student passes.
 *
 * Use Cases:
 * - Invoked by `POST /api/exit-grade` in `src/server/index.ts`.
 * - Falls back gracefully to a lenient deterministic keyword grader if `GEMINI_API_KEY` is unavailable.
 */

import { logFunctionCall } from '../shared/logger';
import { isExactSubstring } from '../shared/substringValidator';
import type { ExitGrade } from '../shared/types';
import { getGenAiClient, parseJsonOutput, runReasoningInteraction } from './genaiClient';

export interface ExitGradeSectionInput {
  id: string;
  heading: string;
  text?: string;
  quoteTokens?: Array<{ id: string; text: string }>;
}

export interface ExitGradeInput {
  sourceId: string;
  sourceTitle?: string;
  question: string;
  expectedAnswer: string;
  supportingQuoteIds: string[];
  studentAnswer: string;
  connected: boolean;
  sections?: ExitGradeSectionInput[];
}

export interface ExitGradeResult {
  grade: ExitGrade;
  feedback: string;
  rephrasedQuestion?: string;
  hintSectionId?: string;
  correction?: string;
  sourceQuote?: string;
  supportingQuote?: {
    id: string;
    sectionId: string;
    text: string;
  };
}

/**
 * Evaluates a student's Exit Gate comprehension answer using `gemini-4-argon` (with fallback chain),
 * or a lenient deterministic fallback when offline.
 * On `pass` or `partial`, returns the single best supporting quote validated via `isExactSubstring`.
 *
 * @param input - Student answer and source sections/quotes.
 * @returns Structured `ExitGradeResult` with 1-2 short sentences of `feedback`.
 */
export async function gradeExitGateSubmission(input: ExitGradeInput): Promise<ExitGradeResult> {
  logFunctionCall('gradeExitGateSubmission', {
    sourceId: input.sourceId,
    question: input.question,
    connected: input.connected,
    studentAnswerLength: input.studentAnswer.length,
  });

  const cleanAnswer = input.studentAnswer.trim();
  if (cleanAnswer.length < 4) {
    return {
      grade: 'wrong',
      feedback: 'The crows stir overhead. Give me at least a brief thought in your own words, scholar.',
      rephrasedQuestion: input.question,
      hintSectionId: findDefaultHintSectionId(input),
      correction: input.expectedAnswer,
      sourceQuote: selectValidatedSupportingQuote(input)?.text ?? input.expectedAnswer,
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
 * Calls the Gemini reasoning model (`gemini-4-argon`) to leniently grade the student's answer
 * (`pass`, `partial`, or `wrong`) and select the single best verbatim supporting quote on pass/partial.
 *
 * @param input - Exit gate submission payload.
 * @returns Validated `ExitGradeResult`.
 */
async function gradeWithGeminiReasoning(input: ExitGradeInput): Promise<ExitGradeResult> {
  logFunctionCall('gradeWithGeminiReasoning', {
    sourceId: input.sourceId,
  });

  const sectionsSummary = (input.sections ?? []).map((s) => ({
    sectionId: s.id,
    heading: s.heading,
    textExcerpt: (s.text ?? '').slice(0, 900),
    quotes: (s.quoteTokens ?? []).map((q) => ({ id: q.id, text: q.text })),
  }));

  const systemInstruction = `You are Head Librarian Aurelius Finch in "The Library of Worlds".
Grade the student's comprehension answer ONLY ("pass", "partial", or "wrong").
Be LENIENT:
- "pass": If the student's answer captures the key idea in their own words, it passes—even if brief or incomplete!
- "partial": If the answer touches on a relevant idea from the source but misses the main point, let them pass and briefly supply the missing nuance.
- "wrong": Only use "wrong" if the answer is completely off-topic, nonsensical, or directly contradicts the source.

CRITICAL LENGTH RULE:
- Keep "feedback" to 1–2 SHORT sentences maximum (under 30 words). Never write long paragraphs.
- Do NOT include the quote inside "feedback" (the UI displays the quote separately).
- On "pass" or "partial", pick the single best supporting quote from the provided sections ("bestQuoteId" or an exact substring "bestQuoteText" + "bestQuoteSectionId").

Return ONLY valid JSON:
{
  "grade": "pass" | "partial" | "wrong",
  "feedback": "1-2 short sentences in character as Aurelius Finch.",
  "bestQuoteId": "ID of the best supporting quote token (if pass or partial)",
  "bestQuoteSectionId": "Section ID containing the best quote (if pass or partial)",
  "bestQuoteText": "Exact verbatim substring from that section (if pass or partial)",
  "rephrasedQuestion": "Short clearer question (only if wrong)",
  "hintSectionId": "ID of the section to re-read (only if wrong)",
  "correction": "1 short sentence explaining what the source actually says (only if wrong)"
}`;

  const prompt = JSON.stringify(
    {
      sourceTitle: input.sourceTitle ?? input.sourceId,
      exitQuestion: input.question,
      expectedAnswer: input.expectedAnswer,
      recommendedSupportingQuoteIds: input.supportingQuoteIds,
      studentWrittenAnswer: input.studentAnswer,
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
    bestQuoteId?: string;
    bestQuoteSectionId?: string;
    bestQuoteText?: string;
    rephrasedQuestion?: string;
    hintSectionId?: string;
    correction?: string;
  }>(outputText);

  const validGrades: ExitGrade[] = ['pass', 'partial', 'wrong'];
  const grade: ExitGrade = validGrades.includes(parsed.grade as ExitGrade)
    ? (parsed.grade as ExitGrade)
    : gradeDeterministically(input).grade;

  const validatedQuote = selectValidatedSupportingQuote(
    input,
    parsed.bestQuoteId,
    parsed.bestQuoteSectionId,
    parsed.bestQuoteText
  );

  const validSectionIds = new Set((input.sections ?? []).map((s) => s.id));
  const hintSectionId =
    parsed.hintSectionId && validSectionIds.has(parsed.hintSectionId)
      ? parsed.hintSectionId
      : findDefaultHintSectionId(input);

  return {
    grade,
    feedback: enforceShortFeedback(
      parsed.feedback,
      grade === 'wrong'
        ? 'Not quite, scholar. Revisit the glowing inhabitant in that section and try again.'
        : 'Quite right! You have grasped the essential point.'
    ),
    supportingQuote: grade === 'pass' || grade === 'partial' ? validatedQuote : undefined,
    rephrasedQuestion:
      grade === 'wrong'
        ? parsed.rephrasedQuestion?.trim() || input.question
        : undefined,
    hintSectionId: grade === 'wrong' ? hintSectionId : undefined,
    correction:
      grade === 'wrong' ? parsed.correction?.trim() || input.expectedAnswer : undefined,
    sourceQuote:
      grade === 'wrong' ? validatedQuote?.text ?? input.expectedAnswer : undefined,
  };
}

/**
 * Truncates feedback to at most 2 sentences so Librarian replies stay crisp for live demos.
 *
 * @param raw - Raw feedback string from the model.
 * @param fallback - Fallback 1-sentence feedback.
 * @returns Short 1-2 sentence string.
 */
function enforceShortFeedback(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) {
    return fallback;
  }
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length <= 2) {
    return cleaned;
  }
  return sentences.slice(0, 2).join(' ').trim();
}

/**
 * Selects and validates the single best supporting quote from `input.sections`.
 * Guarantees that the returned quote `.text` is an exact substring of its section `.text`
 * using `isExactSubstring` from `substringValidator.ts`.
 *
 * @param input - Exit gate submission input.
 * @param preferredQuoteId - Quote ID suggested by the LLM.
 * @param preferredSectionId - Section ID suggested by the LLM.
 * @param preferredQuoteText - Quote text suggested by the LLM.
 * @returns Validated `{ id, sectionId, text }` or `undefined` for unconnected worlds without sections.
 */
export function selectValidatedSupportingQuote(
  input: ExitGradeInput,
  preferredQuoteId?: string,
  preferredSectionId?: string,
  preferredQuoteText?: string
): { id: string; sectionId: string; text: string } | undefined {
  logFunctionCall('selectValidatedSupportingQuote', {
    sourceId: input.sourceId,
    preferredQuoteId,
    preferredSectionId,
  });

  const sections = input.sections ?? [];
  if (sections.length === 0) {
    return undefined;
  }

  // Helper to check if a candidate quote is a valid substring of its section
  const isQuoteValidInSection = (sec: ExitGradeSectionInput, quoteText: string): boolean => {
    if (!quoteText.trim()) {
      return false;
    }
    if (!sec.text) {
      return true;
    }
    return isExactSubstring(sec.text, quoteText);
  };

  // 1. Check preferredQuoteId from LLM
  if (preferredQuoteId) {
    for (const sec of sections) {
      const token = (sec.quoteTokens ?? []).find((q) => q.id === preferredQuoteId);
      if (token && isQuoteValidInSection(sec, token.text)) {
        return { id: token.id, sectionId: sec.id, text: token.text };
      }
    }
  }

  // 2. Check preferredQuoteText from LLM if it is an exact substring of a section
  if (preferredQuoteText && preferredQuoteText.trim().length >= 15) {
    const trimmed = preferredQuoteText.trim();
    const candidateSections = preferredSectionId
      ? [
          ...sections.filter((s) => s.id === preferredSectionId),
          ...sections.filter((s) => s.id !== preferredSectionId),
        ]
      : sections;
    for (const sec of candidateSections) {
      if (sec.text && isExactSubstring(sec.text, trimmed)) {
        const existingToken = (sec.quoteTokens ?? []).find((q) => q.text.trim() === trimmed);
        return {
          id: existingToken?.id ?? `${sec.id}-auto-qt`,
          sectionId: sec.id,
          text: trimmed,
        };
      }
    }
  }

  // 3. Check source's designated supportingQuoteIds
  for (const suppId of input.supportingQuoteIds ?? []) {
    for (const sec of sections) {
      const token = (sec.quoteTokens ?? []).find((q) => q.id === suppId);
      if (token && isQuoteValidInSection(sec, token.text)) {
        return { id: token.id, sectionId: sec.id, text: token.text };
      }
    }
  }

  // 4. Fallback to first validated QuoteToken across any section
  for (const sec of sections) {
    for (const token of sec.quoteTokens ?? []) {
      if (isQuoteValidInSection(sec, token.text)) {
        return { id: token.id, sectionId: sec.id, text: token.text };
      }
    }
  }

  return undefined;
}

/**
 * Lenient deterministic fallback grader used when offline or if the LLM call fails.
 *
 * @param input - Exit gate submission payload.
 * @returns `ExitGradeResult` (`pass`, `partial`, or `wrong`) with 1-2 short sentences of feedback.
 */
export function gradeDeterministically(input: ExitGradeInput): ExitGradeResult {
  logFunctionCall('gradeDeterministically', { sourceId: input.sourceId });
  const cleanAnswer = input.studentAnswer.trim().toLowerCase();

  const expectedWords = `${input.expectedAnswer} ${input.question}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  const uniqueExpected = Array.from(new Set(expectedWords));
  const matchedKeywords = uniqueExpected.filter((w) => cleanAnswer.includes(w));

  const validatedQuote = selectValidatedSupportingQuote(input);

  if (cleanAnswer.length >= 10 && matchedKeywords.length >= 1) {
    return {
      grade: 'pass',
      feedback: 'Quite right! You have captured the core idea clearly.',
      supportingQuote: validatedQuote,
    };
  }

  if (cleanAnswer.length >= 18) {
    return {
      grade: 'partial',
      feedback: `You are on the right track. Remember the key detail: ${enforceShortFeedback(input.expectedAnswer, input.expectedAnswer)}`,
      supportingQuote: validatedQuote,
    };
  }

  return {
    grade: 'wrong',
    feedback: 'Not quite, scholar. Visit the glowing inhabitant to review that section and try again.',
    rephrasedQuestion: input.question,
    hintSectionId: findDefaultHintSectionId(input),
    correction: input.expectedAnswer,
    sourceQuote: validatedQuote?.text ?? input.expectedAnswer,
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
