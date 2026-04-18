import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';


// ─── Types ───────────────────────────────────────────────────────────────────

export type RecordingMode   = 'audio' | 'video' | 'screen';
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
  private _finished$ = new Subject<{ blob: Blob, fileName: string, mode: RecordingMode, duration: number }>();
  readonly finished$ = this._finished$.asObservable();



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
  public saveLocally: boolean       = false; // Default to false as per new requirement


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
    if (!this.isIdle) {
      console.warn('Recorder is not idle, cannot start.');
      return;
    }

    console.log(`[MeetingRecorder] Starting ${mode} recording...`);

    // Build a composite stream from all provided streams
    const combined = this.mergeStreams(streams, mode);
    if (!combined || combined.getTracks().length === 0) {
      console.error('[MeetingRecorder] No tracks found in combined stream.');
      throw new Error('No media tracks available for recording');
    }

    // Prefer VP9+Opus for best quality/size ratio; fall back to VP8 or browser default
    const mimeType = this.pickMimeType(mode);
    console.log(`[MeetingRecorder] Using MIME type: ${mimeType}`);

    this.chunks       = [];
    this.accumulatedMs = 0;
    
    try {
      this.recorder = new MediaRecorder(combined, { mimeType });
    } catch (err) {
      console.error('[MeetingRecorder] Failed to initialize MediaRecorder:', err);
      // Fallback to default mimeType if requested one fails
      this.recorder = new MediaRecorder(combined);
      console.log(`[MeetingRecorder] Falling back to default MIME type: ${this.recorder.mimeType}`);
    }

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
        const totalBytes = this.chunks.reduce((s, b) => s + b.size, 0);
        this._patch({ sizeKb: Math.round(totalBytes / 1024) });
      } else {
        console.debug('[MeetingRecorder] Received empty chunk');
      }
    };

    this.recorder.onstop = () => {
      console.log('[MeetingRecorder] Recorder stopped. Finalizing...');
      this.finalizeRecording(mode);
    };

    this.recorder.onerror = (err) => {
      console.error('[MeetingRecorder] Recorder error:', err);
      this._patch({ status: 'idle' });
    };

    this.recorder.start(1000); // emit a chunk every second
    this.startTime = Date.now();
    this._patch({ status: 'recording', mode, elapsedSeconds: 0, formattedTime: '00:00', sizeKb: 0 });
    this.startTimer();
    console.log('[MeetingRecorder] Recording started successfully');
  }

  /** Pause a running recording. */
  pause(): void {
    if (!this.isRecording || !this.recorder) { return; }
    console.log('[MeetingRecorder] Pausing recording');
    this.recorder.pause();
    this.pausedAt = Date.now();
    this.stopTimer();
    this._patch({ status: 'paused' });
  }

  /** Resume a paused recording. */
  resume(): void {
    if (!this.isPaused || !this.recorder) { return; }
    console.log('[MeetingRecorder] Resuming recording');
    this.accumulatedMs += Date.now() - this.pausedAt;
    this.startTime = Date.now() - (this.state.elapsedSeconds * 1000 - this.accumulatedMs);
    this.recorder.resume();
    this.startTimer();
    this._patch({ status: 'recording' });
  }

  /** Stop recording and trigger download. */
  stop(): void {
    if (this.isIdle) { return; }
    console.log('[MeetingRecorder] Stopping recording...');
    this.stopTimer();
    this._patch({ status: 'saving' });
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop(); // triggers onstop → finalizeRecording
    } else {
      console.warn('[MeetingRecorder] Recorder already inactive or missing. Forcing finalization.');
      this.finalizeRecording(this.state.mode);
    }
  }

  /** Discard the current recording without saving. */
  cancel(): void {
    console.log('[MeetingRecorder] Cancelling recording');
    this.stopTimer();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.ondataavailable = null;
      this.recorder.onstop          = null;
      this.recorder.onerror         = null;
      this.recorder.stop();
    }
    this.recorder = null;
    this.chunks   = [];
    this._patch({ ...INITIAL });
  }

  /** Reset the recorder state to idle. */
  reset(): void {
    console.log('[MeetingRecorder] Resetting state');
    this._patch({
      status: 'idle',
      elapsedSeconds: 0,
      sizeKb: 0
    });
    this.chunks = [];
    this.recorder = null;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private mergeStreams(streams: MediaStream[], mode: RecordingMode): MediaStream {
    const audioTracks: MediaStreamTrack[] = [];
    const videoTracks: MediaStreamTrack[] = [];

    streams.forEach(s => {
      if (!s) { return; }
      s.getAudioTracks().forEach(t => { if (t.readyState === 'live') audioTracks.push(t); });
      if (mode === 'video' || mode === 'screen') {
        s.getVideoTracks().forEach(t => { if (t.readyState === 'live') videoTracks.push(t); });
      }
    });

    // If mode is 'screen', we prioritize the screen share video track (usually the last one added in this app's logic, but let's be explicit)
    if (mode === 'screen') {
      videoTracks.reverse(); // If we have [camera, screen], now we have [screen, camera]
    }

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
      mode === 'audio'
        ? ['audio/webm;codecs=opus',     'audio/webm',                 'audio/ogg']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

    return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  }

  private finalizeRecording(mode: RecordingMode): void {
    if (this.chunks.length === 0) {
      console.error('[MeetingRecorder] Cannot finalize: No data chunks captured.');
      this.reset();
      return;
    }

    const modeLabel = mode === 'audio' ? 'Audio' : (mode === 'screen' ? 'Screen' : 'Video');
    const extension = 'webm'; // Most compatible for MediaRecorder
    
    // Use the type from the first chunk or fallback to a sensible default
    let mimeType = this.chunks[0]?.type || (mode === 'audio' ? 'audio/webm' : 'video/webm');
    
    // Ensure the mimeType is valid
    if (!mimeType.includes('/')) {
      mimeType = mode === 'audio' ? 'audio/webm' : 'video/webm';
    }

    console.log(`[MeetingRecorder] Finalizing ${modeLabel} blob with ${this.chunks.length} chunks. MIME: ${mimeType}`);
    
    const blob = new Blob(this.chunks, { type: mimeType });
    this.chunks = [];

    // Build a timestamped filename
    const now   = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const name  = `OIS-Meet-${modeLabel}-${stamp}.${extension}`;
    const duration = this.state.elapsedSeconds;

    console.log(`[MeetingRecorder] Recording finalized: ${name} (${Math.round(blob.size/1024)} KB, ${duration}s)`);

    // Emit the blob for external handling (e.g. uploading to chat)
    this._finished$.next({ blob, fileName: name, mode, duration });

    // Trigger browser download if explicitly requested
    if (this.saveLocally) {
      console.log('[MeetingRecorder] Saving recording locally...');
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href    = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

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
