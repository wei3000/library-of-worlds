/**
 * @file satchelUi.ts
 * @description Persistent Satchel HUD panel for "The Library of Worlds".
 * Displays all verbatim `QuoteToken`s collected inside the current Book World.
 * Students can click any Quote Token in the Satchel to:
 * 1. Open the Full-Text Object scrolled directly to that passage and highlighted.
 * 2. Drop the quote directly into their Notes Scroll.
 * 3. Select the quote as their supporting evidence for the Librarian's Exit Gate.
 */

import { logFunctionCall } from '../shared/logger';
import type { Source } from '../shared/types';
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
  const collected = sessionStore.getCollectedTokensForSource(source.id);
  const selectedId = sessionStore.getSelectedExitQuoteId();
  logFunctionCall('renderSatchelUi', {
    sourceId: source.id,
    collectedCount: collected.length,
    selectedId,
  });

  const totalAvailable =
    source.sections?.reduce((acc, s) => acc + s.quoteTokens.length, 0) ?? 0;

  container.innerHTML = `
    <div class="satchel-panel">
      <div class="satchel-header">
        <strong>🎒 Evidence Satchel (${collected.length}/${totalAvailable})</strong>
        <span class="subtle-text">Click a quote to select for Exit Gate or highlight in source</span>
      </div>
      ${
        collected.length === 0
          ? `<div class="satchel-empty">Talk to the numbered NPCs around the 360° world to collect verbatim Quote Tokens.</div>`
          : `<div class="satchel-tokens">
              ${collected
                .map(
                  (token) => `
                <div class="satchel-token ${selectedId === token.id ? 'selected' : ''}" data-select-quote="${token.id}">
                  <div class="satchel-token-text">"${token.text}"</div>
                  <div class="satchel-token-actions">
                    <span class="token-badge">${selectedId === token.id ? '✓ Selected for Exit Gate' : 'Use as Evidence'}</span>
                    <button class="btn-mini" data-highlight-quote="${token.id}" title="View highlighted passage in Full Text">📜 Context</button>
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

  container.querySelectorAll('[data-select-quote]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      if (target.closest('button')) {
        return;
      }
      const qId = (el as HTMLElement).dataset.selectQuote;
      if (qId) {
        sessionStore.selectExitQuote(qId);
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
