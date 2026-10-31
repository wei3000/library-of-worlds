/**
 * @file notesScrollUi.ts
 * @description Always-available parchment Notes Scroll overlay for "The Library of Worlds".
 * Allows the student to type research notes per source and drop collected verbatim Quote Tokens
 * directly into their notes. Saved per source inside `SessionLog.perSource[sourceId].notes`.
 *
 * Use cases:
 * 1. Recording key takeaways and limitations while exploring a Book World.
 * 2. Dropping verbatim Quote Tokens into notes for inclusion in the final Borrowing Record PDF.
 */

import { logFunctionCall } from '../shared/logger';
import type { Source } from '../shared/types';
import { sessionStore } from './sessionState';

/**
 * Renders the parchment Notes Scroll overlay for the given `Source`.
 *
 * @param container - DOM element hosting the Notes Scroll overlay.
 * @param source - Active `Source`.
 * @param onClose - Callback invoked when the student closes the Notes Scroll.
 */
export function renderNotesScrollUi(
  container: HTMLElement,
  source: Source,
  onClose: () => void
): void {
  const log = sessionStore.getPerSourceLog(source.id);
  const collected = sessionStore.getCollectedTokensForSource(source.id);
  logFunctionCall('renderNotesScrollUi', {
    sourceId: source.id,
    notesLength: log.notes.length,
    collectedCount: collected.length,
  });

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-card parchment-scroll-card">
      <div class="modal-header">
        <div>
          <h3>🖋️ Scholar's Notes Scroll</h3>
          <div class="subtle-text">${source.title}</div>
        </div>
        <button id="notes-close-btn" class="btn-secondary">✕</button>
      </div>

      <textarea
        id="notes-textarea"
        class="notes-textarea"
        rows="7"
        placeholder="Jot down your critical observations, methodological caveats, or click a Quote Token below to drop it into your scroll..."
      >${log.notes}</textarea>

      <div class="notes-tokens-bar">
        <strong>Drop a Collected Quote Token into Notes:</strong>
        <div class="notes-token-chips">
          ${
            collected.length === 0
              ? `<span class="subtle-text">No Quote Tokens collected yet in this world.</span>`
              : collected
                  .map(
                    (qt) => `
                  <button class="btn-mini" data-drop-quote="${qt.id}">
                    + "${qt.text.slice(0, 58)}..."
                  </button>
                `
                  )
                  .join('')
          }
        </div>
      </div>
    </div>
  `;

  const textarea = container.querySelector('#notes-textarea') as HTMLTextAreaElement | null;
  textarea?.addEventListener('input', () => {
    sessionStore.updateNotes(source.id, textarea.value);
  });

  container.querySelector('#notes-close-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
    onClose();
  });

  container.querySelectorAll('[data-drop-quote]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qId = (btn as HTMLElement).dataset.dropQuote;
      const token = collected.find((t) => t.id === qId);
      if (token) {
        sessionStore.appendQuoteToNotes(source.id, token.text);
        renderNotesScrollUi(container, source, onClose);
      }
    });
  });
}
