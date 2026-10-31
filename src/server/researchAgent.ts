/**
 * @file researchAgent.ts
 * @description Grounded Research Agent for "The Library of Worlds".
 * Uses Gemini (`gemini-4-argon` with automatic fallback to `gemini-3.8-flash`) combined with
 * Google Search grounding (`tools: [{ type: "google_search" }]`) and structured JSON schema
 * output to propose 6-10 real candidate sources and 3-5 thematic library aisles for the
 * student's research question.
 *
 * Use cases:
 * 1. Milestone 2 pipeline: Given a student's question, searches live scholarly and technical
 *    web sources to assemble a diverse reading list (from practitioner blogs and official docs
 *    to arXiv preprints, peer-reviewed papers, and authoritative survey papers).
 * 2. Feeding the Verifier (`verifier.ts`): Supplies candidate titles, URLs, DOIs, and arXiv IDs
 *    that will be strictly checked against Crossref, Semantic Scholar, arXiv, and live HTTP.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { VenueType } from '../shared/types';
import { parseJsonOutput, runReasoningInteraction } from './genaiClient';

export interface CandidateSourceProposal {
  title: string;
  authors: string[];
  year?: number;
  url: string;
  doi?: string;
  arxivId?: string;
  venue?: string;
  venueTypeHint: VenueType;
  theme: string;
  summary: string;
}

export interface ResearchAgentOutput {
  themes: string[];
  candidates: CandidateSourceProposal[];
}

const RESEARCH_AGENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      description: '3 to 5 thematic library aisle names for grouping the sources.',
      items: { type: 'string' },
    },
    candidates: {
      type: 'array',
      description: '7 to 9 real, verifiable candidate sources spanning blogs, docs, arXiv preprints, peer-reviewed papers, and surveys.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Exact title of the paper, documentation page, or article.' },
          authors: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of author names or organization name.',
          },
          year: {
            type: 'integer',
            description: 'Publication year if known (omit or 0 for undated documentation pages).',
          },
          url: {
            type: 'string',
            description: 'Direct, canonical URL (e.g. https://arxiv.org/abs/..., official docs URL, or DOI URL).',
          },
          doi: {
            type: 'string',
            description: 'Exact DOI (e.g. 10.1038/...) if this is a published academic paper, otherwise empty string.',
          },
          arxivId: {
            type: 'string',
            description: 'Exact arXiv identifier (e.g. 1503.03832 or 2305.12345) if available on arXiv, otherwise empty string.',
          },
          venue: {
            type: 'string',
            description: 'Journal, conference, preprint server, or website name.',
          },
          venueTypeHint: {
            type: 'string',
            enum: [
              'blog_forum_qa',
              'tutorial_docs_news',
              'preprint_workshop',
              'peer_reviewed',
              'survey_review_textbook',
            ],
          },
          theme: {
            type: 'string',
            description: 'Must match one of the 3-5 aisle themes.',
          },
          summary: {
            type: 'string',
            description: '1-2 sentence explanation of how this source helps answer the research question.',
          },
        },
        required: ['title', 'authors', 'url', 'venueTypeHint', 'theme', 'summary'],
      },
    },
  },
  required: ['themes', 'candidates'],
};

/**
 * Queries the Gemini reasoning model with Google Search grounding to propose 7-9
 * candidate sources across all five literature tiers for the student's question.
 *
 * @param question - The research question posed by the student to the Head Librarian.
 * @returns Grounded list of candidate sources and 3-5 aisle themes.
 */
