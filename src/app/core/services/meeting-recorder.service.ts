import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecordingMode   = 'audio' | 'video';
export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'saving';

export interface RecordingState {
  status:        RecordingStatus;
  mode:          RecordingMode;
  elapsedSeconds: number;
  /** Display-friendly timer string, e.g. "02:14" */
  formattedTime: string;
  sizeKb:        number;
}

// ─────────────────────────────────────────────────────────────────────────────

const INITIAL: RecordingState = {
  status:         'idle',
  mode:           'video',
  elapsedSeconds: 0,
  formattedTime:  '00:00',
  sizeKb:         0,
};

@Injectable({ providedIn: 'root' })
export class MeetingRecorderService {
  private _state$ = new BehaviorSubject<RecordingState>({ ...INITIAL });
  readonly state$ = this._state$.asObservable();

  get state(): RecordingState { return this._state$.value; }
  get isRecording(): boolean  { return this._state$.value.status === 'recording'; }
  get isPaused(): boolean     { return this._state$.value.status === 'paused'; }
  get isIdle(): boolean       { return this._state$.value.status === 'idle'; }

  private recorder:   MediaRecorder | null = null;
  private chunks:     Blob[]        = [];
  private timerInterval: any        = null;
  private startTime:  number        = 0;
  private pausedAt:   number        = 0;
  private accumulatedMs: number     = 0;

  constructor(private ngZone: NgZone) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start a new recording.
   * @param streams  One or more MediaStreams whose tracks will be merged.
   *                 Pass the local media stream (video/audio) and optionally
   *                 the screen-share stream to capture everything.
   * @param mode     'audio' → audio-only WebM; 'video' → video+audio WebM.
   */
  async start(streams: MediaStream[], mode: RecordingMode = 'video'): Promise<void> {
    if (!this.isIdle) { return; }

    // Build a composite stream from all provided streams
    const combined = this.mergeStreams(streams, mode);

    // Prefer VP9+Opus for best quality/size ratio; fall back to VP8 or browser default
    const mimeType = this.pickMimeType(mode);

    this.chunks       = [];
    this.accumulatedMs = 0;
    this.recorder     = new MediaRecorder(combined, { mimeType });

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
        const totalBytes = this.chunks.reduce((s, b) => s + b.size, 0);
        this._patch({ sizeKb: Math.round(totalBytes / 1024) });
      }
    };

    this.recorder.onstop = () => this.finalizeRecording(mode);

    this.recorder.start(1000); // emit a chunk every second
    this.startTime = Date.now();
    this._patch({ status: 'recording', mode, elapsedSeconds: 0, formattedTime: '00:00', sizeKb: 0 });
    this.startTimer();
  }

  /** Pause a running recording. */
  pause(): void {
    if (!this.isRecording || !this.recorder) { return; }
    this.recorder.pause();
    this.pausedAt = Date.now();
    this.stopTimer();
    this._patch({ status: 'paused' });
  }

  /** Resume a paused recording. */
  resume(): void {
    if (!this.isPaused || !this.recorder) { return; }
    this.accumulatedMs += Date.now() - this.pausedAt;
    this.startTime = Date.now() - (this.state.elapsedSeconds * 1000 - this.accumulatedMs);
    this.recorder.resume();
    this.startTimer();
    this._patch({ status: 'recording' });
  }

  /** Stop recording and trigger download. */
  stop(): void {
    if (this.isIdle) { return; }
    this.stopTimer();
    this._patch({ status: 'saving' });
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop(); // triggers onstop → finalizeRecording
    } else {
      this.finalizeRecording(this.state.mode);
    }
  }

  /** Discard the current recording without saving. */
  cancel(): void {
    this.stopTimer();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.ondataavailable = null;
      this.recorder.onstop          = null;
      this.recorder.stop();
    }
    this.recorder = null;
    this.chunks   = [];
    this._patch({ ...INITIAL });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private mergeStreams(streams: MediaStream[], mode: RecordingMode): MediaStream {
    const audioTracks: MediaStreamTrack[] = [];
    const videoTracks: MediaStreamTrack[] = [];

    streams.forEach(s => {
      if (!s) { return; }
      s.getAudioTracks().forEach(t => { if (t.readyState === 'live') audioTracks.push(t); });
      if (mode === 'video') {
        s.getVideoTracks().forEach(t => { if (t.readyState === 'live') videoTracks.push(t); });
      }
    });

    // Merge audio tracks via Web Audio if there are multiple, so we record all voices
    if (audioTracks.length > 1) {
      const ctx  = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      audioTracks.forEach(t => {
        const src = ctx.createMediaStreamSource(new MediaStream([t]));
        src.connect(dest);
      });
      const merged = new MediaStream([
        ...dest.stream.getAudioTracks(),
        ...(videoTracks.length ? [videoTracks[0]] : []),
      ]);
      return merged;
    }

    return new MediaStream([...audioTracks, ...videoTracks]);
  }

  private pickMimeType(mode: RecordingMode): string {
    const candidates =
      mode === 'video'
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        : ['audio/webm;codecs=opus',     'audio/webm',                 'audio/ogg'];

    return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  }

  private finalizeRecording(mode: RecordingMode): void {
    const extension = mode === 'audio' ? 'webm' : 'webm';
    const mimeType  = this.chunks[0]?.type || 'video/webm';
    const blob      = new Blob(this.chunks, { type: mimeType });
    this.chunks     = [];

    // Build a timestamped filename
    const now   = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const name  = `OIS-Meet-${mode === 'audio' ? 'Audio' : 'Video'}-${stamp}.${extension}`;

    // Trigger browser download
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    this.recorder = null;
    this._patch({ ...INITIAL });
  }

  private startTimer(): void {
    this.ngZone.runOutsideAngular(() => {
      this.timerInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - this.startTime) / 1000)
                        + Math.round(this.accumulatedMs / 1000);
        const mm = Math.floor(elapsed / 60);
        const ss = elapsed % 60;
        const formatted = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
        this.ngZone.run(() => {
          this._patch({ elapsedSeconds: elapsed, formattedTime: formatted });
        });
      }, 1000);
    });
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private _patch(partial: Partial<RecordingState>): void {
    this._state$.next({ ...this._state$.value, ...partial });
  }
}
