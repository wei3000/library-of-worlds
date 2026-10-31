/**
 * @file npcDialogueUi.ts
 * @description In-world NPC dialogue overlay for "The Library of Worlds".
 * Displays a section inhabitant's condensed in-character explanation (grounded strictly in their section),
 * offers the 3 required follow-up questions:
 *   1. "What do you mean?"
 *   2. "Why should I believe you?"
 *   3. "Read me the actual line" (verbatim substring from the section)
 * and lets the student collect the section's verbatim `QuoteToken`s into their Satchel.
 *
 * Use cases:
 * 1. Stepping through a source's sections via its 360° world inhabitants.
 * 2. Collecting exact quote tokens to present as evidence at the Exit Gate.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { Section, Source } from '../shared/types';
import { audioManager } from './audioManager';
import { sessionStore } from './sessionState';

/**
 * Renders the NPC dialogue modal for the active section inside `container`.
 *
 * @param container - DOM element hosting the NPC dialogue card.
 * @param source - Active `Source`.
 * @param section - Active `Section` whose NPC is speaking.
 * @param onOpenQuoteInFullText - Callback to open the Full-Text viewer scrolled to a quote token.
 */
export function renderNpcDialogueUi(
  container: HTMLElement,
  source: Source,
  section: Section,
  onOpenQuoteInFullText: (quoteId: string) => void
): void {
  logFunctionCall('renderNpcDialogueUi', {
    sourceId: source.id,
    sectionId: section.id,
    npcName: section.npc.name,
  });

  const log = sessionStore.getPerSourceLog(source.id);
  const allCollected = section.quoteTokens.every((t) => log.tokensCollected.includes(t.id));
  const portraitUrl = section.npc.portraitUrl || APP_CONFIG.art.npcs[source.tier];

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-card npc-card">
      <div class="modal-header">
        <div class="npc-header-bio">
          <img class="npc-portrait-thumb" src="${portraitUrl}" alt="${section.npc.name}" />
          <div>
            <span class="badge-pill">${section.npc.role}</span>
            <h3>${section.npc.name}</h3>
            <div class="subtle-text">${section.heading}</div>
          </div>
        </div>
        <button id="npc-close-btn" class="btn-secondary" title="Close Dialogue">✕</button>
      </div>

      <div class="npc-speech-box">
        <p id="npc-primary-text">"${section.explanation}"</p>
        <div id="npc-followup-reply" class="npc-followup-reply hidden"></div>
      </div>

      <div class="followup-bar">
        <button class="btn-followup" data-followup="mean">💬 "What do you mean?"</button>
        <button class="btn-followup" data-followup="believe">🔍 "Why should I believe you?"</button>
        <button class="btn-followup" data-followup="verbatim">📜 "Read me the actual line"</button>
      </div>

      <div class="quote-token-section">
        <div class="quote-section-header">
          <strong>Verbatim Quote Tokens in this Section (${section.quoteTokens.length})</strong>
          <button id="collect-tokens-btn" class="btn-primary" ${allCollected ? 'disabled' : ''}>
            ${allCollected ? '✓ Collected in Satchel' : '🎒 Collect Quote Token(s)'}
          </button>
        </div>
        <div class="quote-token-list">
          ${section.quoteTokens
            .map(
              (qt) => `
            <div class="quote-chip">
              <span>"${qt.text}"</span>
              <button class="btn-link" data-locate-quote="${qt.id}">Highlight in Full Text ↗</button>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#npc-close-btn')?.addEventListener('click', () => {
    sessionStore.closeNpcDialogue();
  });

  const replyBox = container.querySelector('#npc-followup-reply') as HTMLElement | null;
  container.querySelectorAll('[data-followup]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = (btn as HTMLElement).dataset.followup;
      logFunctionCall('npcFollowUpClicked', { sectionId: section.id, kind });
      if (!replyBox) {
        return;
      }
      replyBox.classList.remove('hidden');
      if (kind === 'mean') {
        replyBox.innerHTML = `<strong>Clarification:</strong> "${section.followUps.whatDoYouMean}"`;
      } else if (kind === 'believe') {
        replyBox.innerHTML = `<strong>Evidence Basis:</strong> "${section.followUps.whyBelieveYou}"`;
      } else {
        replyBox.innerHTML = `<strong>Verbatim Line from Text:</strong> <em>"${section.followUps.verbatimLine}"</em>`;
      }
    });
  });

  container.querySelector('#collect-tokens-btn')?.addEventListener('click', () => {
    audioManager.playTokenCollect();
    sessionStore.collectSectionTokens(source.id, section.id);
  });

  container.querySelectorAll('[data-locate-quote]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qId = (btn as HTMLElement).dataset.locateQuote;
      if (qId) {
        onOpenQuoteInFullText(qId);
      }
    });
  });
}
