/**
 * @file verifier.ts
 * @description Parallel Bibliographic & URL Verifier for "The Library of Worlds".
 * Checks each candidate source proposed by the Research Agent against authoritative
 * external registries — Crossref API, arXiv API, Semantic Scholar Graph API, and live HTTP
 * resolution — using a strict per-call timeout (`APP_CONFIG.pipeline.externalCallTimeoutMs`, 10s).
 *
 * Unresolvable or hallucinated citations are discarded and counted toward `ghostCitationCount`,
 * protecting first-year students from AI-invented references.
 *
 * Use cases:
 * 1. Verifying academic papers by arXiv ID, DOI, or bibliographic title search.
 * 2. Enriching verified sources with real metadata: citation counts, publication year,
 *    venue name, canonical URL, open-access PDF/HTML link, and abstract.
 * 3. Verifying practitioner blogs and documentation pages via live HTTP status and title checks.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { VenueType } from '../shared/types';
import { cleanArxivId, cleanDoiString, type CandidateSourceProposal } from './researchAgent';

export interface VerifiedCandidate {
  title: string;
  authors: string[];
  year?: number;
  url: string;
  doi?: string;
  arxivId?: string;
  venue?: string;
  venueTypeHint: VenueType;
  citationCount?: number;
  theme: string;
  summary: string;
  abstract: string;
  openAccessUrl?: string;
  preFetchedHtml?: string;
}

export interface VerificationBatchResult {
  verifiedCandidates: VerifiedCandidate[];
  ghostCitationCount: number;
  dismissedTitles: string[];
}

const POLITE_USER_AGENT =
  'LibraryOfWorlds/1.0 (https://github.com/wei3000/library-of-worlds; mailto:william.chia22@imperial.ac.uk)';

/**
 * Tokenizes a title into lowercase alphanumeric words (>= 3 chars) and computes
 * the Jaccard/overlap similarity between two titles.
 *
 * @param titleA - First title string.
 * @param titleB - Second title string.
 * @returns Similarity score between 0.0 and 1.0.
 */
export function computeTitleSimilarity(titleA: string, titleB: string): number {
  logFunctionCall('computeTitleSimilarity', { titleA, titleB });
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'from', 'with', 'using'].includes(w))
    );

  const setA = tokenize(titleA);
  const setB = tokenize(titleB);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) {
      intersection++;
    }
  }

  const minSize = Math.min(setA.size, setB.size);
  return intersection / minSize;
}

/**
 * Queries the arXiv Atom API (`export.arxiv.org/api/query`) by `arxivId` or title.
 * Enforces the 10-second timeout from `APP_CONFIG.pipeline.externalCallTimeoutMs`.
 *
 * @param arxivId - Optional clean arXiv ID (`YYYY.NNNNN`).
 * @param title - Candidate paper title to validate against or search for.
 * @returns Verified arXiv metadata if matched, or `null`.
 */
