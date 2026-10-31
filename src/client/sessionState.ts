/**
 * @file sessionState.ts
 * @description Reactive client-side session store managing the `SessionLog` contract
 * for "The Library of Worlds".
 * Tracks the student's active research question, verified sources, ordered reading path,
 * ghost citation count, per-source notes, visited NPCs, collected Quote Tokens,
 * Exit Gate attempts, misconceptions, and per-world Menace level (0-3, resetting on world exit).
 *
 * Use cases:
 * 1. Synchronizing HUD components (Satchel, Notes Scroll, Full-Text Modal, Exit Gate) with 3D scenes.
 * 2. Persisting per-source notes and collected tokens across world entries.
 * 3. Resetting `currentMenace` when leaving a book world while preserving `maxMenace` for the Borrowing Record.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type {
  ClaimStatus,
  ExitAttempt,
  MisconceptionRecord,
  PerSourceLog,
  QuoteToken,
  SessionLog,
  Source,
  TakeawayClaim,
} from '../shared/types';
import { getSampleSources } from './sampleData';

type Listener = () => void;

const TIER_ORDER: Record<Source['tier'], number> = {
  imp: 1,
  goblin: 2,
  apprentice: 3,
  wizard: 4,
  archmage: 5,
};

/**
 * Computes the ordered reading path (`sourceId[]`) from easiest (`imp`) to hardest (`archmage`).
 *
 * @param sources - List of verified sources.
 * @returns Array of source IDs sorted by tier order.
 */
export function computeReadingPath(sources: Source[]): string[] {
  logFunctionCall('computeReadingPath', { sourceCount: sources.length });
  return [...sources]
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])
    .map((s) => s.id);
}

/**
 * Creates a fresh `PerSourceLog` entry for a given source.
 *
 * @param sourceId - ID of the source being initialized.
 * @returns Initialized `PerSourceLog`.
 */
function createEmptyPerSourceLog(sourceId: string): PerSourceLog {
  logFunctionCall('createEmptyPerSourceLog', { sourceId });
  return {
    notes: '',
    npcsVisited: [],
    tokensCollected: [],
    attempts: [],
    currentMenace: 0,
    maxMenace: 0,
    completed: false,
  };
}

class SessionStore {
  private session: SessionLog;
  private activeSourceId: string | null = null;
  private activeSectionId: string | null = null;
  private selectedExitQuoteId: string | null = null;
  private listeners: Set<Listener> = new Set();

  constructor() {
    const initialSources = getSampleSources();
    const perSource: Record<string, PerSourceLog> = {};
    for (const src of initialSources) {
      perSource[src.id] = createEmptyPerSourceLog(src.id);
    }

    this.session = {
      question: APP_CONFIG.seedQuestion,
      sources: initialSources,
      path: computeReadingPath(initialSources),
      ghostCitationCount: 2, // Sample ghost citations filtered out by verifier
      perSource,
      takeaway: {
        transcript: '',
        claims: [],
      },
    };
  }

  /**
   * Subscribes a listener callback to state changes.
   *
   * @param listener - Callback invoked whenever session state updates.
   * @returns Unsubscribe function.
   */
  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notifies all registered UI and scene listeners of a state change.
   */
  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Returns the current `SessionLog` snapshot.
   *
   * @returns Current `SessionLog`.
   */
  public getSession(): SessionLog {
    return this.session;
  }

  /**
   * Updates the active research question and optionally replaces the `Source[]` list.
   *
   * @param question - Student's research question.
   * @param newSources - Optional new verified sources from the research pipeline.
   * @param ghostCitationCount - Optional count of discarded ghost citations.
   */
  public setQuestionAndSources(
    question: string,
    newSources?: Source[],
    ghostCitationCount?: number
  ): void {
    logFunctionCall('SessionStore.setQuestionAndSources', {
      question,
      newSourceCount: newSources?.length,
      ghostCitationCount,
    });
    this.session.question = question;
    if (newSources) {
      this.session.sources = newSources;
      this.session.path = computeReadingPath(newSources);
      for (const src of newSources) {
        if (!this.session.perSource[src.id]) {
          this.session.perSource[src.id] = createEmptyPerSourceLog(src.id);
        }
      }
    }
    if (typeof ghostCitationCount === 'number') {
      this.session.ghostCitationCount = ghostCitationCount;
    }
    this.notify();
  }

  /**
   * Returns the currently entered book `Source`, or `null` when the player is in the Library Hub.
   *
   * @returns Active `Source` or `null`.
   */
  public getActiveSource(): Source | null {
    if (!this.activeSourceId) {
      return null;
    }
    return this.session.sources.find((s) => s.id === this.activeSourceId) ?? null;
  }

