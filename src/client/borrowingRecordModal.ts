/**
 * @file borrowingRecordModal.ts
 * @description Printable Victorian Library Borrowing Record (HTML + `@media print` PDF)
 * for "The Library of Worlds" (Milestone 4).
 *
 * Renders the complete literature-review portfolio from `sessionStore.getSession()`:
 * 1. Research question, date, Verified Sources shelved vs. Ghost Citations discarded.
 * 2. Ordered Reading Path (`Imp → Archmage`) with tier, creature, title, authors, year, venue,
 *    DOI/URL, real-metadata `"Why this tier"` reasons, and Connected vs. Abstract-only badge.
 * 3. Per-book exploration log: student Notes Scroll, verbatim Quote Tokens collected (with
 *    section attribution), Exit Gate question + student's final answer + auto-cited quote,
 *    any resolved Misconception (`answer → correction + supporting quote`), and highest Menace reached.
 * 4. Final takeaway synthesis, verified claims & mischievous Elf resolutions, and 2–3 Suggested Next Reads.
 * 5. Footer containing the xeno-canto.org natural bird recording attributions (`crow-caw.mp3` and `kiskadee-call.mp3`).
 *
 * Use cases:
 * 1. Viewing the student's complete research journey in a clean Victorian ledger layout.
 * 2. Exporting a clean PDF via `window.print()` (`@media print` stylesheet hides the 3D canvas and HUD).
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import { sessionStore } from './sessionState';

/**
 * Renders and opens the printable Borrowing Record modal (`#borrowing-record-modal`).
 *
 * @param container - Target modal DOM element (`#borrowing-record-modal`).
 * @param onBackToDebrief - Callback to return to the Exit Debrief modal.
 */