async function verifyViaArxiv(
  arxivId: string | undefined,
  title: string
): Promise<{
  title: string;
  authors: string[];
  year?: number;
  arxivId: string;
  abstract: string;
  doi?: string;
} | null> {
  logFunctionCall('verifyViaArxiv', { arxivId, title });
  const timeoutMs = APP_CONFIG.pipeline.externalCallTimeoutMs;

  try {
    const queryUrl = arxivId
      ? `${APP_CONFIG.pipeline.externalApis.arxivQueryUrl}?id_list=${encodeURIComponent(arxivId)}`
      : `${APP_CONFIG.pipeline.externalApis.arxivQueryUrl}?search_query=ti:${encodeURIComponent(
          `"${title.replace(/["?:]/g, ' ').trim()}"`
        )}&max_results=3`;

    const res = await fetch(queryUrl, {
      headers: { 'User-Agent': POLITE_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return null;
    }

    const xml = await res.text();
    const entries = xml.split('<entry>').slice(1);
    for (const entry of entries) {
      const entryTitleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i);
      const entrySummaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/i);
      const entryIdMatch = entry.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<\s]+)<\/id>/i);
      const publishedMatch = entry.match(/<published>(\d{4})-/i);
      const doiMatch = entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i);

      if (!entryTitleMatch || !entryIdMatch) {
        continue;
      }

      const foundTitle = entryTitleMatch[1].replace(/\s+/g, ' ').trim();
      const similarity = computeTitleSimilarity(title, foundTitle);
      if (similarity < 0.45) {
        continue;
      }

      const rawId = entryIdMatch[1].replace(/v\d+$/i, '').trim();
      const authorMatches = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/gi)].map((m) =>
        m[1].trim()
      );
      const year = publishedMatch ? Number.parseInt(publishedMatch[1], 10) : undefined;
      const abstract = entrySummaryMatch
        ? entrySummaryMatch[1].replace(/\s+/g, ' ').trim()
        : '';

      return {
        title: foundTitle,
        authors: authorMatches.length > 0 ? authorMatches.slice(0, 6) : ['arXiv Author'],
        year,
        arxivId: rawId,
        abstract,
        doi: doiMatch ? doiMatch[1].trim() : undefined,
      };
    }

    // If the candidate supplied a wrong arXiv ID for a real paper, fall back to title search on arXiv
    if (arxivId) {
      return verifyViaArxiv(undefined, title);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Queries the Crossref Works API by DOI or bibliographic title search.
 * Enforces the 10-second timeout from `APP_CONFIG.pipeline.externalCallTimeoutMs`.
 *
 * @param doi - Optional candidate DOI.
 * @param title - Candidate paper title.
 * @returns Verified Crossref metadata including `is-referenced-by-count` citations, or `null`.
 */
async function verifyViaCrossref(
  doi: string | undefined,
  title: string
): Promise<{
  title: string;
  authors: string[];
  year?: number;
  doi: string;
  venue?: string;
  citationCount?: number;
  abstract?: string;
  url?: string;
} | null> {
  logFunctionCall('verifyViaCrossref', { doi, title });
  const timeoutMs = APP_CONFIG.pipeline.externalCallTimeoutMs;

  const parseCrossrefItem = (item: Record<string, unknown>): {
    title: string;
    authors: string[];
    year?: number;
    doi: string;
    venue?: string;
    citationCount?: number;
    abstract?: string;
    url?: string;
  } | null => {
    const titles = item.title as string[] | undefined;
    const foundTitle = Array.isArray(titles) && titles[0] ? String(titles[0]).replace(/<[^>]+>/g, '').trim() : '';
    if (!foundTitle || computeTitleSimilarity(title, foundTitle) < 0.45) {
      return null;
    }

    const itemDoi = typeof item.DOI === 'string' ? item.DOI : '';
    if (!itemDoi) {
      return null;
    }

    const rawAuthors = Array.isArray(item.author) ? (item.author as Array<Record<string, string>>) : [];
    const authors = rawAuthors
      .map((a) => [a.given, a.family].filter(Boolean).join(' ').trim())
      .filter(Boolean)
      .slice(0, 6);

    const container = item['container-title'] as string[] | undefined;
    const venue = Array.isArray(container) && container[0] ? String(container[0]).trim() : undefined;

    const issued = item.issued as { 'date-parts'?: number[][] } | undefined;
    const year = issued?.['date-parts']?.[0]?.[0];

    const citationCount =
      typeof item['is-referenced-by-count'] === 'number'
        ? (item['is-referenced-by-count'] as number)
        : undefined;

    const rawAbstract = typeof item.abstract === 'string' ? item.abstract : '';
    const cleanAbstract = rawAbstract ? rawAbstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined;

    return {
      title: foundTitle,
      authors: authors.length > 0 ? authors : ['Published Author'],
      year,
      doi: itemDoi,
      venue,
      citationCount,
      abstract: cleanAbstract,
      url: typeof item.URL === 'string' ? item.URL : `https://doi.org/${itemDoi}`,
    };
  };

  try {
    // 1. Try direct DOI lookup if provided
    if (doi) {
      const doiRes = await fetch(
        `${APP_CONFIG.pipeline.externalApis.crossrefWorksUrl}/${encodeURIComponent(doi)}`,
        {
          headers: { 'User-Agent': POLITE_USER_AGENT },
          signal: AbortSignal.timeout(timeoutMs),
        }
      );
      if (doiRes.ok) {
        const data = (await doiRes.json()) as { message?: Record<string, unknown> };
        if (data.message) {
          const matched = parseCrossrefItem(data.message);
          if (matched) {
            return matched;
          }
        }
      }
    }

    // 2. Bibliographic title search on Crossref
    const searchUrl = `${APP_CONFIG.pipeline.externalApis.crossrefWorksUrl}?query.bibliographic=${encodeURIComponent(
      title
    )}&rows=3`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': POLITE_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!searchRes.ok) {
      return null;
    }

    const searchData = (await searchRes.json()) as {
      message?: { items?: Array<Record<string, unknown>> };
    };
    const items = searchData.message?.items ?? [];
    for (const item of items) {
      const matched = parseCrossrefItem(item);
      if (matched) {
        return matched;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Queries the Semantic Scholar Graph API (`paper/search`) by paper title.
 * Enforces the 10-second timeout from `APP_CONFIG.pipeline.externalCallTimeoutMs`.
 *
 * @param title - Candidate paper title.
 * @returns Verified Semantic Scholar metadata if found, or `null`.
 */
async function verifyViaSemanticScholar(title: string): Promise<{
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citationCount?: number;
  doi?: string;
  arxivId?: string;
  abstract?: string;
  openAccessPdfUrl?: string;
  url?: string;
} | null> {
  logFunctionCall('verifyViaSemanticScholar', { title });
  const timeoutMs = APP_CONFIG.pipeline.externalCallTimeoutMs;

  try {
    const queryUrl = `${
      APP_CONFIG.pipeline.externalApis.semanticScholarSearchUrl
    }?query=${encodeURIComponent(
      title
    )}&limit=3&fields=title,authors,year,venue,citationCount,externalIds,openAccessPdf,abstract,url`;

    const res = await fetch(queryUrl, {
      headers: { 'User-Agent': POLITE_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return null;
    }

    const payload = (await res.json()) as {
      data?: Array<{
        title?: string;
        authors?: Array<{ name?: string }>;
        year?: number;
        venue?: string;
        citationCount?: number;
        externalIds?: { DOI?: string; ArXiv?: string };
        openAccessPdf?: { url?: string };
        abstract?: string;
        url?: string;
      }>;
    };

    for (const paper of payload.data ?? []) {
      if (!paper.title || computeTitleSimilarity(title, paper.title) < 0.45) {
        continue;
      }
      const authors = (paper.authors ?? [])
        .map((a) => a.name?.trim() ?? '')
        .filter(Boolean)
        .slice(0, 6);

      return {
        title: paper.title.trim(),
        authors: authors.length > 0 ? authors : ['Scholarly Author'],
        year: typeof paper.year === 'number' ? paper.year : undefined,
        venue: paper.venue?.trim() || undefined,
        citationCount: typeof paper.citationCount === 'number' ? paper.citationCount : undefined,
        doi: paper.externalIds?.DOI,
        arxivId: paper.externalIds?.ArXiv,
        abstract: paper.abstract?.trim() || undefined,
        openAccessPdfUrl: paper.openAccessPdf?.url,
        url: paper.url,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verifies a web page, blog post, or documentation URL by performing a live HTTP GET
 * within the 10-second timeout and checking that it resolves to a valid HTML document.
 *
 * @param url - Candidate web URL.
 * @returns Object with resolved status, extracted `<title>`, and raw HTML if valid, or `null`.
 */
async function verifyViaLiveWebUrl(url: string): Promise<{
  resolvedUrl: string;
  pageTitle?: string;
  html: string;
} | null> {
  logFunctionCall('verifyViaLiveWebUrl', { url });
  const timeoutMs = APP_CONFIG.pipeline.externalCallTimeoutMs;

  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return null;
    }

    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return null;
    }

    const html = await res.text();
    if (!html || html.length < 250) {
      return null;
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : undefined;
    if (
      pageTitle &&
      (pageTitle.toLowerCase().includes('404 not found') ||
        pageTitle.toLowerCase() === 'page not found')
    ) {
      return null;
    }

    return {
      resolvedUrl: res.url || url,
      pageTitle,
      html,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies a single `CandidateSourceProposal` by querying arXiv, Crossref, Semantic Scholar,
 * and live HTTP in parallel. Returns a `VerifiedCandidate` if confirmed, or `null` if it is
 * an unresolvable "ghost citation".
 *
 * @param candidate - Candidate source proposed by the research agent.
 * @returns Enriched `VerifiedCandidate`, or `null` when discarded as a ghost citation.
 */
export async function verifySingleCandidate(
  candidate: CandidateSourceProposal
): Promise<VerifiedCandidate | null> {
  logFunctionCall('verifySingleCandidate', {
    title: candidate.title,
    url: candidate.url,
    doi: candidate.doi,
    arxivId: candidate.arxivId,
    venueTypeHint: candidate.venueTypeHint,
  });

  const arxivIdHint = cleanArxivId(candidate.arxivId, candidate.url);
  const doiHint = cleanDoiString(candidate.doi, candidate.url);
  const isWebSource =
    !arxivIdHint &&
    !doiHint &&
    (candidate.venueTypeHint === 'blog_forum_qa' ||
      candidate.venueTypeHint === 'tutorial_docs_news');

  // Run appropriate checks in parallel
  const [arxivResult, crossrefResult, s2Result, webResult] = await Promise.all([
    arxivIdHint ||
    candidate.venueTypeHint === 'preprint_workshop' ||
    candidate.venueTypeHint === 'peer_reviewed' ||
    candidate.venueTypeHint === 'survey_review_textbook'
      ? verifyViaArxiv(arxivIdHint, candidate.title)
      : Promise.resolve(null),
    !isWebSource ? verifyViaCrossref(doiHint, candidate.title) : Promise.resolve(null),
    !isWebSource ? verifyViaSemanticScholar(candidate.title) : Promise.resolve(null),
    isWebSource ? verifyViaLiveWebUrl(candidate.url) : Promise.resolve(null),
  ]);

  // Case 1: Academic verification succeeded via arXiv, Crossref, or Semantic Scholar
  if (arxivResult || crossrefResult || s2Result) {
    const finalArxivId =
      arxivResult?.arxivId || s2Result?.arxivId || arxivIdHint || undefined;
    const finalDoi = crossrefResult?.doi || s2Result?.doi || arxivResult?.doi || undefined;
    const finalTitle =
      crossrefResult?.title || arxivResult?.title || s2Result?.title || candidate.title;
    const finalAuthors =
      crossrefResult?.authors ||
      arxivResult?.authors ||
      s2Result?.authors ||
      candidate.authors;
    const finalYear =
      crossrefResult?.year || arxivResult?.year || s2Result?.year || candidate.year;
    const finalVenue =
      crossrefResult?.venue ||
      s2Result?.venue ||
      (finalArxivId ? 'arXiv' : candidate.venue);
    const finalCitations =
      s2Result?.citationCount ?? crossrefResult?.citationCount ?? undefined;
    const finalAbstract =
      arxivResult?.abstract ||
      s2Result?.abstract ||
      crossrefResult?.abstract ||
      candidate.summary;

    const canonicalUrl = finalArxivId
      ? `https://arxiv.org/abs/${finalArxivId}`
      : finalDoi
      ? `https://doi.org/${finalDoi}`
      : crossrefResult?.url || s2Result?.url || candidate.url;

    return {
      title: finalTitle,
      authors: finalAuthors,
      year: finalYear,
      url: canonicalUrl,
      doi: finalDoi,
      arxivId: finalArxivId,
      venue: finalVenue,
      venueTypeHint: candidate.venueTypeHint,
      citationCount: finalCitations,
      theme: candidate.theme,
      summary: candidate.summary,
      abstract: finalAbstract,
      openAccessUrl: finalArxivId
        ? `${APP_CONFIG.pipeline.externalApis.ar5ivHtmlBaseUrl}/${finalArxivId}`
        : s2Result?.openAccessPdfUrl,
    };
  }

  // Case 2: Web / blog / documentation URL resolved directly
  if (webResult) {
    return {
      title: candidate.title,
      authors: candidate.authors,
      year: candidate.year,
      url: webResult.resolvedUrl,
      venue: candidate.venue || new URL(webResult.resolvedUrl).hostname,
      venueTypeHint: candidate.venueTypeHint,
      theme: candidate.theme,
      summary: candidate.summary,
      abstract: '',
      preFetchedHtml: webResult.html,
    };
  }

  // Case 3: Academic candidate that didn't match APIs — try live URL resolution ONLY if it's a tutorial/doc
  if (
    candidate.venueTypeHint === 'blog_forum_qa' ||
    candidate.venueTypeHint === 'tutorial_docs_news'
  ) {
    const fallbackWeb = await verifyViaLiveWebUrl(candidate.url);
    if (fallbackWeb) {
      return {
        title: candidate.title,
        authors: candidate.authors,
        year: candidate.year,
        url: fallbackWeb.resolvedUrl,
        venue: candidate.venue || new URL(fallbackWeb.resolvedUrl).hostname,
        venueTypeHint: candidate.venueTypeHint,
        theme: candidate.theme,
        summary: candidate.summary,
        abstract: '',
        preFetchedHtml: fallbackWeb.html,
      };
    }
  }

  // Unresolvable -> Ghost Citation!
  return null;
}

/**
 * Verifies a batch of candidate sources in parallel, deduplicating by title/URL/DOI
 * and tallying any unresolvable candidates as `ghostCitationCount`.
 *
 * @param candidates - Array of candidate sources from the Research Agent.
 * @returns Verified candidates and the count of dismissed ghost citations.
 */
export async function verifyCandidateBatch(
  candidates: CandidateSourceProposal[]
): Promise<VerificationBatchResult> {
  logFunctionCall('verifyCandidateBatch', { candidateCount: candidates.length });

  const outcomes = await Promise.all(
    candidates.map(async (candidate) => {
      const verified = await verifySingleCandidate(candidate);
      return { candidate, verified };
    })
  );

  const verifiedCandidates: VerifiedCandidate[] = [];
  const dismissedTitles: string[] = [];
  const seenKeys = new Set<string>();

  for (const { candidate, verified } of outcomes) {
    if (!verified) {
      dismissedTitles.push(candidate.title);
      continue;
    }

    const dedupeKey = (
      verified.doi ||
      verified.arxivId ||
      verified.title.toLowerCase().replace(/[^a-z0-9]/g, '')
    ).toLowerCase();

    if (seenKeys.has(dedupeKey)) {
      continue;
    }
    seenKeys.add(dedupeKey);
    verifiedCandidates.push(verified);
  }

  return {
    verifiedCandidates,
    ghostCitationCount: dismissedTitles.length,
    dismissedTitles,
  };
}
