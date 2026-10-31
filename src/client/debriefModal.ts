/**
 * @file debriefModal.ts
 * @description Milestone 4 Exit Debrief & Mischievous Elf resolution modal for "The Library of Worlds".
 * Triggered when the student clicks the Library Exit Door (or a mischievous Elf) in the 3D Hub, or
 * clicks the "🚪 Exit Debrief & PDF" button in the top bar.
 *
 * Head Librarian Aurelius Finch asks:
 * "Before you go — what is your answer to your question, and which sources do you trust most and why?"
 *
 * Submitting the synthesis calls `POST /api/debrief-grade`:
 * - Supported claims receive a green check badge and source link.
 * - Unsupported or overstated claims spawn a mischievous Library Elf (`/art/elf.png`) who giggles
 *   (`audioManager.playElfGiggle()`) and holds up the claim banner both in the 3D Hub and in this UI.
 * - The student can click to Revise the claim, Attach a collected Quote Token / Source, or Dismiss
 *   the claim ("Shoo Elf Away") before opening the printable Borrowing Record PDF.
 *
 * Use cases:
 * 1. Evaluating the student's final literature review synthesis across tiers.
 * 2. Interactive resolution of Elf-flagged unsupported or overstated claims.
 * 3. Transitioning directly to the printable Borrowing Record PDF (`borrowingRecordModal.ts`).
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { TakeawayClaim } from '../shared/types';
import { audioManager } from './audioManager';
import { sessionStore } from './sessionState';

export interface DebriefModalCallbacks {
  onClaimsUpdated: (claims: TakeawayClaim[]) => void;
  onOpenBorrowingRecord: () => void;
}

let lastLibrarianComment =
  'Before you go — what is your answer to your question, and which sources do you trust most and why?';

/**
 * Renders and opens the Exit Debrief & Mischievous Elf Claim Verifier modal.
 *
 * @param container - Modal DOM element (`#debrief-modal`).
 * @param callbacks - Callbacks for updating 3D Hub Elves and opening the Borrowing Record PDF.
 * @param focusClaimId - Optional claim ID to highlight when the user clicked a 3D Elf in the Hub.
 */