export function renderBorrowingRecordModal(
  container: HTMLElement,
  onBackToDebrief: () => void
): void {
  const session = sessionStore.getSession();
  logFunctionCall('renderBorrowingRecordModal', {
    sourceCount: session.sources.length,
    ghostCitationCount: session.ghostCitationCount,
  });

  container.classList.remove('hidden');

  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const orderedSources = session.path
    .map((id) => session.sources.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const nextReads =
    session.suggestedNextReads && session.suggestedNextReads.length > 0
      ? session.suggestedNextReads
      : [
          {
            title:
              'Stowell et al. (2019) — Automatic acoustic identification of individuals in wild populations',
            reason:
              'Foundational peer-reviewed methodology for open-set acoustic holdout splits and confounding background noise.',
            url: 'https://doi.org/10.1111/2041-210X.13103',
          },
          {
            title: 'Scheirer et al. (2013) — Toward Open Set Recognition (IEEE TPAMI)',
            reason: 'Formalizes open-space risk and Open-Set AUC / FAR-FRR evaluation metrics.',
            url: 'https://doi.org/10.1109/TPAMI.2012.256',
          },
        ];

  container.innerHTML = `
    <div class="modal-card borrowing-record-card" style="max-width:920px;">
    <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;margin-bottom:0.85rem;padding-bottom:0.65rem;border-bottom:1px solid rgba(212,175,55,0.35);">
      <div style="display:flex;gap:0.5rem;">
        <button id="back-to-debrief-btn" class="btn-secondary">← Back to Exit Debrief</button>
        <button id="close-borrowing-record-btn" class="btn-secondary">Close to Hub</button>
      </div>
      <button id="print-borrowing-record-btn" class="btn-primary" style="font-size:0.95rem;padding:0.5rem 1.15rem;">
        🖨️ Print / Save as PDF
      </button>
    </div>

    <div class="borrowing-record-sheet" id="printable-borrowing-sheet">
      <header class="br-header">
        <div class="br-crest">🏛️ THE LIBRARY OF WORLDS — OFFICIAL BORROWING RECORD</div>
        <h1>Literature Review & Source Verification Ledger</h1>
        <div class="br-meta-row">
          <span><strong>Date:</strong> ${dateStr}</span>
          <span><strong>Head Librarian:</strong> Aurelius Finch</span>
          <span><strong>Verified Volumes Shelved:</strong> ${session.sources.length}</span>
          <span><strong>Ghost Citations Dismissed:</strong> ${session.ghostCitationCount}</span>
        </div>
        <div class="br-question-box">
          <strong>Research Question:</strong> "${session.question}"
        </div>
      </header>

      <section class="br-section">
        <h2>I. Ordered Reading Path (Imp → Archmage) & Metadata Tiering</h2>
        <div class="br-table-list">
          ${orderedSources
            .map((src, idx) => {
              const tierInfo = APP_CONFIG.tiers[src.tier];
              const log = sessionStore.getPerSourceLog(src.id);
              const collectedTokens = sessionStore.getCollectedTokensForSource(src.id);
              const finalAttempt = log.attempts[log.attempts.length - 1];

              return `
                <article class="br-source-card">
                  <div class="br-source-header">
                    <div>
                      <span class="br-tier-badge" style="border-color:${tierInfo.cssColor};">
                        #${idx + 1} • ${tierInfo.label.toUpperCase()} TIER (${tierInfo.creature})
                      </span>
                      <span class="br-world-badge">
                        ${src.connected ? `Connected World: ${tierInfo.settingName}` : 'Unconnected Wing (Abstract-Only)'}
                      </span>
                      <span class="br-status-badge">
                        ${log.completed ? '✓ Exit Gate Passed (Great Kiskadee)' : '○ Explored / In Progress'}
                      </span>
                    </div>
                    <div class="br-menace-pill">
                      Highest Menace Reached: ${log.maxMenace} / 3
                    </div>
                  </div>

                  <h3>${src.title}</h3>
                  <div class="br-citation-line">
                    <strong>Authors:</strong> ${src.authors.join(', ')}
                    ${src.year ? ` • <strong>Year:</strong> ${src.year}` : ''}
                    ${src.venue ? ` • <strong>Venue:</strong> ${src.venue}` : ''}
                    ${typeof src.citationCount === 'number' ? ` • <strong>Citations:</strong> ${src.citationCount}` : ''}
                  </div>
                  <div class="br-citation-line">
                    ${src.doi ? `<strong>DOI:</strong> ${src.doi} • ` : ''}
                    ${src.arxivId ? `<strong>arXiv:</strong> ${src.arxivId} • ` : ''}
                    <strong>URL:</strong> <a href="${src.url}" target="_blank" rel="noopener noreferrer">${src.url}</a>
                  </div>

                  <div class="br-subbox">
                    <strong>Why This Tier (Verified Metadata Reasons):</strong>
                    <ul>
                      ${src.tierReasons.map((r) => `<li>${r}</li>`).join('')}
                    </ul>
                  </div>

                  ${
                    log.notes.trim()
                      ? `
                      <div class="br-subbox">
                        <strong>Student Notes Scroll:</strong>
                        <pre class="br-notes-pre">${log.notes.trim()}</pre>
                      </div>
                    `
                      : ''
                  }

                  ${
                    collectedTokens.length > 0
                      ? `
                      <div class="br-subbox">
                        <strong>Verbatim Quote Tokens Collected (${collectedTokens.length}):</strong>
                        <ul>
                          ${collectedTokens
                            .map((qt) => {
                              const sec = src.sections?.find((s) => s.id === qt.sectionId);
                              return `<li><em>"${qt.text}"</em> — <span class="br-muted">[${sec ? sec.heading : qt.sectionId}]</span></li>`;
                            })
                            .join('')}
                        </ul>
                      </div>
                    `
                      : ''
                  }

                  ${
                    finalAttempt
                      ? `
                      <div class="br-subbox">
                        <strong>Exit Gate Question:</strong> ${src.exitQuestion.question}<br/>
                        <strong>Student Final Answer (${finalAttempt.grade.toUpperCase()}):</strong> "${finalAttempt.answer}"
                        ${
                          finalAttempt.supportingQuote
                            ? `<br/><strong>Librarian Auto-Cited Supporting Passage:</strong> <em>"${finalAttempt.supportingQuote.text}"</em>`
                            : ''
                        }
                      </div>
                    `
                      : ''
                  }

                  ${
                    log.misconception
                      ? `
                      <div class="br-subbox br-misconception-box">
                        <strong>Misconception Resolved:</strong><br/>
                        <span>• <em>Initial Misconception:</em> "${log.misconception.answer}"</span><br/>
                        <span>• <em>Librarian Correction:</em> ${log.misconception.correction}</span><br/>
                        <span>• <em>Supporting Source Quote:</em> "${log.misconception.sourceQuote}"</span>
                      </div>
                    `
                      : ''
                  }
                </article>
              `;
            })
            .join('')}
        </div>
      </section>

      <section class="br-section">
        <h2>II. Final Takeaway Synthesis & Claim Verification</h2>
        <div class="br-subbox">
          <strong>Student Synthesis:</strong>
          <p style="margin:0.35rem 0;">
            ${
              session.takeaway.transcript
                ? `"${session.takeaway.transcript}"`
                : '<em>No final synthesis recorded yet — complete the Exit Debrief with Head Librarian Aurelius Finch.</em>'
            }
          </p>
        </div>

        ${
          session.takeaway.claims.length > 0
            ? `
            <div class="br-subbox">
              <strong>Verified Claims & Mischievous Elf Resolutions:</strong>
              <ul>
                ${session.takeaway.claims
                  .map((c) => {
                    const src = session.sources.find((s) => s.id === c.supportedBy);
                    return `
                      <li>
                        <strong>[${c.status.toUpperCase()}]</strong> "${c.text}"
                        ${src ? ` — <em>Backed by ${src.title} (${src.tier.toUpperCase()})</em>` : ''}
                        ${c.explanation ? ` <span class="br-muted">(${c.explanation})</span>` : ''}
                      </li>
                    `;
                  })
                  .join('')}
              </ul>
            </div>
          `
            : ''
        }

        <div class="br-subbox">
          <strong>Suggested Next Reads:</strong>
          <ul>
            ${nextReads
              .map(
                (nr) => `
                <li>
                  <strong>${nr.title}</strong> — ${nr.reason}
                  ${nr.url ? ` (<a href="${nr.url}" target="_blank" rel="noopener noreferrer">${nr.url}</a>)` : ''}
                </li>
              `
              )
              .join('')}
          </ul>
        </div>
      </section>

      <footer class="br-footer">
        <div><strong>Audio Attribution (xeno-canto.org Natural Bird Recordings):</strong></div>
        <div>• ${APP_CONFIG.audioAttribution.crowCaw}</div>
        <div>• ${APP_CONFIG.audioAttribution.kiskadeeCall}</div>
      </footer>
    </div>
    </div>
  `;

  document.getElementById('back-to-debrief-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
    onBackToDebrief();
  });

  document.getElementById('close-borrowing-record-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
  });

  document.getElementById('print-borrowing-record-btn')?.addEventListener('click', () => {
    logFunctionCall('printBorrowingRecordPdf', {});
    window.print();
  });
}
