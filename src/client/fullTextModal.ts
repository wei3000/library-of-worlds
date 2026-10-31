/**
 * @file fullTextModal.ts
 * @description Full-Text Object inspection modal for "The Library of Worlds".
 * Shows the complete source text with section headings, attribution, venue, year, and licence line
 * (or the abstract + "Read the full source" link for unconnected worlds).
 * When opened via a `QuoteToken`, scrolls directly to that exact substring and highlights it.
 *
 * Use cases:
 * 1. Clicking the tier's Full-Text Object (Notice Board, Blueprint, Parchment, Stone Tablet, Lectern).
 * 2. Clicking a Quote Token in the Satchel or NPC dialogue to verify its surrounding context.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { Source } from '../shared/types';

/**
 * Escapes HTML special characters to prevent markup injection when rendering extracted text.
 *
 * @param raw - Raw string.
 * @returns HTML-safe string.
 */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Highlights an exact `quoteText` substring inside `sectionText` with a `<mark id="highlighted-quote">` tag.
 *
 * @param sectionText - Full text of the section.
 * @param quoteText - Exact substring to highlight.
 * @returns HTML string with `<mark>` wrapping the matching passage.
 */
function highlightQuoteSubstring(sectionText: string, quoteText?: string): string {
  if (!quoteText) {
    return escapeHtml(sectionText);
  }
  const idx = sectionText.indexOf(quoteText.trim());
  if (idx === -1) {
    return escapeHtml(sectionText);
  }
  const before = escapeHtml(sectionText.slice(0, idx));
  const match = escapeHtml(sectionText.slice(idx, idx + quoteText.trim().length));
  const after = escapeHtml(sectionText.slice(idx + quoteText.trim().length));
  return `${before}<mark id="highlighted-quote" class="verbatim-highlight">${match}</mark>${after}`;
}

/**
 * Renders the Full-Text Object modal for `source`, optionally scrolling to and highlighting `highlightQuoteId`.
 *
 * @param container - DOM container element for the Full-Text modal.
 * @param source - Active `Source`.
 * @param highlightQuoteId - Optional ID of a `QuoteToken` to scroll to and highlight.
 * @param onClose - Callback invoked when the modal is closed.
 */
export function renderFullTextModal(
  container: HTMLElement,
  source: Source,
  highlightQuoteId: string | undefined,
  onClose: () => void
): void {
  logFunctionCall('renderFullTextModal', {
    sourceId: source.id,
    highlightQuoteId,
    connected: source.connected,
  });

  const tierInfo = APP_CONFIG.tiers[source.tier];
  const allTokens = source.sections?.flatMap((s) => s.quoteTokens) ?? [];
  const targetToken = highlightQuoteId
    ? allTokens.find((t) => t.id === highlightQuoteId)
    : undefined;

  const displayAbstract = source.abstract.trim() || source.summary;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-card fulltext-card">
      <div class="modal-header">
        <div>
          <span class="badge-pill" style="border-color:${tierInfo.cssColor}">
            📜 ${tierInfo.fullTextObjectName} (${tierInfo.label} Tier)
          </span>
          <h3>${escapeHtml(source.title)}</h3>
          <div class="subtle-text">
            ${escapeHtml(source.authors.join(', '))}
            ${source.year ? `(${source.year})` : ''}
            ${source.venue ? `• ${escapeHtml(source.venue)}` : ''}
            ${source.licence ? `• Licence: ${escapeHtml(source.licence)}` : ''}
          </div>
        </div>
        <button id="fulltext-close-btn" class="btn-secondary">✕</button>
      </div>

      <div class="fulltext-body" id="fulltext-scroll-container">
        <div class="fulltext-meta-box">
          <strong>${source.abstract.trim() ? 'Abstract:' : 'Summary:'}</strong>
          <p>${escapeHtml(displayAbstract)}</p>
          <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" class="external-source-link">
            🔗 Read the full original source (${escapeHtml(source.url)}) ↗
          </a>
        </div>

        ${
          !source.connected || !source.sections || source.sections.length === 0
            ? `<div class="unconnected-notice">
                <h4>🌫️ This Wing of the Library Is Not Yet Connected</h4>
                <p>Full text for this source is behind a publisher gate or unavailable for automated extraction. We never bypass paywalls. Use the abstract above and the official publisher link to study this source.</p>
              </div>`
            : source.sections
                .map(
                  (sec) => `
                  <div class="fulltext-section" id="section-block-${sec.id}">
                    <h4>${escapeHtml(sec.heading)} <span class="npc-tag">(${escapeHtml(sec.npc.name)} — ${escapeHtml(sec.npc.role)})</span></h4>
                    <p>${highlightQuoteSubstring(
                      sec.text,
                      targetToken?.sectionId === sec.id ? targetToken.text : undefined
                    )}</p>
                  </div>
                `
                )
                .join('')
        }
      </div>
    </div>
  `;

  container.querySelector('#fulltext-close-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
    onClose();
  });

  // Scroll to highlighted quote token if present
  if (targetToken) {
    requestAnimationFrame(() => {
      const markEl = container.querySelector('#highlighted-quote');
      markEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}
