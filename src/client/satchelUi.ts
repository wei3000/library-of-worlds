/**
 * @file satchelUi.ts
 * @description Persistent Satchel HUD panel for "The Library of Worlds".
 * Displays all verbatim `QuoteToken`s collected inside the current Book World
 * (strictly deduplicated by token ID).
 * Students can click any Quote Token in the Satchel to:
 * 1. Open the Full-Text Object scrolled directly to that passage and highlighted (`📜 See in text`).
 * 2. Drop the quote directly into their Notes Scroll (`🖋️ +Note`).
 */

import { logFunctionCall } from '../shared/logger';
import type { QuoteToken, Source } from '../shared/types';
import { sessionStore } from './sessionState';

/**
 * Renders the Satchel HUD drawer showing collected `QuoteToken`s for the active `Source`.
 *
 * @param container - DOM element for the Satchel HUD.
 * @param source - Active `Source`.
 * @param onHighlightQuoteInText - Callback that opens the Full-Text viewer and highlights the quote.
 */
export function renderSatchelUi(
  container: HTMLElement,
  source: Source,
  onHighlightQuoteInText: (quoteId: string) => void
): void {
  const rawCollected = sessionStore.getCollectedTokensForSource(source.id);
  const uniqueMap = new Map<string, QuoteToken>();
  for (const token of rawCollected) {
    if (!uniqueMap.has(token.id)) {
      uniqueMap.set(token.id, token);
    }
  }
  const collected = Array.from(uniqueMap.values());

  logFunctionCall('renderSatchelUi', {
    sourceId: source.id,
    collectedCount: collected.length,
  });

  const allSectionTokens = source.sections?.flatMap((s) => s.quoteTokens) ?? [];
  const uniqueAvailableIds = new Set(allSectionTokens.map((t) => t.id));
  const totalAvailable = uniqueAvailableIds.size;

  container.innerHTML = `
    <div class="satchel-panel">
      <div class="satchel-header">
        <strong>🎒 Evidence Satchel (${collected.length}/${totalAvailable})</strong>
        <span class="subtle-text">Click a quote to inspect in full text or add to notes</span>
      </div>
      ${
        collected.length === 0
          ? `<div class="satchel-empty">Talk to the numbered NPCs around the 360° world to collect verbatim Quote Tokens.</div>`
          : `<div class="satchel-tokens">
              ${collected
                .map(
                  (token) => `
                <div class="satchel-token" data-highlight-card="${token.id}">
                  <div class="satchel-token-text">"${token.text}"</div>
                  <div class="satchel-token-actions">
                    <button class="btn-mini" data-highlight-quote="${token.id}" title="View highlighted passage in Full Text">📜 See in text</button>
                    <button class="btn-mini" data-note-quote="${token.id}" title="Drop into Notes Scroll">🖋️ +Note</button>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>`
      }
    </div>
  `;

  container.querySelectorAll('[data-highlight-card]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      if (target.closest('button')) {
        return;
      }
      const qId = (el as HTMLElement).dataset.highlightCard;
      if (qId) {
        onHighlightQuoteInText(qId);
      }
    });
  });

  container.querySelectorAll('[data-highlight-quote]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const qId = (btn as HTMLElement).dataset.highlightQuote;
      if (qId) {
        onHighlightQuoteInText(qId);
      }
    });
  });

  container.querySelectorAll('[data-note-quote]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const qId = (btn as HTMLElement).dataset.noteQuote;
      const found = collected.find((t) => t.id === qId);
      if (found) {
        sessionStore.appendQuoteToNotes(source.id, found.text);
      }
    });
  });
}