export function renderDebriefModal(
  container: HTMLElement,
  callbacks: DebriefModalCallbacks,
  focusClaimId?: string
): void {
  const session = sessionStore.getSession();
  logFunctionCall('renderDebriefModal', {
    claimCount: session.takeaway.claims.length,
    focusClaimId,
  });

  container.classList.remove('hidden');

  const allTokens = sessionStore.getAllCollectedTokens();
  const activeElves = session.takeaway.claims.filter(
    (c) => c.status === 'unsupported' || c.status === 'overstated'
  );

  const defaultDraft =
    session.takeaway.transcript ||
    buildSuggestedDraftFromSession();

  container.innerHTML = `
    <div class="modal-card debrief-card" style="max-width:840px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
      <div style="display:flex;gap:0.85rem;align-items:center;">
        <img
          src="${APP_CONFIG.art.librarian}"
          alt="Head Librarian Aurelius Finch"
          style="width:62px;height:62px;object-fit:contain;border-radius:50%;border:2px solid #d4af37;background:#fff;"
        />
        <div>
          <span class="badge-pill" style="border-color:#d4af37">🚪 LIBRARY EXIT DEBRIEF • HEAD LIBRARIAN AURELIUS FINCH</span>
          <h2 style="margin:0.25rem 0;">Final Synthesis & Source Trust Debrief</h2>
          <div class="subtle-text">${lastLibrarianComment}</div>
        </div>
      </div>
      <button id="close-debrief-btn" class="btn-secondary">Return to Hub</button>
    </div>

    <div style="background:rgba(0,0,0,0.32);padding:0.75rem;border-radius:6px;border-left:3px solid #d4af37;margin:0.65rem 0;">
      <div class="subtle-text">Research Question:</div>
      <div style="font-weight:bold;color:#fef3c7;">${session.question}</div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.35rem;">
      <label class="subtle-text" for="debrief-transcript-input">
        Your synthesis (answer the question & explain which tier/sources you trust most):
      </label>
      <div style="display:flex;gap:0.45rem;">
        <button id="debrief-autodraft-btn" class="btn-secondary" style="padding:0.25rem 0.6rem;font-size:0.78rem;">
          ✨ Auto-Draft from Visited Books
        </button>
        <button id="debrief-add-elf-claim-btn" class="btn-secondary" style="padding:0.25rem 0.6rem;font-size:0.78rem;border-color:#f87171;color:#fecaca;">
          + Add Overstated Claim (Test Elf 🧝)
        </button>
      </div>
    </div>

    <textarea
      id="debrief-transcript-input"
      class="notes-textarea"
      style="min-height:96px;"
      placeholder="Summarize your answer and explain why peer-reviewed Wizard/Archmage sources outweigh Imp blog posts..."
    >${defaultDraft}</textarea>

    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.6rem;margin-top:0.55rem;flex-wrap:wrap;">
      <button id="submit-debrief-btn" class="btn-primary">
        🔍 Verify Claims with Librarian
      </button>
      <button id="open-borrowing-record-btn" class="btn-primary" style="background:linear-gradient(135deg,#059669,#047857);color:#ffffff;">
        📜 Open Borrowing Record (Print / Save PDF)
      </button>
    </div>

    ${
      session.takeaway.claims.length > 0
        ? `
        <div style="margin-top:0.85rem;border-top:1px solid rgba(212,175,55,0.3);padding-top:0.75rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
            <strong style="color:#fde68a;">
              Claim Verification (${session.takeaway.claims.filter((c) => c.status === 'supported').length} Supported • ${activeElves.length} Mischievous ${activeElves.length === 1 ? 'Elf' : 'Elves'} Active)
            </strong>
            ${
              activeElves.length > 0
                ? `<span style="color:#fca5a5;font-size:0.82rem;">🧝 Resolve or shoo away mischievous elves below (or click them in the 3D Hub)!</span>`
                : `<span style="color:#6ee7b7;font-size:0.82rem;">✓ All claims verified or resolved! Ready to print your Borrowing Record.</span>`
            }
          </div>

          <div style="display:flex;flex-direction:column;gap:0.6rem;max-height:260px;overflow-y:auto;padding-right:0.25rem;">
            ${session.takeaway.claims
              .map((claim) => renderClaimCardHtml(claim, session.sources, allTokens, focusClaimId))
              .join('')}
          </div>
        </div>
      `
        : ''
    }
    </div>
  `;

  document.getElementById('close-debrief-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
  });

  document.getElementById('open-borrowing-record-btn')?.addEventListener('click', () => {
    const transcriptEl = document.getElementById('debrief-transcript-input') as HTMLTextAreaElement | null;
    if (transcriptEl && transcriptEl.value.trim() && !sessionStore.getSession().takeaway.transcript) {
      sessionStore.recordTakeawayDebrief(transcriptEl.value.trim(), []);
    }
    container.classList.add('hidden');
    callbacks.onOpenBorrowingRecord();
  });

  document.getElementById('debrief-autodraft-btn')?.addEventListener('click', () => {
    const transcriptEl = document.getElementById('debrief-transcript-input') as HTMLTextAreaElement | null;
    if (transcriptEl) {
      transcriptEl.value = buildSuggestedDraftFromSession();
    }
  });

  document.getElementById('debrief-add-elf-claim-btn')?.addEventListener('click', () => {
    const transcriptEl = document.getElementById('debrief-transcript-input') as HTMLTextAreaElement | null;
    if (transcriptEl) {
      const current = transcriptEl.value.trim();
      const elfBait =
        'Furthermore, a single Imp blog post guarantees 100% zero-error identification across all unseen species forever.';
      transcriptEl.value = current ? `${current} ${elfBait}` : elfBait;
    }
  });

  document.getElementById('submit-debrief-btn')?.addEventListener('click', async () => {
    const transcriptEl = document.getElementById('debrief-transcript-input') as HTMLTextAreaElement | null;
    const submitBtn = document.getElementById('submit-debrief-btn') as HTMLButtonElement | null;
    const transcript = transcriptEl?.value.trim() ?? '';
    if (!transcript) {
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Librarian is checking claims against the shelves...';
    }

    try {
      const res = await fetch(APP_CONFIG.endpoints.debriefGrade, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: session.question,
          transcript,
          sources: session.sources,
        }),
      });
      const data = await res.json();
      lastLibrarianComment =
        data.librarianComment ||
        'Let us inspect how each of your claims holds up against our verified volumes.';
      const claims: TakeawayClaim[] = Array.isArray(data.claims) ? data.claims : [];
      sessionStore.recordTakeawayDebrief(transcript, claims, data.suggestedNextReads);

      const hasElves = claims.some(
        (c) => c.status === 'unsupported' || c.status === 'overstated'
      );
      if (hasElves) {
        audioManager.playElfGiggle();
      } else {
        audioManager.playKiskadeeCall();
      }

      callbacks.onClaimsUpdated(sessionStore.getSession().takeaway.claims);
      renderDebriefModal(container, callbacks);
    } catch {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🔍 Verify Claims with Librarian';
      }
    }
  });

  // Bind resolution buttons for each Elf-flagged claim card
  container.querySelectorAll('[data-resolve-revise]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const claimId = (btn as HTMLElement).dataset.resolveRevise;
      if (!claimId) {
        return;
      }
      const inputEl = document.getElementById(`revise-input-${claimId}`) as HTMLInputElement | null;
      const sourceSelectEl = document.getElementById(`cite-source-${claimId}`) as HTMLSelectElement | null;
      const revisedText = inputEl?.value.trim();
      const chosenSourceId = sourceSelectEl?.value || session.sources[0]?.id;

      sessionStore.resolveTakeawayClaim(claimId, {
        status: 'supported',
        revisedText,
        supportedBy: chosenSourceId,
        explanation: 'Claim revised and anchored to a verified library source — the Elf tips its cap and vanishes!',
      });
      audioManager.playTokenCollect();
      callbacks.onClaimsUpdated(sessionStore.getSession().takeaway.claims);
      renderDebriefModal(container, callbacks);
    });
  });

  container.querySelectorAll('[data-resolve-dismiss]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const claimId = (btn as HTMLElement).dataset.resolveDismiss;
      if (!claimId) {
        return;
      }
      sessionStore.resolveTakeawayClaim(claimId, {
        status: 'dismissed',
        explanation: 'Unbacked claim retracted by student — mischievous Elf shooed away.',
      });
      callbacks.onClaimsUpdated(sessionStore.getSession().takeaway.claims);
      renderDebriefModal(container, callbacks);
    });
  });
}

