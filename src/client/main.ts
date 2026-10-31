/**
 * @file main.ts
 * @description Main frontend entrypoint for "The Library of Worlds".
 * Initialises the WebGL renderer, coordinates switching between the 3D Victorian Library Hub
 * (`HubSceneController`) and the 360° Book World (`WorldSceneController`), and binds all HUD
 * overlays (Reading Path bar, Hover Tooltip, NPC Dialogue, Evidence Satchel, Notes Scroll,
 * Full-Text Viewer, and Librarian Exit Gate).
 *
 * Use cases:
 * 1. Startup: Loads the seed research question and verified sample `Source[]` across 5 tiers.
 * 2. Hub navigation: First-person WASD + mouse-look, hover tooltips ("Why this tier"), and clicking
 *    any book (on the 3D shelf or in the Lantern Path bar) to step inside its 360° world.
 * 3. Book World loop: Talking to section NPCs, collecting verbatim Quote Tokens into the Satchel,
 *    inspecting highlighted passages in the Full-Text modal, taking notes, and passing the Exit Gate.
 */

import * as THREE from 'three';
import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';
import type { Source } from '../shared/types';
import { audioManager } from './audioManager';
import { renderExitGateUi } from './exitGateUi';
import { renderFullTextModal } from './fullTextModal';
import { HubSceneController } from './hubScene';
import { runLibrarianPipelineStream } from './librarianNarratorUi';
import { renderNotesScrollUi } from './notesScrollUi';
import { renderNpcDialogueUi } from './npcDialogueUi';
import { renderSatchelUi } from './satchelUi';
import { sessionStore } from './sessionState';
import { WorldSceneController } from './worldScene';

const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
const questionInput = document.getElementById('research-question-input') as HTMLInputElement;
const askLibrarianBtn = document.getElementById('ask-librarian-btn') as HTMLButtonElement;
const forceRefreshCheckbox = document.getElementById('force-refresh-checkbox') as HTMLInputElement;
const librarianNarrationBanner = document.getElementById('librarian-narration-banner') as HTMLElement;
const ghostCountVal = document.getElementById('ghost-count-val') as HTMLElement;
const modeIndicator = document.getElementById('mode-indicator') as HTMLElement;
const readingPathBar = document.getElementById('reading-path-bar') as HTMLElement;
const worldToolbar = document.getElementById('world-toolbar') as HTMLElement;
const worldTitleBanner = document.getElementById('world-title-banner') as HTMLElement;
const hoverTooltip = document.getElementById('book-hover-tooltip') as HTMLElement;
const satchelContainer = document.getElementById('satchel-container') as HTMLElement;

const npcDialogueModal = document.getElementById('npc-dialogue-modal') as HTMLElement;
const fulltextModal = document.getElementById('fulltext-modal') as HTMLElement;
const notesScrollModal = document.getElementById('notes-scroll-modal') as HTMLElement;
const exitGateModal = document.getElementById('exit-gate-modal') as HTMLElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = APP_CONFIG.hub.toneMappingExposure;

/**
 * Displays or hides the "Why this tier" tooltip when hovering over a 3D book in the Hub.
 *
 * @param source - Hovered `Source` or `null`.
 * @param screenX - Mouse X position.
 * @param screenY - Mouse Y position.
 */
function handleHoverSource(source: Source | null, screenX: number, screenY: number): void {
  if (!source || sessionStore.getActiveSource() !== null) {
    hoverTooltip.classList.add('hidden');
    return;
  }
  const tierInfo = APP_CONFIG.tiers[source.tier];
  hoverTooltip.classList.remove('hidden');
  hoverTooltip.style.left = `${Math.min(window.innerWidth - 380, screenX + 16)}px`;
  hoverTooltip.style.top = `${Math.min(window.innerHeight - 220, screenY + 16)}px`;
  hoverTooltip.style.borderColor = tierInfo.cssColor;
  hoverTooltip.innerHTML = `
    <span class="badge-pill" style="border-color:${tierInfo.cssColor}">
      ${tierInfo.label.toUpperCase()} TIER • ${tierInfo.creature}
    </span>
    <h4>${source.title}</h4>
    <div class="subtle-text">${source.authors.join(', ')} ${source.year ? `(${source.year})` : ''}</div>
    <p style="margin:0.4rem 0;">${source.summary}</p>
    <strong>Why this tier (real metadata):</strong>
    <ul>
      ${source.tierReasons.map((r) => `<li>${r}</li>`).join('')}
    </ul>
    <div style="color:#fbbf24;font-weight:bold;">Click book to step inside its ${tierInfo.settingName} world →</div>
  `;
}