  /**
   * Returns the `PerSourceLog` for a given `sourceId`, creating one if missing.
   *
   * @param sourceId - Target source ID.
   * @returns The `PerSourceLog` for that source.
   */
  public getPerSourceLog(sourceId: string): PerSourceLog {
    if (!this.session.perSource[sourceId]) {
      this.session.perSource[sourceId] = createEmptyPerSourceLog(sourceId);
    }
    return this.session.perSource[sourceId];
  }

  /**
   * Enters a book world by setting `activeSourceId` and resetting `currentMenace` to 0.
   *
   * @param sourceId - ID of the book source to enter.
   */
  public enterBookWorld(sourceId: string): void {
    logFunctionCall('SessionStore.enterBookWorld', { sourceId });
    this.activeSourceId = sourceId;
    this.activeSectionId = null;
    const log = this.getPerSourceLog(sourceId);
    log.currentMenace = 0;
    const collected = this.getCollectedTokensForSource(sourceId);
    this.selectedExitQuoteId = collected[0]?.id ?? null;
    this.notify();
  }

  /**
   * Leaves the current book world and returns to the Library Hub, resetting `currentMenace` to 0.
   */
  public leaveBookWorld(): void {
    logFunctionCall('SessionStore.leaveBookWorld', { previousSourceId: this.activeSourceId });
    if (this.activeSourceId) {
      const log = this.getPerSourceLog(this.activeSourceId);
      log.currentMenace = 0;
    }
    this.activeSourceId = null;
    this.activeSectionId = null;
    this.selectedExitQuoteId = null;
    this.notify();
  }

  /**
   * Records that the student opened dialogue with a section NPC.
   *
   * @param sourceId - Active source ID.
   * @param sectionId - Section ID of the NPC visited.
   */
  public visitNpc(sourceId: string, sectionId: string): void {
    logFunctionCall('SessionStore.visitNpc', { sourceId, sectionId });
    this.activeSectionId = sectionId;
    const log = this.getPerSourceLog(sourceId);
    if (!log.npcsVisited.includes(sectionId)) {
      log.npcsVisited.push(sectionId);
    }
    this.notify();
  }

  /**
   * Closes the active NPC dialogue overlay.
   */
  public closeNpcDialogue(): void {
    logFunctionCall('SessionStore.closeNpcDialogue', {});
    this.activeSectionId = null;
    this.notify();
  }

  /**
   * Returns the currently open NPC `Section` in the active book world, if any.
   *
   * @returns Active `Section` or `null`.
   */
  public getActiveSection() {
    const src = this.getActiveSource();
    if (!src || !src.sections || !this.activeSectionId) {
      return null;
    }
    return src.sections.find((sec) => sec.id === this.activeSectionId) ?? null;
  }

  /**
   * Collects all verbatim `QuoteToken`s from a given section into the student's Satchel,
   * deduplicating by token ID and text.
   *
   * @param sourceId - Source ID.
   * @param sectionId - Section ID whose tokens are being collected.
   * @returns Array of newly collected `QuoteToken` objects.
   */
  public collectSectionTokens(sourceId: string, sectionId: string): QuoteToken[] {
    logFunctionCall('SessionStore.collectSectionTokens', { sourceId, sectionId });
    const src = this.session.sources.find((s) => s.id === sourceId);
    const sec = src?.sections?.find((s) => s.id === sectionId);
    if (!sec) {
      return [];
    }
    const log = this.getPerSourceLog(sourceId);
    const existingTokens = this.getCollectedTokensForSource(sourceId);
    const seenIds = new Set(log.tokensCollected);
    const seenTexts = new Set(existingTokens.map((t) => t.text.trim()));
    const added: QuoteToken[] = [];

    for (const token of sec.quoteTokens) {
      if (!seenIds.has(token.id) && !seenTexts.has(token.text.trim())) {
        seenIds.add(token.id);
        seenTexts.add(token.text.trim());
        log.tokensCollected.push(token.id);
        added.push(token);
      }
    }
    log.tokensCollected = Array.from(new Set(log.tokensCollected));
    this.notify();
    return added;
  }

