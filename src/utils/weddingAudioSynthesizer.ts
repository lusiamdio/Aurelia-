/**
 * Web Audio Polyphonic Synthesizer for Gemini AI Wedding Song
 * Produces warm grand piano, celestial harp plucks, and orchestral string pads
 */

export interface MelodyNote {
  note: string;
  freq: number;
  duration: number;
  delay: number;
}

export interface HarmonyChord {
  name: string;
  time: number;
  duration: number;
  freqs: number[];
}

export interface WeddingSongScore {
  type: 'web_audio_score' | 'audio_stream';
  title: string;
  composer: string;
  tempo?: number;
  key?: string;
  vibeDescription?: string;
  poeticVerse?: string;
  audioDataUrl?: string; // If Lyria returned an encoded audio stream
  melodyNotes?: MelodyNote[];
  harmonyChords?: HarmonyChord[];
}

export class WeddingAudioPlayer {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private currentScore: WeddingSongScore | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private startTime = 0;
  private pauseOffset = 0;
  private loopDuration = 22; // seconds
  private timerId: any = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private onStateChange?: (isPlaying: boolean, progress: number) => void;
  private volume = 0.65;

  constructor(onStateChange?: (isPlaying: boolean, progress: number) => void) {
    this.onStateChange = onStateChange;
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    if (this.audioEl) {
      this.audioEl.volume = this.volume;
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public loadScore(score: WeddingSongScore) {
    this.currentScore = score;
    // Calculate score duration
    if (score.melodyNotes && score.melodyNotes.length > 0) {
      const lastNote = score.melodyNotes[score.melodyNotes.length - 1];
      this.loopDuration = Math.max(18, lastNote.delay + lastNote.duration + 2);
    }
    if (score.audioDataUrl) {
      if (this.audioEl) {
        this.audioEl.pause();
      }
      this.audioEl = new Audio(score.audioDataUrl);
      this.audioEl.loop = true;
      this.audioEl.volume = this.volume;
    }
  }

  public async play() {
    this.initContext();
    if (!this.ctx) return;

    if (this.isPlaying) return;
    this.isPlaying = true;

    // If Lyria stream audio exists
    if (this.currentScore?.audioDataUrl && this.audioEl) {
      try {
        await this.audioEl.play();
        this.startProgressTracker();
        return;
      } catch (err) {
        console.warn('Audio element play failed, falling back to Web Audio score synthesis:', err);
      }
    }

    // Play synthesized Web Audio score
    this.startTime = this.ctx.currentTime - this.pauseOffset;
    this.scheduleScoreLoop(this.startTime);
    this.startProgressTracker();
  }

  private scheduleScoreLoop(baseTime: number) {
    if (!this.ctx || !this.currentScore || !this.isPlaying) return;

    const notes = this.currentScore.melodyNotes || [];
    const chords = this.currentScore.harmonyChords || [];

    // Schedule Chords (Lush warm strings)
    chords.forEach((chord) => {
      chord.freqs.forEach((freq, idx) => {
        this.playStringNote(freq, baseTime + chord.time, chord.duration, 0.08 + idx * 0.02);
      });
    });

    // Schedule Melody (Acoustic grand piano / celesta)
    notes.forEach((note) => {
      this.playPianoNote(note.freq, baseTime + note.delay, note.duration);
    });

    // Schedule next loop seamlessly
    const nextLoopTime = baseTime + this.loopDuration;
    const timeUntilNext = (nextLoopTime - this.ctx.currentTime) * 1000;

    if (timeUntilNext > 0 && this.isPlaying) {
      setTimeout(() => {
        if (this.isPlaying && this.ctx) {
          this.scheduleScoreLoop(nextLoopTime);
        }
      }, Math.max(50, timeUntilNext - 500));
    }
  }

  private playPianoNote(freq: number, startTime: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    if (startTime < this.ctx.currentTime - 0.5) return;

    const actStartTime = Math.max(startTime, this.ctx.currentTime);

    // Fundamental oscillator (Warm triangle/sine blend)
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, actStartTime);

    // Second harmonic for acoustic bell sparkle
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, actStartTime);

    // Filter to soften higher frequencies (piano wooden resonance)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, actStartTime);
    filter.frequency.exponentialRampToValueAtTime(350, actStartTime + duration);

    // Note Envelope
    const noteGain = this.ctx.createGain();
    noteGain.gain.setValueAtTime(0, actStartTime);
    // Instant attack
    noteGain.gain.linearRampToValueAtTime(0.25, actStartTime + 0.015);
    // Exponential piano decay
    noteGain.gain.exponentialRampToValueAtTime(0.001, actStartTime + duration + 0.4);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc1.start(actStartTime);
    osc2.start(actStartTime);
    osc1.stop(actStartTime + duration + 0.5);
    osc2.stop(actStartTime + duration + 0.5);
  }

  private playStringNote(freq: number, startTime: number, duration: number, vol = 0.07) {
    if (!this.ctx || !this.masterGain) return;
    if (startTime < this.ctx.currentTime - 0.5) return;

    const actStartTime = Math.max(startTime, this.ctx.currentTime);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, actStartTime);

    // Subtle chorus / detune vibrato
    osc.detune.setValueAtTime(-4, actStartTime);
    osc.detune.linearRampToValueAtTime(4, actStartTime + duration * 0.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, actStartTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, actStartTime);
    // Slow orchestral string attack (0.6s)
    gain.gain.linearRampToValueAtTime(vol, actStartTime + 0.6);
    // Sustain and gentle release
    gain.gain.setValueAtTime(vol * 0.85, actStartTime + duration - 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, actStartTime + duration + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(actStartTime);
    osc.stop(actStartTime + duration + 0.5);
  }

  private startProgressTracker() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      if (!this.isPlaying) return;
      if (this.audioEl && !this.audioEl.paused) {
        const progress = (this.audioEl.currentTime / (this.audioEl.duration || 30)) % 1;
        this.onStateChange?.(true, progress);
      } else if (this.ctx) {
        const elapsed = (this.ctx.currentTime - this.startTime) % this.loopDuration;
        const progress = elapsed / this.loopDuration;
        this.onStateChange?.(true, progress);
      }
    }, 150);
  }

  public pause() {
    this.isPlaying = false;
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (this.ctx) {
      this.pauseOffset = (this.ctx.currentTime - this.startTime) % this.loopDuration;
      this.ctx.suspend();
    }
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.onStateChange?.(false, 0);
  }

  public toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public isCurrentlyPlaying() {
    return this.isPlaying;
  }

  public destroy() {
    this.pause();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl = null;
    }
  }
}