/**
 * Opens the Full-Text Object modal for the active source, optionally scrolling to a specific Quote Token.
 *
 * @param highlightQuoteId - Optional quote token ID to scroll to and highlight.
 */
function openFullTextViewer(highlightQuoteId?: string): void {
  logFunctionCall('openFullTextViewer', { highlightQuoteId });
  const activeSource = sessionStore.getActiveSource();
  if (!activeSource) {
    return;
  }
  renderFullTextModal(fulltextModal, activeSource, highlightQuoteId, () => {});
}

const hubController = new HubSceneController({
  onSelectBook: (sourceId) => {
    logFunctionCall('onSelectBook', { sourceId });
    sessionStore.enterBookWorld(sourceId);
  },
  onSelectLibrarian: () => {
    logFunctionCall('onSelectLibrarian', {});
    questionInput.focus();
    questionInput.select();
  },
  onHoverSource: handleHoverSource,
});

const worldController = new WorldSceneController({
  onSelectNpc: (sectionId) => {
    logFunctionCall('onSelectNpc', { sectionId });
    const src = sessionStore.getActiveSource();
    if (src) {
      sessionStore.visitNpc(src.id, sectionId);
    }
  },
  onSelectFullTextObject: () => {
    openFullTextViewer();
  },
  onSelectExitGate: () => {
    const src = sessionStore.getActiveSource();
    if (src) {
      renderExitGateUi(
        exitGateModal,
        src,
        () => {
          worldController.loadSourceWorld(src, sessionStore.getPerSourceLog(src.id));
        },
        () => {
          sessionStore.leaveBookWorld();
        },
        (quoteId) => {
          openFullTextViewer(quoteId);
        }
      );
    }
  },
});

/**
 * Synchronizes all DOM HUD elements and 3D scene contents whenever `sessionStore` updates.
 */
function syncUiAndScenes(): void {
  const session = sessionStore.getSession();
  const activeSource = sessionStore.getActiveSource();

  if (document.activeElement !== questionInput) {
    questionInput.value = session.question;
  }
  ghostCountVal.textContent = String(session.ghostCitationCount);

  const completedMap: Record<string, boolean> = {};
  for (const [sId, sLog] of Object.entries(session.perSource)) {
    completedMap[sId] = Boolean(sLog.completed);
  }

  // Render glowing Lantern Path bar across top of screen
  readingPathBar.innerHTML =
    `<strong style="font-size:0.78rem;color:#fde68a;white-space:nowrap;">🏮 Lantern Path (Easy → Hard):</strong>` +
    session.path
      .map((sId, idx) => {
        const src = session.sources.find((s) => s.id === sId);
        if (!src) {
          return '';
        }
        const tierInfo = APP_CONFIG.tiers[src.tier];
        const done = completedMap[sId];
        const isCurrent = activeSource?.id === sId;
        return `
          <button
            class="path-node-btn ${done ? 'completed' : ''}"
            style="border-color:${isCurrent ? '#ffffff' : tierInfo.cssColor}"
            data-jump-source="${src.id}"
            title="Enter ${tierInfo.label} World: ${src.title}"
          >
            <span>${done ? '✓' : `${idx + 1}.`} [${tierInfo.label}]</span>
            <span>${src.title.slice(0, 26)}…</span>
          </button>
        `;
      })
      .join('<span class="path-arrow">→</span>');

  readingPathBar.querySelectorAll('[data-jump-source]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sId = (btn as HTMLElement).dataset.jumpSource;
      if (sId) {
        sessionStore.enterBookWorld(sId);
      }
    });
  });

  if (!activeSource) {
    // Player is in the 3D Victorian Library Hub
    audioManager.stopAllMenaceAudio();
    modeIndicator.textContent = '📍 Victorian Hub (WASD Walk + Mouse Drag Look + Click Book)';
    worldToolbar.classList.add('hidden');
    satchelContainer.classList.add('hidden');
    npcDialogueModal.classList.add('hidden');
    hubController.populateSources(session.sources, session.path, completedMap);
  } else {
    // Player is inside a 360° Book World
    const tierInfo = APP_CONFIG.tiers[activeSource.tier];
    const log = sessionStore.getPerSourceLog(activeSource.id);
    modeIndicator.textContent = `🌍 Inside ${tierInfo.label} World: ${tierInfo.settingName} (360° Drag Look + Click NPCs)`;
    hoverTooltip.classList.add('hidden');

    worldToolbar.classList.remove('hidden');
    worldTitleBanner.innerHTML = `
      <span class="badge-pill" style="border-color:${tierInfo.cssColor}">${tierInfo.label.toUpperCase()} • ${tierInfo.settingName}</span>
      <strong style="margin-left:0.5rem;">${activeSource.title}</strong>
    `;

    satchelContainer.classList.remove('hidden');
    renderSatchelUi(satchelContainer, activeSource, (quoteId) => {
      openFullTextViewer(quoteId);
    });

    worldController.loadSourceWorld(activeSource, log);

    const activeSection = sessionStore.getActiveSection();
    if (activeSection) {
      renderNpcDialogueUi(npcDialogueModal, activeSource, activeSection, (quoteId) => {
        openFullTextViewer(quoteId);
      });
    } else {
      npcDialogueModal.classList.add('hidden');
    }
  }
}

