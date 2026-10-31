/**
 * @file tierClassifier.ts
 * @description Metadata-driven Source Tier Classifier for "The Library of Worlds".
 * Assigns each verified source to one of five tiers (`imp`, `goblin`, `apprentice`,
 * `wizard`, `archmage`) strictly from real metadata (venue, venueType, citation count,
 * DOI/arXiv presence, URL domain, publication year) — NEVER from unverified LLM opinion.
 * Also constructs human-readable `tierReasons` displayed on bookshelf hover tooltips.
 *
 * Use cases:
 * 1. Milestone 2 pipeline: Classifying verified sources into Imp -> Archmage tiers.
 * 2. Lantern Path ordering: Sorting sources from easiest (Imp = 1) to hardest (Archmage = 5).
 * 3. Shelf hover UI: Explaining to first-year students *why* a source is an Imp vs a Wizard.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { SourceTier, VenueType } from '../shared/types';

export interface VerifiedMetadataInput {
  title: string;
  url: string;
  doi?: string;
  arxivId?: string;
  venue?: string;
  venueTypeHint?: VenueType;
  citationCount?: number;
  year?: number;
}

export interface TierClassificationResult {
  tier: SourceTier;
  venueType: VenueType;
  tierReasons: string[];
}

/**
 * Infers the normalized `VenueType` strictly from URL domain, arXiv/DOI identifiers,
 * and verified venue strings.
 *
 * @param meta - Verified bibliographic metadata for the source.
 * @returns Deterministic `VenueType`.
 */
export function inferVenueTypeFromMetadata(meta: VerifiedMetadataInput): VenueType {
  logFunctionCall('inferVenueTypeFromMetadata', {
    title: meta.title,
    url: meta.url,
    venue: meta.venue,
    arxivId: meta.arxivId,
    doi: meta.doi,
    citationCount: meta.citationCount,
  });

  const urlLower = meta.url.toLowerCase();
  const venueLower = (meta.venue ?? '').toLowerCase();
  const titleLower = meta.title.toLowerCase();
  const citations = meta.citationCount ?? 0;

  // 1. Survey / Review / Textbook or highly cited canonical work
  const isSurveyOrReview =
    titleLower.includes('survey') ||
    titleLower.includes('review') ||
    titleLower.includes('comprehensive guide') ||
    venueLower.includes('survey') ||
    venueLower.includes('review') ||
    venueLower.includes('foundations and trends') ||
    meta.venueTypeHint === 'survey_review_textbook';

  if (
    (meta.doi || meta.arxivId) &&
    (citations >= APP_CONFIG.tierThresholds.archmageMinCitations || isSurveyOrReview)
  ) {
    return 'survey_review_textbook';
  }

  // 2. Blog / Forum / Medium / Q&A sites (only when not a DOI/arXiv academic paper)
  if (
    !meta.doi &&
    !meta.arxivId &&
    (urlLower.includes('medium.com') ||
      urlLower.includes('towardsdatascience.com') ||
      urlLower.includes('stackoverflow.com') ||
      urlLower.includes('stackexchange.com') ||
      urlLower.includes('reddit.com') ||
      urlLower.includes('substack.com') ||
      urlLower.includes('dev.to') ||
      urlLower.includes('blog') ||
      venueLower.includes('blog') ||
      venueLower.includes('stack exchange') ||
      venueLower.includes('medium'))
  ) {
    return 'blog_forum_qa';
  }

  // 3. Documentation / Tutorial / Explainer / GitHub Docs
  if (
    urlLower.includes('docs.') ||
    urlLower.includes('/docs/') ||
    urlLower.includes('tutorial') ||
    urlLower.includes('scikit-learn.org') ||
    urlLower.includes('pytorch.org') ||
    urlLower.includes('huggingface.co/learn') ||
    urlLower.includes('github.io') ||
    venueLower.includes('documentation') ||
    venueLower.includes('tutorial')
  ) {
    return 'tutorial_docs_news';
  }

  // 4. Peer-reviewed Journal or Conference Paper
  // Must have a non-arXiv venue or non-arXiv DOI
  const isArxivOnlyVenue =
    !venueLower ||
    venueLower.includes('arxiv') ||
    venueLower.includes('corr') ||
    venueLower.includes('preprint') ||
    venueLower.includes('workshop');

  const isArxivDoi = Boolean(meta.doi && meta.doi.toLowerCase().includes('arxiv'));

  if ((meta.doi && !isArxivDoi && !isArxivOnlyVenue) || (!meta.arxivId && meta.doi && !isArxivDoi)) {
    return 'peer_reviewed';
  }

  if (venueLower && !isArxivOnlyVenue && (meta.doi || meta.arxivId)) {
    return 'peer_reviewed';
  }

  // 5. arXiv Preprint or Workshop paper
  if (meta.arxivId || urlLower.includes('arxiv.org') || venueLower.includes('workshop')) {
    return 'preprint_workshop';
  }

  // 6. Fallback based on whether it has a DOI vs is a web page
  if (meta.doi) {
    return 'peer_reviewed';
  }
  if (meta.venueTypeHint === 'blog_forum_qa') {
    return 'blog_forum_qa';
  }
  return 'tutorial_docs_news';
}

