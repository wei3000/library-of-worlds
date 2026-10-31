/**
 * @file librarianNarratorUi.ts
 * @description Live SSE Librarian Narration controller for "The Library of Worlds".
 * Connects to `GET /api/research/stream` via `EventSource` when the student asks the Head Librarian
 * a research question, displaying real-time Victorian narration of each pipeline stage
 * ("Searching the stacks… 9 candidates found… 2 ghost citations dismissed… shelving 7 volumes…")
 * and updating the 3D shelves and Lantern Path upon completion.
 *
 * Use cases:
 * 1. Live demo narration: Showing the student and judges how candidate sources are discovered,
 *    verified against Crossref/arXiv/Semantic Scholar, filtered for ghost citations, and shelved.
 * 2. Cached vs Force-Refresh runs: Supporting instant cached retrieval or forced live execution.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { PipelineProgressEvent } from '../shared/types';
import { sessionStore } from './sessionState';

let activeEventSource: EventSource | null = null;
let autoHideTimer: number | null = null;

/**
 * Starts streaming the Research Pipeline for `question` via SSE (`GET /api/research/stream`),
 * rendering each `PipelineProgressEvent` inside the Librarian Narration Banner and updating
 * `sessionStore` when the pipeline completes.
 *
 * @param params - Question string, `forceRefresh` flag, banner DOM element, and button element.
 */
export function runLibrarianPipelineStream(params: {
  question: string;
  forceRefresh: boolean;
  bannerEl: HTMLElement;
  askBtnEl: HTMLButtonElement;
}): void {
  const { question, forceRefresh, bannerEl, askBtnEl } = params;
  logFunctionCall('runLibrarianPipelineStream', { question, forceRefresh });

  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
  if (autoHideTimer !== null) {
    window.clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  askBtnEl.disabled = true;
  askBtnEl.textContent = '⏳ Consulting Stacks…';
  bannerEl.classList.remove('hidden');

  const renderBanner = (
    stage: string,
    narration: string,
    elapsedMs: number,
    isDone = false,
    isError = false
  ): void => {
    const secs = (elapsedMs / 1000).toFixed(1);
    bannerEl.innerHTML = `
      <div class="narrator-inner ${isError ? 'narrator-error' : isDone ? 'narrator-done' : ''}">
        <div class="narrator-avatar">🎩 Head Librarian</div>
        <div class="narrator-text">
          <strong>"${narration}"</strong>
          <span class="subtle-text" style="margin-left:0.6rem;">[${stage.toUpperCase()} • ${secs}s]</span>
        </div>
        ${
          isDone || isError
            ? `<button id="dismiss-narrator-btn" class="btn-mini" title="Dismiss banner">✕</button>`
            : `<span class="narrator-spinner">🕯️</span>`
        }
      </div>
    `;
    bannerEl.querySelector('#dismiss-narrator-btn')?.addEventListener('click', () => {
      bannerEl.classList.add('hidden');
    });
  };

  renderBanner(
    'initializing',
    `Opening the Grand Catalogue for: "${question}"…`,
    0
  );

  const streamUrl = `${APP_CONFIG.endpoints.researchStream}?question=${encodeURIComponent(
    question
  )}&force=${forceRefresh ? 'true' : 'false'}`;

  const es = new EventSource(streamUrl);
  activeEventSource = es;

  es.onmessage = (ev) => {
    try {
      const event = JSON.parse(ev.data) as PipelineProgressEvent;
      if (event.stage === 'complete' && event.result) {
        renderBanner(
          event.result.fromCache ? 'cached' : 'complete',
          event.narration,
          event.elapsedMs,
          true,
          false
        );
        sessionStore.setQuestionAndSources(
          event.result.question,
          event.result.sources,
          event.result.ghostCitationCount
        );
        es.close();
        activeEventSource = null;
        askBtnEl.disabled = false;
        askBtnEl.textContent = '🎩 Ask Librarian';

        autoHideTimer = window.setTimeout(() => {
          bannerEl.classList.add('hidden');
        }, 12000);
      } else if (event.stage === 'error') {
        renderBanner('error', event.narration, event.elapsedMs, false, true);
        es.close();
        activeEventSource = null;
        askBtnEl.disabled = false;
        askBtnEl.textContent = '🎩 Ask Librarian';
      } else {
        renderBanner(event.stage, event.narration, event.elapsedMs, false, false);
      }
    } catch {
      // Ignore malformed SSE heartbeats
    }
  };

  es.onerror = () => {
    if (activeEventSource === es) {
      es.close();
      activeEventSource = null;
      askBtnEl.disabled = false;
      askBtnEl.textContent = '🎩 Ask Librarian';
    }
  };
}