  /**
   * Ensures a single supporting quote (returned by the Exit Gate grader on pass/partial)
   * exists in the source's section tokens and is added to the student's Satchel (deduped by ID).
   *
   * @param sourceId - Source ID.
   * @param quote - Supporting quote `{ id, sectionId, text }`.
   * @returns The canonical `QuoteToken.id` that can be highlighted in the Full-Text viewer.
   */
  public ensureQuoteTokenCollected(
    sourceId: string,
    quote: { id: string; sectionId: string; text: string }
  ): string {
    logFunctionCall('SessionStore.ensureQuoteTokenCollected', {
      sourceId,
      quoteId: quote.id,
      sectionId: quote.sectionId,
    });
    const src = this.session.sources.find((s) => s.id === sourceId);
    const log = this.getPerSourceLog(sourceId);
    let canonicalId = quote.id;

    if (src?.sections && src.sections.length > 0) {
      // Check if an existing token already has this ID or exact text
      const allTokens = src.sections.flatMap((s) => s.quoteTokens);
      const existing =
        allTokens.find((t) => t.id === quote.id) ??
        allTokens.find((t) => t.text.trim() === quote.text.trim());

      if (existing) {
        canonicalId = existing.id;
      } else {
        const targetSection =
          src.sections.find((s) => s.id === quote.sectionId) ??
          src.sections.find((s) => s.text.includes(quote.text.trim())) ??
          src.sections[0];
        if (targetSection) {
          const newToken: QuoteToken = {
            id: quote.id || `${sourceId}-exit-qt`,
            sourceId,
            sectionId: targetSection.id,
            text: quote.text.trim(),
          };
          targetSection.quoteTokens.push(newToken);
          canonicalId = newToken.id;
        }
      }
    }

    if (!log.tokensCollected.includes(canonicalId)) {
      log.tokensCollected.push(canonicalId);
    }
    log.tokensCollected = Array.from(new Set(log.tokensCollected));
    return canonicalId;
  }

  /**
   * Retrieves the full `QuoteToken` objects collected so far for a given source,
   * strictly deduplicated by `token.id` (and `token.text`).
   *
   * @param sourceId - Target source ID.
   * @returns Deduplicated array of collected `QuoteToken` items.
   */
  public getCollectedTokensForSource(sourceId: string): QuoteToken[] {
    const src = this.session.sources.find((s) => s.id === sourceId);
    if (!src || !src.sections) {
      return [];
    }
    const log = this.getPerSourceLog(sourceId);
    const collectedIdSet = new Set(log.tokensCollected);
    const allTokens = src.sections.flatMap((s) => s.quoteTokens);

    const dedupedByIdAndText = new Map<string, QuoteToken>();
    const seenText = new Set<string>();
    for (const token of allTokens) {
      if (!collectedIdSet.has(token.id)) {
        continue;
      }
      const normText = token.text.trim();
      if (!dedupedByIdAndText.has(token.id) && !seenText.has(normText)) {
        dedupedByIdAndText.set(token.id, token);
        seenText.add(normText);
      }
    }
    return Array.from(dedupedByIdAndText.values());
  }

  /**
   * Selects a collected `QuoteToken` in the Satchel to present at the Exit Gate.
   *
   * @param quoteId - ID of the selected quote token.
   */
  public selectExitQuote(quoteId: string): void {
    logFunctionCall('SessionStore.selectExitQuote', { quoteId });
    this.selectedExitQuoteId = quoteId;
    this.notify();
  }

  /**
   * Gets the currently selected `QuoteToken` ID for the Exit Gate.
   *
   * @returns Selected quote token ID or `null`.
   */
  public getSelectedExitQuoteId(): string | null {
    return this.selectedExitQuoteId;
  }

  /**
   * Updates the student's Notes Scroll text for a given source.
   *
   * @param sourceId - Source ID.
   * @param notes - Updated notes text.
   */
  public updateNotes(sourceId: string, notes: string): void {
    logFunctionCall('SessionStore.updateNotes', { sourceId, notesLength: notes.length });
    const log = this.getPerSourceLog(sourceId);
    log.notes = notes;
    this.notify();
  }

  /**
   * Appends a verbatim Quote Token into the student's Notes Scroll for the source.
   *
   * @param sourceId - Source ID.
   * @param quoteText - Verbatim text of the quote token.
   */
  public appendQuoteToNotes(sourceId: string, quoteText: string): void {
    logFunctionCall('SessionStore.appendQuoteToNotes', { sourceId, quoteText });
    const log = this.getPerSourceLog(sourceId);
    const prefix = log.notes.trim().length > 0 ? `${log.notes.trim()}\n\n` : '';
    log.notes = `${prefix}> "${quoteText}"`;
    this.notify();
  }

