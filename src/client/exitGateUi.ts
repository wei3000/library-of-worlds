/**
 * @file exitGateUi.ts
 * @description Librarian Exit Gate modal for "The Library of Worlds".
 * To leave a Book World, the student speaks with the Librarian at the world's edge, answers one
 * comprehension question in their own words, and (for connected worlds) presents a collected
 * verbatim `QuoteToken` from their Satchel that supports their answer.
 *
 * Grading outcomes:
 * - `pass`: Great Kiskadee three-note call plays, world brightens, book marked complete, exit opens.
 * - `weak_evidence`: Answer is sound, but the presented Quote Token does not back it; try another token.
 * - `partial`: Librarian adds the missing nuance and opens the exit.
 * - `wrong`: Logged as a misconception (correction withheld until eventual success), Crow caws,
 *   per-world Menace (0-3) rises, and the NPC holding the relevant section glows as a hint.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { ExitGrade, Source } from '../shared/types';
import { audioManager } from './audioManager';
import { sessionStore } from './sessionState';

/**
 * Renders the Librarian Exit Gate modal and wires submission to `/api/exit-grade`.
 *
 * @param container - DOM container element for the Exit Gate modal.
 * @param source - Active `Source`.
 * @param onWorldUpdated - Callback to refresh the 360° world lighting/crows/NPC glow after grading.
 * @param onReturnToHub - Callback to exit the Book World and return to the Library Hub.
 */
