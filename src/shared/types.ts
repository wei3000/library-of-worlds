/**
 * @file types.ts
 * @description Central data contracts for "The Library of Worlds".
 * Defines the core domain models shared between the Vite + Three.js frontend
 * and the Node/Express Gemini backend.
 *
 * Use cases:
 * 1. Hub generation: Research question -> verified & tiered Source[] arranged on themed shelves.
 * 2. Book Worlds: Entering a connected or unconnected Source, interacting with Section NPCs,
 *    collecting verbatim QuoteTokens, and taking notes.
 * 3. Exit Gate: Answering a source comprehension question backed by a collected QuoteToken,
 *    with per-world menace tracking (0-3) and misconception logging.
 * 4. Exit Debrief & Borrowing Record PDF: Evaluating final synthesis claims against sources
 *    (spawning mischievous elves for unsupported claims) and exporting the session log.
 */

export type SourceTier = 'imp' | 'goblin' | 'apprentice' | 'wizard' | 'archmage';

export type VenueType =
  | 'blog_forum_qa'
  | 'tutorial_docs_news'
  | 'preprint_workshop'
  | 'peer_reviewed'
  | 'survey_review_textbook';

export type ExitGrade = 'pass' | 'partial' | 'wrong';

export type ClaimStatus = 'supported' | 'unsupported' | 'overstated' | 'dismissed';

export interface QuoteToken {
  id: string;
  sourceId: string;
  sectionId: string;
  /** Exact verbatim substring of the source section text, validated server-side. */
  text: string;
}

export interface SectionNpc {
  role: string;
  name: string;
  portraitUrl?: string;
  voicePersona?: string;
}

export interface SectionFollowUps {
  whatDoYouMean: string;
  whyBelieveYou: string;
  /** Must be an exact verbatim substring of `Section.text`, validated identically to `QuoteToken.text`. */
  verbatimLine: string;
}

export interface Section {
  id: string;
  heading: string;
  /** Full extracted text of this section. */
  text: string;
  npc: SectionNpc;
  /** Condensed in-character explanation grounded strictly in `text`. */
  explanation: string;
  /** Follow-up responses keyed to standard student questions. */
  followUps: SectionFollowUps;
  quoteTokens: QuoteToken[];
}

export interface ExitQuestion {
  question: string;
  expectedAnswer: string;
  supportingQuoteIds: string[];
}

export interface Source {
  id: string;
  title: string;
  authors: string[];
  /** Optional publication year — blogs and documentation pages often omit a year. */
  year?: number;
  url: string;
  doi?: string;
  arxivId?: string;
  venue?: string;
  venueType: VenueType;
  citationCount?: number;
  tier: SourceTier;
  /** Human-readable reasons derived from real metadata (venue, citations, year). */
  tierReasons: string[];
  /** Aisle theme assigned by the model (3-5 themes across the hub). */
  theme: string;
  /** One-line summary for shelf hover & fallback when `abstract` is empty. */
  summary: string;
  verified: boolean;
  /** True if full text was retrieved and split into sections; false for abstract-only world. */
  connected: boolean;
  /** May be empty (`""`) for blogs/docs; UI falls back to `summary` when empty. */
  abstract: string;
  licence?: string;
  /** Optional Nano Banana generated art panels for the book world. */
  worldArt?: {
    titlePanelUrl?: string;
    diagramPanelUrl?: string;
  };
  sections?: Section[];
  exitQuestion: ExitQuestion;
}

export interface ExitAttempt {
  answer: string;
  grade: ExitGrade;
  feedback?: string;
  rephrasedQuestion?: string;
  supportingQuote?: {
    id: string;
    sectionId: string;
    text: string;
  };
}

export interface MisconceptionRecord {
  answer: string;
  correction: string;
  sourceQuote: string;
}

export interface PerSourceLog {
  notes: string;
  npcsVisited: string[];
  tokensCollected: string[];
  attempts: ExitAttempt[];
  misconception?: MisconceptionRecord;
  /** Current menace level (0-3) inside this world; resets on leaving. */
  currentMenace: number;
  /** Highest menace level reached (0-3) in this world for the borrowing record. */
  maxMenace: number;
  completed: boolean;
  hintSectionId?: string;
}

export interface TakeawayClaim {
  id?: string;
  text: string;
  supportedBy?: string;
  status: ClaimStatus;
  explanation?: string;
}

export interface SessionLog {
  question: string;
  sources: Source[];
  /** Ordered array of sourceIds from easiest (Imp) to hardest (Archmage). */
  path: string[];
  /** Count of candidate sources discarded because DOI/title/URL failed verification. */
  ghostCitationCount: number;
  perSource: {
    [sourceId: string]: PerSourceLog;
  };
  takeaway: {
    transcript: string;
    claims: TakeawayClaim[];
  };
  suggestedNextReads?: Array<{
    title: string;
    reason: string;
    url?: string;
  }>;
}

/** Progress stages streamed via SSE by the Librarian during the research pipeline. */
export type PipelineStage =
  | 'cache_check'
  | 'searching'
  | 'candidates_found'
  | 'verifying'
  | 'verified'
  | 'fetching_text'
  | 'extracting_worlds'
  | 'shelving'
  | 'complete'
  | 'error';

export interface PipelineProgressEvent {
  stage: PipelineStage;
  /** In-character narration line spoken/displayed by the Head Librarian. */
  narration: string;
  /** Elapsed time in milliseconds since pipeline start. */
  elapsedMs: number;
  /** Optional final result when `stage === 'complete'`. */
  result?: ResearchPipelineResult;
  /** Optional error detail when `stage === 'error'`. */
  error?: string;
}

export interface ResearchPipelineResult {
  question: string;
  sources: Source[];
  /** Ordered array of sourceIds from easiest (Imp) to hardest (Archmage). */
  path: string[];
  ghostCitationCount: number;
  fromCache: boolean;
  cachedAt: string;
  durationMs: number;
}