  /**
   * Records an Exit Gate attempt and updates Menace level (0-3), completion status,
   * hint NPC glow, and misconception records accordingly.
   *
   * @param sourceId - Source ID being graded.
   * @param attempt - Graded `ExitAttempt`.
   * @param misconception - Optional misconception record when an answer was wrong or corrected.
   * @param hintSectionId - Optional section ID whose NPC should glow as a hint after a wrong answer.
   */
  public recordExitAttempt(
    sourceId: string,
    attempt: ExitAttempt,
    misconception?: MisconceptionRecord,
    hintSectionId?: string
  ): void {
    logFunctionCall('SessionStore.recordExitAttempt', {
      sourceId,
      grade: attempt.grade,
      supportingQuoteId: attempt.supportingQuote?.id,
      hintSectionId,
    });
    const log = this.getPerSourceLog(sourceId);

    if (attempt.grade === 'pass' || attempt.grade === 'partial') {
      if (attempt.supportingQuote) {
        const canonicalId = this.ensureQuoteTokenCollected(sourceId, attempt.supportingQuote);
        attempt.supportingQuote.id = canonicalId;
      }
      log.completed = true;
      log.currentMenace = 0;
      log.hintSectionId = undefined;
    } else if (attempt.grade === 'wrong') {
      log.currentMenace = Math.min(APP_CONFIG.world.maxMenace, log.currentMenace + 1);
      log.maxMenace = Math.max(log.maxMenace, log.currentMenace);
      if (misconception) {
        log.misconception = misconception;
      }
      if (hintSectionId) {
        log.hintSectionId = hintSectionId;
      }
    }
    log.attempts.push(attempt);
    this.notify();
  }

  /**
   * Records the student's final Exit Debrief synthesis, verified `TakeawayClaim[]` items,
   * and `suggestedNextReads` for the Borrowing Record PDF.
   *
   * @param transcript - Student's synthesis text.
   * @param claims - Extracted and verified `TakeawayClaim[]` list.
   * @param suggestedNextReads - Optional 2-3 suggested next reads.
   */
  public recordTakeawayDebrief(
    transcript: string,
    claims: TakeawayClaim[],
    suggestedNextReads?: Array<{ title: string; reason: string; url?: string }>
  ): void {
    logFunctionCall('SessionStore.recordTakeawayDebrief', {
      transcriptLength: transcript.length,
      claimCount: claims.length,
      nextReadCount: suggestedNextReads?.length ?? 0,
    });
    this.session.takeaway = {
      transcript,
      claims: claims.map((c, idx) => ({
        ...c,
        id: c.id || `claim-${idx + 1}`,
      })),
    };
    if (suggestedNextReads && suggestedNextReads.length > 0) {
      this.session.suggestedNextReads = suggestedNextReads;
    }
    this.notify();
  }

  /**
   * Resolves a mischievous Elf's flagged (`unsupported` or `overstated`) claim by either:
   * 1. Revising the claim text and marking it `'supported'`,
   * 2. Attaching a collected `QuoteToken` (`supportedBy: sourceId`), or
   * 3. Dismissing the claim (`status: 'dismissed'`) to shoo the Elf away.
   *
   * @param claimId - ID of the `TakeawayClaim` to update.
   * @param resolution - Updated status, optional revised text, supporting source ID, and explanation.
   */
  public resolveTakeawayClaim(
    claimId: string,
    resolution: {
      status: ClaimStatus;
      revisedText?: string;
      supportedBy?: string;
      explanation?: string;
    }
  ): void {
    logFunctionCall('SessionStore.resolveTakeawayClaim', {
      claimId,
      status: resolution.status,
      supportedBy: resolution.supportedBy,
    });
    const claim = this.session.takeaway.claims.find((c) => c.id === claimId);
    if (!claim) {
      return;
    }
    claim.status = resolution.status;
    if (resolution.revisedText !== undefined && resolution.revisedText.trim().length > 0) {
      claim.text = resolution.revisedText.trim();
    }
    if (resolution.supportedBy !== undefined) {
      claim.supportedBy = resolution.supportedBy;
    }
    if (resolution.explanation !== undefined) {
      claim.explanation = resolution.explanation;
    }
    this.notify();
  }

  /**
   * Returns all deduplicated `QuoteToken`s collected across all shelved sources in the session,
   * paired with their source title for the Exit Debrief Elf resolution picker.
   */
  public getAllCollectedTokens(): Array<{ token: QuoteToken; sourceTitle: string }> {
    const out: Array<{ token: QuoteToken; sourceTitle: string }> = [];
    for (const src of this.session.sources) {
      const tokens = this.getCollectedTokensForSource(src.id);
      for (const token of tokens) {
        out.push({ token, sourceTitle: src.title });
      }
    }
    return out;
  }
}

export const sessionStore = new SessionStore();
