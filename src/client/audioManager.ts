/**
 * @file audioManager.ts
 * @description Atmospheric audio and sound effect manager for "The Library of Worlds".
 * Plays real bird recordings from `/public/audio/` (`crow-caw.mp3`, `kiskadee-call.mp3`),
 * and automatically falls back to procedural WebAudio synthesis if a file is missing or fails
 * to load/play so audio cues never fail silently.
 *
 * Also manages looping ambient crow caws tied to the per-world Menace Level:
 * - Level 1: Single caw on wrong answer (no background loop).
 * - Level 2: Occasional distant caws looping every few seconds.
 * - Level 3: Frequent overlapping caws until the student passes or leaves the world.
 * - On Pass / Level 0: All crow caws stop immediately and the Great Kiskadee call plays.
 *
 * Use cases:
 * 1. Playing the Great Kiskadee call (`/audio/kiskadee-call.mp3` or WebAudio fallback) when passing an Exit Gate.
 * 2. Playing Crow caws (`/audio/crow-caw.mp3` or bandpass-filtered noise burst with falling pitch) on wrong answers.
 * 3. Managing escalating menace background caw loops (Levels 2 and 3) and stopping them on pass.
 * 4. Playing gentle chimes when collecting verbatim Quote Tokens or mischievous Elf giggles at Debrief.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';

class AudioManager {
  private ctx: AudioContext | null = null;
  private menaceLoopTimer: number | null = null;
  private overlapTimeouts: number[] = [];
  private activeCrowAudios: Set<HTMLAudioElement> = new Set();

  /**
   * Lazily initializes and resumes the browser `AudioContext` after user interaction.
   *
   * @returns Active `AudioContext` or `null` if unavailable.
   */
  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Attempts to play an audio file from `/public/audio/`. If the file is missing (404) or
   * playback fails, invokes `onFallback` so the sound cue never fails silently.
   *
   * @param src - Public URL path of the audio file.
   * @param options - Volume, playbackRate, and whether to track as a stoppable crow sound.
   * @param onFallback - WebAudio fallback function executed on load/play error.
   */
  private playFileOrFallback(
    src: string,
    options: { volume?: number; playbackRate?: number; isCrow?: boolean },
    onFallback: () => void
  ): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      onFallback();
      return;
    }

    let fallbackTriggered = false;
    const triggerFallbackOnce = () => {
      if (fallbackTriggered) {
        return;
      }
      fallbackTriggered = true;
      onFallback();
    };

    try {
      const audio = new Audio(src);
      audio.volume = Math.max(0.05, Math.min(1.0, options.volume ?? 0.8));
      if (options.playbackRate) {
        audio.playbackRate = options.playbackRate;
      }

      if (options.isCrow) {
        this.activeCrowAudios.add(audio);
        const cleanup = () => {
          this.activeCrowAudios.delete(audio);
        };
        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', cleanup, { once: true });
      }

      audio.addEventListener(
        'error',
        () => {
          triggerFallbackOnce();
        },
        { once: true }
      );

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          if (options.isCrow) {
            this.activeCrowAudios.delete(audio);
          }
          triggerFallbackOnce();
        });
      }
    } catch {
      triggerFallbackOnce();
    }
  }

  /**
   * Synthesizes a crow caw using a short white-noise burst routed through a bandpass filter
   * with a falling center pitch (plus a subtle raspy sawtooth underlayer).
   *
   * @param volume - Peak gain (default `0.24`).
   */
  private synthesizeCrowCaw(volume = 0.24): void {
    const ctx = this.getContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    const duration = 0.34;
    const sampleRate = ctx.sampleRate;
    const frameCount = Math.floor(sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      // Envelope-modulated noise burst for harsh avian rasp
      const env = Math.sin((i / frameCount) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // Bandpass filter with falling pitch (1250 Hz -> 460 Hz)
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.setValueAtTime(4.8, now);
    bandpass.frequency.setValueAtTime(1250, now);
    bandpass.frequency.exponentialRampToValueAtTime(460, now + duration);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(volume, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseSource.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + duration + 0.02);

    // Subtle falling sawtooth formant underlayer
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(460, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + duration);
    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(volume * 0.45, now + 0.03);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /**
   * Synthesizes the cheerful three-note Great Kiskadee call ("kis-ka-dee!") as a WebAudio fallback.
   */
  private synthesizeKiskadeeCall(): void {
    const ctx = this.getContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    const notes = [
      { freqStart: 1350, freqEnd: 1550, start: 0.0, dur: 0.14 },
      { freqStart: 1650, freqEnd: 1850, start: 0.18, dur: 0.14 },
      { freqStart: 2200, freqEnd: 1450, start: 0.36, dur: 0.42 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freqStart, now + n.start);
      osc.frequency.exponentialRampToValueAtTime(n.freqEnd, now + n.start + n.dur);
      gain.gain.setValueAtTime(0.001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + n.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.02);
    }
  }

  /**
   * Plays the Great Kiskadee call signifying a correct answer at the Librarian's Exit Gate.
   * Stops all active crow caws first, then plays `/audio/kiskadee-call.mp3` (or WebAudio fallback).
   */
  public playKiskadeeCall(): void {
    logFunctionCall('AudioManager.playKiskadeeCall', { src: APP_CONFIG.audio.kiskadeeCall });
    this.stopAllMenaceAudio();
    this.playFileOrFallback(
      APP_CONFIG.audio.kiskadeeCall,
      { volume: 0.85, isCrow: false },
      () => this.synthesizeKiskadeeCall()
    );
  }

  /**
   * Plays an ominous Crow caw (`/audio/crow-caw.mp3` or bandpass-filtered noise fallback)
   * when the student submits a wrong answer and Menace increases.
   *
   * @param options - Optional volume and playbackRate overrides for distant/overlapping caws.
   */
  public playCrowCaw(options?: { volume?: number; playbackRate?: number }): void {
    const volume = options?.volume ?? 0.85;
    const playbackRate = options?.playbackRate ?? 1.0;
    logFunctionCall('AudioManager.playCrowCaw', {
      src: APP_CONFIG.audio.crowCaw,
      volume,
      playbackRate,
    });
    this.playFileOrFallback(
      APP_CONFIG.audio.crowCaw,
      { volume, playbackRate, isCrow: true },
      () => this.synthesizeCrowCaw(Math.min(0.32, volume * 0.35))
    );
  }

  /**
   * Configures the ambient crow-caw audio loop for the current Menace level:
   * - Level 0: Stops all caws immediately.
   * - Level 1: No repeating loop (only the initial single caw plays on wrong submission).
   * - Level 2: Occasional distant caws looping every ~4.5 seconds.
   * - Level 3: Frequent overlapping caws looping every ~2.3 seconds.
   *
   * @param menaceLevel - Current per-world menace level (0-3).
   */
  public setMenaceAudioLevel(menaceLevel: number): void {
    logFunctionCall('AudioManager.setMenaceAudioLevel', { menaceLevel });
    this.clearMenaceTimers();

    if (menaceLevel <= 0) {
      this.stopAllMenaceAudio();
      return;
    }

    if (menaceLevel === 2) {
      this.menaceLoopTimer = window.setInterval(() => {
        const rate = 0.88 + Math.random() * 0.16;
        this.playCrowCaw({ volume: 0.36, playbackRate: rate });
      }, 4500);
    } else if (menaceLevel >= 3) {
      this.menaceLoopTimer = window.setInterval(() => {
        this.playCrowCaw({ volume: 0.58, playbackRate: 0.94 + Math.random() * 0.14 });
        const overlapId = window.setTimeout(() => {
          this.playCrowCaw({ volume: 0.44, playbackRate: 1.06 + Math.random() * 0.15 });
        }, 380);
        this.overlapTimeouts.push(overlapId);
      }, 2400);
    }
  }

  /**
   * Clears repeating menace loop timers without abruptly cutting off a single in-flight audio clip.
   */
  private clearMenaceTimers(): void {
    if (this.menaceLoopTimer !== null) {
      window.clearInterval(this.menaceLoopTimer);
      this.menaceLoopTimer = null;
    }
    for (const tid of this.overlapTimeouts) {
      window.clearTimeout(tid);
    }
    this.overlapTimeouts = [];
  }

  /**
   * Immediately stops all repeating menace timers and silences any active crow audio clips.
   * Called when the student passes the Exit Gate or exits the book world back to the Hub.
   */
  public stopAllMenaceAudio(): void {
    logFunctionCall('AudioManager.stopAllMenaceAudio', {});
    this.clearMenaceTimers();
    for (const audio of this.activeCrowAudios) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore cleanup errors on already-disposed elements
      }
    }
    this.activeCrowAudios.clear();
  }

  /**
   * Plays a soft parchment/token chime when a student collects a verbatim Quote Token.
   */
  public playTokenCollect(): void {
    logFunctionCall('AudioManager.playTokenCollect', {});
    const ctx = this.getContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * Plays a mischievous high-pitched Elf giggle when an unsupported or overstated claim
   * is flagged during the Milestone 4 Exit Debrief.
   */
  public playElfGiggle(): void {
    logFunctionCall('AudioManager.playElfGiggle', { src: APP_CONFIG.audio.elfGiggle });
    this.playFileOrFallback(
      APP_CONFIG.audio.elfGiggle,
      { volume: 0.75, isCrow: false },
      () => {
        const ctx = this.getContext();
        if (!ctx) {
          return;
        }
        const now = ctx.currentTime;
        const pitches = [980, 1240, 1060, 1420];
        pitches.forEach((freq, i) => {
          const start = now + i * 0.085;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, start);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.15, start + 0.07);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.13, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.075);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.08);
        });
      }
    );
  }
}

export const audioManager = new AudioManager();