/**
 * Renders an individual claim card inside the Debrief modal, including the mischievous Elf
 * sprite and resolution controls when `status === 'unsupported'` or `'overstated'`.
 */
function renderClaimCardHtml(
  claim: TakeawayClaim,
  sources: Array<{ id: string; title: string; tier: string }>,
  allTokens: Array<{ token: { id: string; sourceId: string; text: string }; sourceTitle: string }>,
  focusClaimId?: string
): string {
  const isElf = claim.status === 'unsupported' || claim.status === 'overstated';
  const isDismissed = claim.status === 'dismissed';
  const isFocused = Boolean(focusClaimId && claim.id === focusClaimId);

  const matchedSource = sources.find((s) => s.id === claim.supportedBy);

  const borderColor = isElf
    ? isFocused
      ? '#facc15'
      : '#ef4444'
    : isDismissed
      ? '#6b7280'
      : '#10b981';

  const bgColor = isElf
    ? 'rgba(127, 29, 29, 0.32)'
    : isDismissed
      ? 'rgba(55, 65, 81, 0.25)'
      : 'rgba(6, 78, 59, 0.28)';

  return `
    <div style="border:1px solid ${borderColor};background:${bgColor};border-radius:8px;padding:0.7rem;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;">
        <div style="display:flex;gap:0.65rem;align-items:flex-start;">
          ${
            isElf
              ? `<img src="${APP_CONFIG.art.elf}" alt="Mischievous Elf" style="width:46px;height:46px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid #f87171;flex-shrink:0;" />`
              : ''
          }
          <div>
            <span class="badge-pill" style="border-color:${borderColor}">
              ${
                claim.status === 'supported'
                  ? '✓ SUPPORTED CLAIM'
                  : claim.status === 'overstated'
                    ? '🧝 ELF ALERT: OVERSTATED CLAIM'
                    : claim.status === 'unsupported'
                      ? '🧝 ELF ALERT: UNSUPPORTED CLAIM'
                      : '✗ RETRACTED / DISMISSED'
              }
            </span>
            <div style="font-weight:bold;color:#fef3c7;margin-top:0.25rem;${isDismissed ? 'text-decoration:line-through;opacity:0.7;' : ''}">
              "${claim.text}"
            </div>
            <div class="subtle-text" style="margin-top:0.2rem;">
              ${claim.explanation || ''}
              ${matchedSource ? ` • <strong>Source:</strong> [${matchedSource.tier.toUpperCase()}] ${matchedSource.title}` : ''}
            </div>
          </div>
        </div>
      </div>

      ${
        isElf && claim.id
          ? `
          <div style="margin-top:0.55rem;padding-top:0.5rem;border-top:1px dashed rgba(248,113,113,0.4);display:flex;flex-direction:column;gap:0.4rem;">
            <div style="display:flex;gap:0.45rem;flex-wrap:wrap;align-items:center;">
              <input
                id="revise-input-${claim.id}"
                type="text"
                value="${claim.text.replace(/"/g, '&quot;')}"
                style="flex:1;min-width:220px;padding:0.35rem 0.55rem;border-radius:5px;border:1px solid #f87171;background:rgba(0,0,0,0.45);color:#fff;font-size:0.84rem;"
                placeholder="Revise claim so it matches the evidence..."
              />
              <select
                id="cite-source-${claim.id}"
                style="padding:0.35rem 0.5rem;border-radius:5px;border:1px solid #d4af37;background:#1c1624;color:#fef3c7;font-size:0.8rem;max-width:260px;"
              >
                ${sources
                  .map(
                    (s) =>
                      `<option value="${s.id}">[${s.tier.toUpperCase()}] ${s.title.slice(0, 38)}…</option>`
                  )
                  .join('')}
                ${allTokens
                  .map(
                    (t) =>
                      `<option value="${t.token.sourceId}">📜 Quote: "${t.token.text.slice(0, 34)}…"</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div style="display:flex;gap:0.45rem;justify-content:flex-end;">
              <button
                class="btn-secondary"
                style="padding:0.28rem 0.65rem;font-size:0.8rem;border-color:#10b981;color:#a7f3d0;"
                data-resolve-revise="${claim.id}"
              >
                ✓ Revise & Anchor to Source
              </button>
              <button
                class="btn-secondary"
                style="padding:0.28rem 0.65rem;font-size:0.8rem;border-color:#9ca3af;color:#e5e7eb;"
                data-resolve-dismiss="${claim.id}"
              >
                👋 Dismiss Claim (Shoo Elf Away)
              </button>
            </div>
          </div>
        `
          : ''
      }
    </div>
  `;
}

/**
 * Generates a grounded synthesis draft from the shelved sources so the student (or demo presenter)
 * can test the Exit Debrief in one click.
 */
function buildSuggestedDraftFromSession(): string {
  const session = sessionStore.getSession();
  const byTier = [...session.sources].sort(
    (a, b) => APP_CONFIG.tiers[b.tier].order - APP_CONFIG.tiers[a.tier].order
  );
  const topSource = byTier[0];
  const lowSource = byTier[byTier.length - 1];

  if (!topSource) {
    return 'To evaluate open-set individual identification without labels, I should hold out entire individuals as unknown classes and measure Open-Set AUC and cluster alignment.';
  }

  return (
    `To answer "${session.question}", I should use self-supervised acoustic embeddings and evaluate with disjoint open-set holdout individuals and Hungarian cluster assignment rather than closed-set accuracy. ` +
    `I trust ${topSource.title} (${topSource.tier.toUpperCase()} tier) most because it is backed by ${topSource.tierReasons[0] || 'peer-reviewed methodology'}, whereas ${lowSource?.title || 'the Imp blog post'} (${lowSource?.tier.toUpperCase() || 'IMP'} tier) is useful for intuition but lacks peer review.`
  );
}
