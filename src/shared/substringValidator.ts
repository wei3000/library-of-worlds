/**
 * @file substringValidator.ts
 * @description Server- and client-side verbatim substring validator for "The Library of Worlds".
 * Enforces the anti-hallucination requirement that every `QuoteToken.text` and every
 * NPC `followUps.verbatimLine` must be an exact substring of the parent `Section.text`.
 *
 * Use cases:
 * 1. Sample & pipeline validation: Verify that all quote tokens and verbatim follow-up lines
 *    exist verbatim inside `section.text` (with optional whitespace normalization fallback).
 * 2. Full-text highlighting: Locate the exact start and end character offsets of a quote token
 *    within a section's text so the Full-Text Modal can scroll to and highlight the passage.
 */

import { logFunctionCall } from './logger';
import type { QuoteToken, Section, Source } from './types';

/**
 * Normalizes whitespace in a string (collapsing runs of spaces/newlines to a single space)
 * for resilient substring verification when line wraps differ slightly.
 *
 * @param text - Raw input string.
 * @returns Whitespace-normalized string.
 */
export function normalizeWhitespace(text: string): string {
  logFunctionCall('normalizeWhitespace', { textLength: text.length });
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Checks whether `candidateSubstring` is an exact substring of `sectionText`.
 * First checks strict literal inclusion; if that fails due to line breaks, checks
 * whitespace-normalized inclusion.
 *
 * @param sectionText - Full text of the section.
 * @param candidateSubstring - Candidate quote token text or `verbatimLine`.
 * @returns `true` if `candidateSubstring` is a valid verbatim substring of `sectionText`.
 */
export function isExactSubstring(sectionText: string, candidateSubstring: string): boolean {
  logFunctionCall('isExactSubstring', {
    sectionTextLength: sectionText.length,
    candidateSubstring,
  });
  const trimmedCandidate = candidateSubstring.trim();
  if (!trimmedCandidate) {
    return false;
  }
  if (sectionText.includes(trimmedCandidate)) {
    return true;
  }
  return normalizeWhitespace(sectionText).includes(normalizeWhitespace(trimmedCandidate));
}

/**
 * Validates and sanitizes a `Section` so that:
 * 1. Every `QuoteToken` whose `.text` is not an exact substring of `section.text` is dropped
 *    (or replaced with a verified sentence from `section.text` if all tokens would be empty).
 * 2. `section.followUps.verbatimLine` is verified as an exact substring of `section.text`,
 *    falling back to the first verified quote token or first sentence of `section.text`.
 *
 * @param section - The section to validate.
 * @param sourceId - Parent source identifier.
 * @returns A validated `Section` guaranteed to contain only verbatim substrings.
 */
export function validateSectionSubstrings(section: Section, sourceId: string): Section {
  logFunctionCall('validateSectionSubstrings', {
    sectionId: section.id,
    sourceId,
    quoteTokenCount: section.quoteTokens.length,
  });

  const validTokens: QuoteToken[] = section.quoteTokens.filter((token) =>
    isExactSubstring(section.text, token.text)
  );

  // If no tokens survived validation, extract the first sentence of section.text verbatim
  if (validTokens.length === 0 && section.text.trim().length > 0) {
    const firstSentenceMatch = section.text.trim().match(/^[^.!?]+[.!?]/);
    const fallbackText = firstSentenceMatch
      ? firstSentenceMatch[0].trim()
      : section.text.trim().slice(0, 140);
    validTokens.push({
      id: `${section.id}-fallback-q1`,
      sourceId,
      sectionId: section.id,
      text: fallbackText,
    });
  }

  let verbatimLine = section.followUps.verbatimLine;
  if (!isExactSubstring(section.text, verbatimLine)) {
    verbatimLine = validTokens[0]?.text ?? section.text.trim().slice(0, 120);
  }

  return {
    ...section,
    quoteTokens: validTokens,
    followUps: {
      ...section.followUps,
      verbatimLine,
    },
  };
}

/**
 * Validates all sections of a `Source` to guarantee that every `QuoteToken.text`
 * and `followUps.verbatimLine` is an exact substring of its section text.
 *
 * @param source - Source object to validate.
 * @returns Validated copy of `Source`.
 */
export function validateSourceSubstrings(source: Source): Source {
  logFunctionCall('validateSourceSubstrings', { sourceId: source.id, title: source.title });
  if (!source.sections || source.sections.length === 0) {
    return source;
  }
  return {
    ...source,
    sections: source.sections.map((sec) => validateSectionSubstrings(sec, source.id)),
  };
}