export function renderExitGateUi(
  container: HTMLElement,
  source: Source,
  onWorldUpdated: () => void,
  onReturnToHub: () => void
): void {
  const log = sessionStore.getPerSourceLog(source.id);
  const collected = sessionStore.getCollectedTokensForSource(source.id);
  const selectedQuoteId = sessionStore.getSelectedExitQuoteId() ?? collected[0]?.id ?? '';
  const lastAttempt = log.attempts[log.attempts.length - 1];

  logFunctionCall('renderExitGateUi', {
    sourceId: source.id,
    completed: log.completed,
    currentMenace: log.currentMenace,
    collectedTokenCount: collected.length,
  });

  const activeQuestion =
    lastAttempt?.grade === 'wrong' && lastAttempt.rephrasedQuestion
      ? lastAttempt.rephrasedQuestion
      : source.exitQuestion.question;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-card exit-gate-card menace-border-${log.currentMenace}">
      <div class="modal-header">
        <div>
          <span class="badge-pill">🎩 Aurelius Finch — Exit Gate</span>
          <h3>Prove Your Understanding of This Source</h3>
          <div class="subtle-text">Menace Level: ${log.currentMenace} / ${APP_CONFIG.world.maxMenace}</div>
        </div>
        <button id="exit-gate-close-btn" class="btn-secondary">Keep Exploring</button>
      </div>

      <div class="librarian-prompt-box">
        <p><strong>Librarian's Question:</strong> "${activeQuestion}"</p>
      </div>

      ${
        lastAttempt
          ? `<div class="grade-banner grade-${lastAttempt.grade}">
              <strong>${
                lastAttempt.grade === 'pass'
                  ? '🐦 Kiskadee Call! Correct & Verified Evidence'
                  : lastAttempt.grade === 'partial'
                    ? '✓ Partial Pass — Exit Unlocked'
                    : lastAttempt.grade === 'weak_evidence'
                      ? '⚠️ Right Idea, Wrong Quote Token'
                      : '🐦‍⬛ Crows Stir — Misconception Logged (Menace +1)'
              }:</strong>
              <p>${lastAttempt.feedback ?? ''}</p>
              ${
                (lastAttempt.grade === 'pass' || lastAttempt.grade === 'partial') &&
                log.misconception
                  ? `<div class="misconception-resolution">
                      <strong>Resolved Earlier Misconception:</strong> ${log.misconception.correction}
                      <br/><em>Supporting Quote: "${log.misconception.sourceQuote}"</em>
                    </div>`
                  : ''
              }
            </div>`
          : ''
      }

      ${
        log.completed
          ? `<div class="exit-unlocked-actions">
              <button id="return-hub-btn" class="btn-success-large">🚪 Step Through Exit Gate Back to the Library Hub</button>
            </div>`
          : `
            <div class="exit-form">
              <label for="exit-answer-input"><strong>1. Your Answer (in your own words):</strong></label>
              <textarea
                id="exit-answer-input"
                class="notes-textarea"
                rows="4"
                placeholder="Synthesize what you learned from the inhabitants of this world..."
              >${lastAttempt?.answer ?? ''}</textarea>

              ${
                source.connected
                  ? `
                    <label for="exit-quote-select"><strong>2. Present Supporting Quote Token from Your Satchel:</strong></label>
                    ${
                      collected.length === 0
                        ? `<div class="warning-box">Your Satchel is empty! Close this gate and speak to the numbered NPCs around the 360° scene to collect at least one verbatim Quote Token first.</div>`
                        : `<select id="exit-quote-select" class="quote-select">
                            ${collected
                              .map(
                                (qt) => `
                              <option value="${qt.id}" ${qt.id === selectedQuoteId ? 'selected' : ''}>
                                "${qt.text.slice(0, 95)}..."
                              </option>
                            `
                              )
                              .join('')}
                          </select>`
                    }
                  `
                  : `<div class="subtle-text">Unconnected Wing: Answer based on the Abstract (no Quote Token required).</div>`
              }

              <div class="exit-submit-row">
                <button
                  id="submit-exit-answer-btn"
                  class="btn-primary"
                  ${source.connected && collected.length === 0 ? 'disabled' : ''}
                >
                  ⚖️ Present Answer & Evidence to Librarian
                </button>
                <button id="emergency-leave-btn" class="btn-link">Leave world without completing</button>
              </div>
            </div>
          `
      }
    </div>
  `;

  container.querySelector('#exit-gate-close-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
  });

  container.querySelector('#return-hub-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
    onReturnToHub();
  });

  container.querySelector('#emergency-leave-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
    onReturnToHub();
  });

  const submitBtn = container.querySelector('#submit-exit-answer-btn') as HTMLButtonElement | null;
  submitBtn?.addEventListener('click', async () => {
    const answerInput = container.querySelector('#exit-answer-input') as HTMLTextAreaElement | null;
    const quoteSelect = container.querySelector('#exit-quote-select') as HTMLSelectElement | null;
    const studentAnswer = answerInput?.value.trim() ?? '';
    const presentedQuoteId = quoteSelect?.value ?? undefined;

    if (!studentAnswer) {
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Librarian is examining your evidence...';

    try {
      const response = await fetch(APP_CONFIG.endpoints.exitGrade, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: source.id,
          question: source.exitQuestion.question,
          expectedAnswer: source.exitQuestion.expectedAnswer,
          supportingQuoteIds: source.exitQuestion.supportingQuoteIds,
          studentAnswer,
          presentedQuoteId,
          connected: source.connected,
        }),
      });
      const result = (await response.json()) as {
        grade: ExitGrade;
        feedback: string;
        rephrasedQuestion?: string;
      };

      // Find the section holding the primary supporting quote so its NPC can glow on wrong answers
      const targetQuoteId = source.exitQuestion.supportingQuoteIds[0];
      const hintSection = source.sections?.find((s) =>
        s.quoteTokens.some((q) => q.id === targetQuoteId)
      );
      const supportingQuoteText =
        hintSection?.quoteTokens.find((q) => q.id === targetQuoteId)?.text ??
        source.summary;

      if (result.grade === 'pass' || result.grade === 'partial') {
        audioManager.playKiskadeeCall();
      } else if (result.grade === 'wrong') {
        audioManager.playCrowCaw();
      }

      sessionStore.recordExitAttempt(
        source.id,
        {
          answer: studentAnswer,
          presentedQuoteId,
          grade: result.grade,
          feedback: result.feedback,
          rephrasedQuestion: result.rephrasedQuestion,
        },
        result.grade === 'wrong'
          ? {
              answer: studentAnswer,
              correction: source.exitQuestion.expectedAnswer,
              sourceQuote: supportingQuoteText,
            }
          : undefined,
        result.grade === 'wrong' ? hintSection?.id : undefined
      );

      onWorldUpdated();
      renderExitGateUi(container, source, onWorldUpdated, onReturnToHub);
    } catch (err) {
      logFunctionCall('exitGateSubmitError', { error: String(err) });
      submitBtn.disabled = false;
      submitBtn.textContent = '⚖️ Present Answer & Evidence to Librarian';
    }
  });
}
