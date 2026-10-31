/**
 * @file textExtractor.ts
 * @description Parallel Full-Text Fetcher & HTML Article Extractor for "The Library of Worlds".
 * Retrieves open-access full text for verified arXiv preprints (via `ar5iv` and `arxiv.org/html`)
 * and verified web/documentation sources, stripping navigation, scripts, styles, and ads into
 * clean readable prose.
 *
 * Any source that is behind a publisher paywall, lacks open-access HTML, or times out after
 * `APP_CONFIG.pipeline.externalCallTimeoutMs` (10s) gracefully becomes an Unconnected World
 * (`connected: false`) rather than failing the pipeline. Never bypasses paywalls.
 *
 * Use cases:
 * 1. Extracting clean article text from arXiv HTML mirrors (`ar5iv.labs.arxiv.org` / `arxiv.org/html`).
 * 2. Extracting main prose from pre-fetched blog, tutorial, and official documentation HTML.
 * 3. Determining `connected: true` vs `connected: false` for every verified source in parallel.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { VerifiedCandidate } from './verifier';

export interface ExtractedSourceText {
  connected: boolean;
  fullText: string;
  licence: string;
}

/**
 * Strips `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, `<math>`, and `<svg>`
 * blocks from raw HTML, extracts paragraph and heading blocks, decodes HTML entities, and
 * normalizes whitespace into clean prose paragraphs.
 *
 * @param html - Raw HTML document string.
 * @returns Clean plain-text article body capped at `maxSourceTextCharsForExtraction`.
 */
export function extractMainTextFromHtml(html: string): string {
  logFunctionCall('extractMainTextFromHtml', { htmlLength: html.length });

  // Prefer <article> or <main> content when available
  const articleMatch =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const targetHtml =
    articleMatch && articleMatch[1].length > 1200 ? articleMatch[1] : html;

  const withoutNoise = targetHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<math[\s\S]*?<\/math>/gi, '[formula]')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Extract headings and paragraphs to preserve document flow
  const blockMatches = [
    ...withoutNoise.matchAll(/<(h[1-4]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi),
  ];

  let rawBlocks: string[];
  if (blockMatches.length >= 5) {
    rawBlocks = blockMatches
      .map((m) => {
        const tag = m[1].toLowerCase();
        const inner = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim();
        if (!inner) {
          return '';
        }
        if (tag.startsWith('h')) {
          return `\n## ${inner}\n`;
        }
        return inner.length >= 40 ? inner : '';
      })
      .filter(Boolean);
  } else {
    const plain = decodeHtmlEntities(withoutNoise.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    rawBlocks = [plain];
  }

  const combined = rawBlocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return combined.slice(0, APP_CONFIG.pipeline.maxSourceTextCharsForExtraction);
}

/**
 * Decodes standard HTML character entities into plain Unicode characters.
 *
 * @param text - String containing HTML entities.
 * @returns Decoded plain text string.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number.parseInt(dec, 10)));
}

/**
 * Attempts to fetch open-access HTML full text for an arXiv identifier from
 * `ar5iv.labs.arxiv.org` or `arxiv.org/html` within the 10-second timeout.
 *
 * @param arxivId - Clean arXiv identifier (`YYYY.NNNNN`).
 * @returns Clean extracted text if >= `minConnectedTextLength`, or `null`.
 */
async function fetchArxivFullText(arxivId: string): Promise<string | null> {
  logFunctionCall('fetchArxivFullText', { arxivId });
  const timeoutMs = APP_CONFIG.pipeline.externalCallTimeoutMs;

  const candidateUrls = [
    `${APP_CONFIG.pipeline.externalApis.ar5ivHtmlBaseUrl}/${arxivId}`,
    `${APP_CONFIG.pipeline.externalApis.arxivHtmlBaseUrl}/${arxivId}`,
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent':
            'LibraryOfWorlds/1.0 (https://github.com/wei3000/library-of-worlds; mailto:william.chia22@imperial.ac.uk)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        continue;
      }

      const html = await res.text();
      // Ensure ar5iv didn't redirect to an abstract-only fallback page
      if (html.includes('No HTML version available') || html.length < 1500) {
        continue;
      }

      const text = extractMainTextFromHtml(html);
      if (text.length >= APP_CONFIG.pipeline.minConnectedTextLength) {
        return text;
      }
    } catch {
      // Timeout or network error -> try next mirror or fall back to unconnected
    }
  }

  return null;
}

/**
 * Fetches or extracts full text for a single `VerifiedCandidate`.
 * Never throws; any timeout or missing full text returns `connected: false`.
 *
 * @param candidate - Verified candidate source.
 * @returns `ExtractedSourceText` indicating whether the source is a connected world.
 */
export async function extractTextForCandidate(
  candidate: VerifiedCandidate
): Promise<ExtractedSourceText> {
  logFunctionCall('extractTextForCandidate', {
    title: candidate.title,
    arxivId: candidate.arxivId,
    hasPreFetchedHtml: Boolean(candidate.preFetchedHtml),
  });

  // 1. Pre-fetched HTML from live web/blog/documentation verification
  if (candidate.preFetchedHtml) {
    const extracted = extractMainTextFromHtml(candidate.preFetchedHtml);
    if (extracted.length >= APP_CONFIG.pipeline.minConnectedTextLength) {
      return {
        connected: true,
        fullText: extracted,
        licence: `Web source attribution — ${candidate.url}`,
      };
    }
  }

  // 2. arXiv paper -> fetch HTML full text from ar5iv / arxiv.org/html
  if (candidate.arxivId) {
    const arxivText = await fetchArxivFullText(candidate.arxivId);
    if (arxivText) {
      return {
        connected: true,
        fullText: arxivText,
        licence: `arXiv Open Access (${candidate.arxivId}) — CC BY / arXiv non-exclusive licence`,
      };
    }
    // If arXiv HTML isn't rendered yet, check if the arXiv abstract itself is rich enough
    // or mark as unconnected per MVP spec if full text is unavailable.
  }

  // 3. Web/tutorial source without preFetchedHtml -> attempt 10s HTTP fetch
  if (
    !candidate.doi &&
    (candidate.venueTypeHint === 'blog_forum_qa' ||
      candidate.venueTypeHint === 'tutorial_docs_news')
  ) {
    try {
      const res = await fetch(candidate.url, {
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(APP_CONFIG.pipeline.externalCallTimeoutMs),
      });
      if (res.ok) {
        const html = await res.text();
        const extracted = extractMainTextFromHtml(html);
        if (extracted.length >= APP_CONFIG.pipeline.minConnectedTextLength) {
          return {
            connected: true,
            fullText: extracted,
            licence: `Public web documentation — ${candidate.url}`,
          };
        }
      }
    } catch {
      // Timeout -> becomes unconnected world
    }
  }

  // 4. Unconnected world (publisher paywall, closed DOI, or timeout)
  return {
    connected: false,
    fullText: '',
    licence: candidate.doi
      ? `Publisher copyright (DOI: ${candidate.doi}) — Abstract metadata via Crossref / Semantic Scholar`
      : `External source — ${candidate.url}`,
  };
}