/**
 * Classifies a verified source into a `SourceTier` and builds the `tierReasons` array
 * from verified metadata fields (`venue`, `venueType`, `citationCount`, `year`, `doi`, `arxivId`).
 *
 * @param meta - Verified bibliographic metadata.
 * @returns Tier classification (`tier`, `venueType`, `tierReasons`).
 */
export function classifySourceTier(meta: VerifiedMetadataInput): TierClassificationResult {
  logFunctionCall('classifySourceTier', {
    title: meta.title,
    venue: meta.venue,
    citationCount: meta.citationCount,
    year: meta.year,
  });

  const venueType = inferVenueTypeFromMetadata(meta);
  const reasons: string[] = [];

  let tier: SourceTier;
  switch (venueType) {
    case 'blog_forum_qa':
      tier = 'imp';
      reasons.push(`Venue type: Community blog, forum, or Q&A post (${meta.venue || new URL(meta.url).hostname})`);
      reasons.push('Review status: Not peer-reviewed; reflects individual practitioner experience');
      break;
    case 'tutorial_docs_news':
      tier = 'goblin';
      reasons.push(`Venue type: Technical documentation or tutorial (${meta.venue || new URL(meta.url).hostname})`);
      reasons.push('Review status: Practical implementation reference without formal academic peer review');
      break;
    case 'preprint_workshop':
      tier = 'apprentice';
      reasons.push(
        `Venue: ${meta.venue || 'arXiv Preprint'}${meta.arxivId ? ` (arXiv:${meta.arxivId})` : ''}`
      );
      reasons.push('Review status: Preprint or workshop paper — timely research not yet journal-vetted');
      break;
    case 'peer_reviewed':
      tier = 'wizard';
      reasons.push(`Peer-reviewed venue: ${meta.venue || 'Academic Journal / Conference'}`);
      if (meta.doi) {
        reasons.push(`Verified DOI: ${meta.doi}`);
      }
      break;
    case 'survey_review_textbook':
      tier = 'archmage';
      reasons.push(`Authoritative synthesis / highly cited work (${meta.venue || 'Academic Venue'})`);
      if (meta.doi) {
        reasons.push(`Verified DOI: ${meta.doi}`);
      }
      break;
  }

  if (typeof meta.citationCount === 'number') {
    reasons.push(`Verified citations: ${meta.citationCount.toLocaleString()}`);
  }
  if (typeof meta.year === 'number') {
    reasons.push(`Publication year: ${meta.year}`);
  } else {
    reasons.push('Publication year: Unspecified (living web document)');
  }

  return {
    tier,
    venueType,
    tierReasons: reasons,
  };
}