// Toolbar button listeners
document.getElementById('open-fulltext-btn')?.addEventListener('click', () => {
  openFullTextViewer();
});

document.getElementById('open-notes-btn')?.addEventListener('click', () => {
  const src = sessionStore.getActiveSource();
  if (src) {
    renderNotesScrollUi(notesScrollModal, src, () => {});
  }
});

document.getElementById('open-exitgate-btn')?.addEventListener('click', () => {
  const src = sessionStore.getActiveSource();
  if (src) {
    renderExitGateUi(
      exitGateModal,
      src,
      () => {
        worldController.loadSourceWorld(src, sessionStore.getPerSourceLog(src.id));
      },
      () => {
        sessionStore.leaveBookWorld();
      },
      (quoteId) => {
        openFullTextViewer(quoteId);
      }
    );
  }
});

document.getElementById('back-to-hub-btn')?.addEventListener('click', () => {
  sessionStore.leaveBookWorld();
});

function triggerLibrarianSearch(forceOverride?: boolean): void {
  const q = questionInput.value.trim() || APP_CONFIG.seedQuestion;
  const forceRefresh = forceOverride ?? Boolean(forceRefreshCheckbox?.checked);
  if (sessionStore.getActiveSource()) {
    sessionStore.leaveBookWorld();
  }
  runLibrarianPipelineStream({
    question: q,
    forceRefresh,
    bannerEl: librarianNarrationBanner,
    askBtnEl: askLibrarianBtn,
  });
}

askLibrarianBtn.addEventListener('click', () => {
  triggerLibrarianSearch();
});

questionInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    triggerLibrarianSearch();
  }
});

// Pointer & Keyboard events routed to active scene controller
window.addEventListener('keydown', (ev) => {
  hubController.onKeyDown(ev.code);
});

window.addEventListener('keyup', (ev) => {
  hubController.onKeyUp(ev.code);
});

canvas.addEventListener('pointerdown', (ev) => {
  if (sessionStore.getActiveSource()) {
    worldController.onPointerDown(ev.clientX, ev.clientY);
  } else {
    hubController.onPointerDown(ev.clientX, ev.clientY);
  }
});

window.addEventListener('pointermove', (ev) => {
  const rect = canvas.getBoundingClientRect();
  if (sessionStore.getActiveSource()) {
    worldController.onPointerMove(ev.clientX, ev.clientY);
  } else {
    hubController.onPointerMove(ev.clientX, ev.clientY, rect);
  }
});

window.addEventListener('pointerup', (ev) => {
  const rect = canvas.getBoundingClientRect();
  if (sessionStore.getActiveSource()) {
    worldController.onPointerUp(ev.clientX, ev.clientY, rect);
  } else {
    hubController.onPointerUp(ev.clientX, ev.clientY, rect);
  }
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  hubController.camera.aspect = w / h;
  hubController.camera.updateProjectionMatrix();
  worldController.camera.aspect = w / h;
  worldController.camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

sessionStore.subscribe(syncUiAndScenes);
syncUiAndScenes();

// Automatically load the cached pipeline result (or run the pipeline if uncached) for the seed question
triggerLibrarianSearch(false);

// Main Three.js animation loop
let lastTime = performance.now();
function animate(now: number): void {
  requestAnimationFrame(animate);
  const deltaSeconds = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const activeEl = document.activeElement;
  const isTyping =
    activeEl instanceof HTMLInputElement ||
    activeEl instanceof HTMLTextAreaElement ||
    activeEl instanceof HTMLSelectElement;

  if (sessionStore.getActiveSource()) {
    worldController.update(deltaSeconds);
    renderer.render(worldController.scene, worldController.camera);
  } else {
    hubController.update(deltaSeconds, !isTyping);
    renderer.render(hubController.scene, hubController.camera);
  }
}

requestAnimationFrame(animate);
