/**
 * @file config.ts
 * @description Centralised, secret-free configuration for "The Library of Worlds".
 * Groups all configurable items including Gemini model names, fallback chains,
 * API endpoints, tier thresholds, visual styling per tier, world templates,
 * movement speeds, and audio paths.
 *
 * SECURITY NOTE: This file is imported by both client and server.
 * NEVER place API keys, tokens, or secrets in this file.
 * The Gemini API key is read exclusively from `process.env.GEMINI_API_KEY` on the server.
 *
 * Use cases:
 * 1. Backend GenAI calls: Reference model names, retry timings, and fallback models.
 * 2. Tier classification & rendering: Lookup tier names, creature labels, colours,
 *    world settings, and full-text object names.
 * 3. Frontend Hub & World scenes: Configure camera, lighting, fog, and seed prompts.
 */

import type { SourceTier } from './types';

export const APP_CONFIG = {
  appName: 'The Library of Worlds',
  tagline: 'Every source a world to explore.',
  seedQuestion:
    'How do I design an evaluation for open-set individual identification from animal vocalisations when I have no labels?',

  /** Backend API endpoints called by the frontend (proxied via Vite in dev). */
  endpoints: {
    health: '/api/health',
    research: '/api/research',
    researchStream: '/api/research/stream',
    world: '/api/world',
    exitGrade: '/api/exit-grade',
    debriefGrade: '/api/debrief-grade',
    tts: '/api/tts',
    liveToken: '/api/live-token',
  },

  /** Milestone 2 Research Pipeline & External Verification settings. */
  pipeline: {
    /** Relative directory on disk for caching pipeline results (`cache/<hash>.json`). */
    cacheDir: 'cache',
    /** Hard timeout in milliseconds for any external verification or full-text HTTP call (~10s). */
    externalCallTimeoutMs: 10000,
    /** Minimum character length of extracted body text to qualify as a connected world. */
    minConnectedTextLength: 450,
    /** Maximum character length of extracted source text sent into the world extraction LLM prompt. */
    maxSourceTextCharsForExtraction: 24000,
    /** External verification endpoints (no secrets required). */
    externalApis: {
      crossrefWorksUrl: 'https://api.crossref.org/works',
      semanticScholarSearchUrl: 'https://api.semanticscholar.org/graph/v1/paper/search',
      arxivQueryUrl: 'https://export.arxiv.org/api/query',
      ar5ivHtmlBaseUrl: 'https://ar5iv.labs.arxiv.org/html',
      arxivHtmlBaseUrl: 'https://arxiv.org/html',
    },
  },

  /**
   * Confirmed Gemini model identifiers from the workspace `.agents/skills/gemini-*` skills.
   * Note: Lyria is left as an explicit placeholder because no model ID is listed in the skill files.
   */
  models: {
    /** Strongest reasoning model for research, section extraction, and grading. */
    reasoningPrimary: 'gemini-4-argon',
    /** Fast, balanced fallback model if primary hits repeated 503s. */
    reasoningFallback: 'gemini-3.8-flash',
    /** Ultra-fast lightweight fallback model. */
    reasoningLiteFallback: 'gemini-3.5-flash-lite',
    /** Real-time bidirectional voice model (Gemini Live API). */
    liveVoice: 'gemini-3.8-live',
    /** Extended thinking real-time voice model. */
    liveVoiceThinking: 'gemini-3.8-live-extended-thinking',
    /** Expressive TTS with Voice Design & multi-speaker support. */
    ttsPrimary: 'gemini-3.8-flash-tts',
    /** Low-latency TTS fallback for high-volume NPC voice lines. */
    ttsFallback: 'gemini-3.8-flash-lite-tts',
    /** Nano Banana 2.1 for consistent world panels and NPC portraits. */
    imagePrimary: 'gemini-nano-banana-2.1',
    /** Fast image fallback (Nano Banana 2 Lite). */
    imageFallback: 'gemini-3.1-flash-lite-image',
    /** Placeholder: Lyria model ID is not confirmed in the installed Gemini skill files. */
    lyriaAmbientMusic: 'PLACEHOLDER_LYRIA_MODEL_ID',
  },

  /** Retry and backoff parameters for 429/503 responses. */
  retry: {
    maxAttemptsPerModel: 3,
    initialDelayMs: 800,
    backoffMultiplier: 2.0,
  },

  /** Quantitative thresholds for metadata-driven source tiering. */
  tierThresholds: {
    archmageMinCitations: 150,
  },

  /** Ordering and visual/thematic metadata for the 5 source tiers. */
  tiers: {
    imp: {
      order: 1,
      label: 'Imp',
      creature: 'Chattering Imp',
      sourceKind: 'Blog, Forum, Medium, or Q&A Site',
      settingName: 'Bustling Market',
      fullTextObjectName: 'Notice Board',
      npcDefaultRole: 'Market Stallholder',
      colorHex: 0xd97706,
      cssColor: '#d97706',
      ambientHex: 0x3b2314,
      fogHex: 0x24160d,
    },
    goblin: {
      order: 2,
      label: 'Goblin',
      creature: 'Gear-Tinker Goblin',
      sourceKind: 'Tutorial, Documentation, or Explainer',
      settingName: "Tinkerer's Workshop",
      fullTextObjectName: 'Workbench Blueprint',
      npcDefaultRole: 'Workshop Tinkerer',
      colorHex: 0x16a34a,
      cssColor: '#16a34a',
      ambientHex: 0x162e22,
      fogHex: 0x0e1f17,
    },
    apprentice: {
      order: 3,
      label: 'Apprentice',
      creature: 'Lantern Apprentice',
      sourceKind: 'arXiv Preprint or Workshop Paper',
      settingName: 'Candlelit Study',
      fullTextObjectName: 'Unrolled Parchment',
      npcDefaultRole: 'Research Apprentice',
      colorHex: 0x2563eb,
      cssColor: '#2563eb',
      ambientHex: 0x172542,
      fogHex: 0x0f182b,
    },
    wizard: {
      order: 4,
      label: 'Wizard',
      creature: 'Astral Wizard',
      sourceKind: 'Peer-Reviewed Journal or Conference Paper',
      settingName: 'Tower Observatory',
      fullTextObjectName: 'Carved Stone Tablet',
      npcDefaultRole: 'Observatory Scholar',
      colorHex: 0x9333ea,
      cssColor: '#9333ea',
      ambientHex: 0x29153d,
      fogHex: 0x170b24,
    },
    archmage: {
      order: 5,
      label: 'Archmage',
      creature: 'Sovereign Archmage',
      sourceKind: 'Highly Cited Survey, Review, or Textbook',
      settingName: 'Grand Vaulted Hall',
      fullTextObjectName: 'Illuminated Manuscript on Lectern',
      npcDefaultRole: 'Grand Chronicler',
      colorHex: 0xeab308,
      cssColor: '#eab308',
      ambientHex: 0x382c12,
      fogHex: 0x1f1808,
    },
  } satisfies Record<
    SourceTier,
    {
      order: number;
      label: string;
      creature: string;
      sourceKind: string;
      settingName: string;
      fullTextObjectName: string;
      npcDefaultRole: string;
      colorHex: number;
      cssColor: string;
      ambientHex: number;
      fogHex: number;
    }
  >,

  /** 3D Hub navigation and atmosphere configuration. */
  hub: {
    moveSpeed: 7.5,
    lookSensitivity: 0.0024,
    eyeHeight: 1.7,
    fogColorHex: 0x120d0a,
    fogDensity: 0.032,
    maxRaycastDistance: 9.0,
  },

  /** 360° Book World look-around and Menace (0-3) configuration. */
  world: {
    lookSensitivity: 0.003,
    npcRadius: 5.5,
    fullTextObjectDistance: 4.5,
    exitGateDistance: 6.2,
    maxMenace: 3,
    menaceVisuals: [
      { level: 0, fogDensity: 0.025, lightMultiplier: 1.0, saturation: 1.0, crowCount: 0 },
      { level: 1, fogDensity: 0.048, lightMultiplier: 0.72, saturation: 0.75, crowCount: 2 },
      { level: 2, fogDensity: 0.075, lightMultiplier: 0.48, saturation: 0.45, crowCount: 4 },
      { level: 3, fogDensity: 0.11, lightMultiplier: 0.28, saturation: 0.2, crowCount: 7 },
    ],
  },

  /** Placeholder audio file paths in `/public/audio/` (with WebAudio synth fallbacks if absent). */
  audio: {
    ambientHubLoop: '/audio/library-ambient-loop.mp3',
    kiskadeeCall: '/audio/kiskadee-call.mp3',
    crowCaw: '/audio/crow-caw.mp3',
    songbirdNook: '/audio/songbird-nook.mp3',
    elfGiggle: '/audio/elf-giggle.mp3',
    pageTurn: '/audio/page-turn.mp3',
  },

  /** Cached Nano Banana 2.1 character & creature sprite paths in `/public/art/`. */
  art: {
    librarian: '/art/librarian-aurelius.png',
    creatures: {
      imp: '/art/creature-imp.png',
      goblin: '/art/creature-goblin.png',
      apprentice: '/art/creature-apprentice.png',
      wizard: '/art/creature-wizard.png',
      archmage: '/art/creature-archmage.png',
    } satisfies Record<SourceTier, string>,
    npcs: {
      imp: '/art/npc-imp.png',
      goblin: '/art/npc-goblin.png',
      apprentice: '/art/npc-apprentice.png',
      wizard: '/art/npc-wizard.png',
      archmage: '/art/npc-archmage.png',
    } satisfies Record<SourceTier, string>,
  },
} as const;
