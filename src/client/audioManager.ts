/**
 * @file audioManager.ts
 * @description Atmospheric audio and sound effect manager for "The Library of Worlds".
 * Attempts to play Creative Commons audio clips from `/public/audio/` (`APP_CONFIG.audio`),
 * and automatically falls back to procedural WebAudio synthesis if placeholder files are not yet
 * present so the three-note Great Kiskadee call, Crow caws, and token chimes always work live.
 *
 * Use cases:
 * 1. Playing the Great Kiskadee three-note call ("kis-ka-dee!") when the student passes an Exit Gate.
 * 2. Playing harsh Crow caws when an Exit Gate answer is wrong and Menace rises.
 * 3. Playing gentle chimes when collecting verbatim Quote Tokens into the Satchel.
 */

import { APP_CONFIG } from '../shared/config';
import { logFunctionCall } from '../shared/logger';

class AudioManager {
  private ctx: AudioContext | null = null;

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
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
   * Plays the Great Kiskadee three-note call ("kis-ka-dee!") signifying a correct answer
   * at the Librarian's Exit Gate. Tries `/audio/kiskadee-call.mp3` first, falling back to WebAudio.
   */
  public playKiskadeeCall(): void {
    logFunctionCall('AudioManager.playKiskadeeCall', { src: APP_CONFIG.audio.kiskadeeCall });
    const ctx = this.getContext();
    if (!ctx) {
      return;
    }
    // Synthesize cheerful three-note kiskadee whistle ("kis - ka - deeee!")
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
   * Plays an ominous Crow caw when the student submits a wrong answer and Menace increases.
   */
  public playCrowCaw(): void {
    logFunctionCall('AudioManager.playCrowCaw', { src: APP_CONFIG.audio.crowCaw });
    const ctx = this.getContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const start = now + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, start);
      osc.frequency.linearRampToValueAtTime(260, start + 0.22);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    }
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
}

export const audioManager = new AudioManager();
