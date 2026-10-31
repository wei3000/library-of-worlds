/**
 * @file exitGateUi.ts
 * @description Librarian Exit Gate modal for "The Library of Worlds".
 * To leave a Book World, the student speaks with Head Librarian Aurelius Finch at the world's edge
 * and answers one comprehension question in their own words.
 *
 * Grading outcomes (`pass` / `partial` / `wrong`):
 * - `pass` or `partial`: Lenient grading; Aurelius replies in 1-2 short sentences, automatically
 *   cites the single best verbatim supporting quote from the source ("Quite right. As the text says: '…'"),
 *   adds that quote token to the student's Satchel, offers a "📜 See in text" button that opens the
 *   Full-Text Object highlighted at that passage, plays the Great Kiskadee call, and unlocks the exit.
 * - `wrong`: Logged as a misconception (correction and supporting quote withheld until the student passes),
 *   Crow caws, per-world Menace (0-3) escalates visually and aurally, and the NPC holding the relevant
 *   section glows as a hint.
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
 * @param onHighlightQuoteInText - Callback to open the Full-Text Object scrolled to and highlighting a quote ID.
 */
export function renderExitGateUi(
  container: HTMLElement,
  source: Source,
  onWorldUpdated: () => void,
  onReturnToHub: () => void,
  onHighlightQuoteInText?: (quoteId: string) => void
): void {
  const log = sessionStore.getPerSourceLog(source.id);
  const lastAttempt = log.attempts[log.attempts.length - 1];

  logFunctionCall('renderExitGateUi', {
    sourceId: source.id,
    completed: log.completed,
    currentMenace: log.currentMenace,
  });

  const activeQuestion =
    lastAttempt?.grade === 'wrong' && lastAttempt.rephrasedQuestion
      ? lastAttempt.rephrasedQuestion
      : source.exitQuestion.question;

  const autoCitedQuote =
    (lastAttempt?.grade === 'pass' || lastAttempt?.grade === 'partial')
      ? lastAttempt.supportingQuote
      : undefined;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-card exit-gate-card menace-border-${log.currentMenace}">
      <div class="modal-header">
        <div>
          <span class="badge-pill">🎩 Aurelius Finch — Exit Gate</span>
          <h3>Prove Your Understanding of This Source</h3>
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
                  ? '🐦 Kiskadee Call! Exit Unlocked'
                  : lastAttempt.grade === 'partial'
                    ? '✓ Partial Pass — Exit Unlocked'
                    : '🐦‍⬛ Crows Stir — Re-examine the Glowing Section'
              }:</strong>
              <p>${lastAttempt.feedback ?? ''}</p>
              ${
                autoCitedQuote
                  ? `<div class="auto-cited-quote-box" style="margin-top:0.65rem;padding:0.65rem 0.85rem;background:rgba(16,185,129,0.12);border-left:3px solid #10b981;border-radius:6px;">
                      <p style="margin:0 0 0.45rem 0;">
                        <strong>🎩 Aurelius Finch:</strong> "Quite right. As the text says: <em>'${autoCitedQuote.text}'</em>"
                      </p>
                      <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                        <button id="exit-see-in-text-btn" class="btn-secondary" data-quote-id="${autoCitedQuote.id}">
                          📜 See in text
                        </button>
                        <span class="subtle-text">✓ Added to your Evidence Satchel</span>
                      </div>
                    </div>`
                  : ''
              }
              ${
                (lastAttempt.grade === 'pass' || lastAttempt.grade === 'partial') &&
                log.misconception
                  ? `<div class="misconception-resolution" style="margin-top:0.55rem;">
                      <strong>Resolved Earlier Misconception:</strong> ${log.misconception.correction}
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
              <label for="exit-answer-input"><strong>Your Answer (in your own words):</strong></label>
              <textarea
                id="exit-answer-input"
                class="notes-textarea"
                rows="4"
                placeholder="Explain the key idea you learned from the inhabitants of this world..."
              >${lastAttempt?.answer ?? ''}</textarea>

              <div class="exit-submit-row">
                <button id="submit-exit-answer-btn" class="btn-primary">
                  ⚖️ Answer the Librarian
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

  container.querySelector('#exit-see-in-text-btn')?.addEventListener('click', (ev) => {
    const qId = (ev.currentTarget as HTMLElement).dataset.quoteId;
    if (qId && onHighlightQuoteInText) {
      container.classList.add('hidden');
      onHighlightQuoteInText(qId);
    }
  });

  const submitBtn = container.querySelector('#submit-exit-answer-btn') as HTMLButtonElement | null;
  submitBtn?.addEventListener('click', async () => {
    const answerInput = container.querySelector('#exit-answer-input') as HTMLTextAreaElement | null;
    const studentAnswer = answerInput?.value.trim() ?? '';

    if (!studentAnswer) {
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Librarian is listening...';

    try {
      const response = await fetch(APP_CONFIG.endpoints.exitGrade, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: source.id,
          sourceTitle: source.title,
          question: source.exitQuestion.question,
          expectedAnswer: source.exitQuestion.expectedAnswer,
          supportingQuoteIds: source.exitQuestion.supportingQuoteIds,
          studentAnswer,
          connected: source.connected,
          sections: source.sections?.map((s) => ({
            id: s.id,
            heading: s.heading,
            text: s.text,
            quoteTokens: s.quoteTokens.map((q) => ({ id: q.id, text: q.text })),
          })),
        }),
      });
      const result = (await response.json()) as {
        grade: ExitGrade;
        feedback: string;
        rephrasedQuestion?: string;
        hintSectionId?: string;
        correction?: string;
        sourceQuote?: string;
        supportingQuote?: {
          id: string;
          sectionId: string;
          text: string;
        };
      };

      const targetQuoteId = source.exitQuestion.supportingQuoteIds[0];
      const hintSection = source.sections?.find((s) =>
        s.quoteTokens.some((q) => q.id === targetQuoteId)
      );
      const supportingQuoteText =
        result.sourceQuote ??
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
          grade: result.grade,
          feedback: result.feedback,
          rephrasedQuestion: result.rephrasedQuestion,
          supportingQuote: result.supportingQuote,
        },
        result.grade === 'wrong'
          ? {
              answer: studentAnswer,
              correction: result.correction ?? source.exitQuestion.expectedAnswer,
              sourceQuote: supportingQuoteText,
            }
          : undefined,
        result.grade === 'wrong' ? (result.hintSectionId ?? hintSection?.id) : undefined
      );

      onWorldUpdated();
      renderExitGateUi(container, source, onWorldUpdated, onReturnToHub, onHighlightQuoteInText);
    } catch (err) {
      logFunctionCall('exitGateSubmitError', { error: String(err) });
      submitBtn.disabled = false;
      submitBtn.textContent = '⚖️ Answer the Librarian';
    }
  });
}