export async function proposeCandidateSources(question: string): Promise<ResearchAgentOutput> {
  logFunctionCall('proposeCandidateSources', { question });

  const prompt = `You are the Chief Bibliographer of a Victorian research library helping a first-year university student investigate the following research question:

"${question}"

Use Google Search to find 8 REAL, existing, verifiable sources that together teach the student how to approach this question from first principles up to advanced research literature.

CRITICAL REQUIREMENTS:
1. Every source MUST be real and verifiable via arXiv, Crossref, Semantic Scholar, or a live public URL.
2. Include a deliberate pedagogical progression across these categories:
   - 1 practitioner blog post, Q&A thread, or accessible explainer article (venueTypeHint: "blog_forum_qa") with a real, stable public URL.
   - 1 official library documentation page or hands-on technical tutorial, e.g. scikit-learn.org, pytorch.org, or similar stable documentation (venueTypeHint: "tutorial_docs_news").
   - 3 to 4 open-access arXiv papers (venueTypeHint: "preprint_workshop" or "peer_reviewed") that have REAL arXiv IDs (format YYYY.NNNNN, e.g. "1811.12808" or "1503.03832") and URL "https://arxiv.org/abs/<arxivId>" so our library can fetch their full text from arXiv.
   - 1 to 2 peer-reviewed journal or conference papers with real DOIs (venueTypeHint: "peer_reviewed").
   - 1 highly cited survey or comprehensive review paper on the topic (venueTypeHint: "survey_review_textbook"), ideally also with an arXiv ID or DOI.
3. Group all candidates into 3 to 5 evocative thematic aisle names (returned in \`themes\`, and each candidate's \`theme\` must be one of those strings).
4. Return strictly valid JSON matching the requested schema.`;

  try {
    const { outputText } = await runReasoningInteraction({
      action: 'proposeCandidateSources_grounded',
      input: prompt,
      tools: [{ type: 'google_search' }],
      responseFormat: RESEARCH_AGENT_SCHEMA,
      modelsToTry: [
        APP_CONFIG.models.reasoningPrimary,
        APP_CONFIG.models.reasoningFallback,
      ],
    });

    const parsed = parseJsonOutput<ResearchAgentOutput>(outputText);
    return sanitizeResearchAgentOutput(parsed);
  } catch (err) {
    // Fallback without combining tools+schema in case a fallback model rejects both together
    const { outputText } = await runReasoningInteraction({
      action: 'proposeCandidateSources_schemaFallback',
      input: prompt,
      responseFormat: RESEARCH_AGENT_SCHEMA,
      modelsToTry: [
        APP_CONFIG.models.reasoningFallback,
        APP_CONFIG.models.reasoningPrimary,
      ],
    });

    const parsed = parseJsonOutput<ResearchAgentOutput>(outputText);
    return sanitizeResearchAgentOutput(parsed);
  }
}

/**
 * Normalizes and cleans the raw `ResearchAgentOutput` from the model,
 * stripping empty strings from optional `doi`/`arxivId`/`year` fields.
 *
 * @param raw - Parsed JSON output from the research agent.
 * @returns Sanitized `ResearchAgentOutput`.
 */
function sanitizeResearchAgentOutput(raw: ResearchAgentOutput): ResearchAgentOutput {
  logFunctionCall('sanitizeResearchAgentOutput', {
    themeCount: raw.themes?.length ?? 0,
    candidateCount: raw.candidates?.length ?? 0,
  });

  const themes =
    Array.isArray(raw.themes) && raw.themes.length >= 2
      ? raw.themes.slice(0, 5)
      : ['Foundations & Metrics', 'Unsupervised Discovery', 'Open-Set Evaluation'];

  const candidates: CandidateSourceProposal[] = (raw.candidates ?? [])
    .filter((c) => Boolean(c && c.title && c.url))
    .slice(0, 10)
    .map((c) => {
      const cleanArxiv = cleanArxivId(c.arxivId, c.url);
      const cleanDoi = cleanDoiString(c.doi, c.url);
      const validYear =
        typeof c.year === 'number' && c.year >= 1950 && c.year <= 2027 ? c.year : undefined;
      const assignedTheme = themes.includes(c.theme) ? c.theme : themes[0];

      return {
        title: c.title.trim(),
        authors: Array.isArray(c.authors) && c.authors.length > 0 ? c.authors : ['Research Collective'],
        year: validYear,
        url: cleanArxiv ? `https://arxiv.org/abs/${cleanArxiv}` : c.url.trim(),
        doi: cleanDoi,
        arxivId: cleanArxiv,
        venue: c.venue?.trim() || undefined,
        venueTypeHint: c.venueTypeHint || 'preprint_workshop',
        theme: assignedTheme,
        summary: c.summary?.trim() || c.title.trim(),
      };
    });

  return { themes, candidates };
}

/**
 * Extracts a clean `YYYY.NNNNN` arXiv identifier from an explicit `arxivId` or `arxiv.org` URL.
 *
 * @param arxivId - Raw arXiv ID string from model.
 * @param url - Candidate URL.
 * @returns Clean arXiv ID or `undefined`.
 */
export function cleanArxivId(arxivId?: string, url?: string): string | undefined {
  logFunctionCall('cleanArxivId', { arxivId, url });
  if (arxivId && arxivId.trim()) {
    const match = arxivId.trim().match(/\b(\d{4}\.\d{4,5})(?:v\d+)?\b/);
    if (match) {
      return match[1];
    }
  }
  if (url && /(?:arxiv\.org|ar5iv)/i.test(url)) {
    const match = url.match(/\b(\d{4}\.\d{4,5})(?:v\d+)?\b/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

/**
 * Extracts a clean `10.xxxx/...` DOI string from an explicit `doi` field or `doi.org` URL.
 *
 * @param doi - Raw DOI string from model.
 * @param url - Candidate URL.
 * @returns Clean DOI or `undefined`.
 */
export function cleanDoiString(doi?: string, url?: string): string | undefined {
  logFunctionCall('cleanDoiString', { doi, url });
  const raw = (doi?.trim() || url?.trim() || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  const match = raw.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i);
  return match ? match[1].replace(/[.,;]+$/, '') : undefined;
}
