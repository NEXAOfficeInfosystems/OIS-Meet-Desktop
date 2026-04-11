import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Subscription, timer } from 'rxjs';

export interface ScreenRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number; // seconds
}

@Injectable({
  providedIn: 'root'
})
export class ScreenRecorderService implements OnDestroy {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private timerSubscription: Subscription | null = null;

  private stateSubject = new BehaviorSubject<ScreenRecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0
  });

  /** Emits a Blob when the native "Stop sharing" button ends the track. */
  nativeStopped$ = new Subject<Blob>();

  public state$ = this.stateSubject.asObservable();

  private get isElectron(): boolean {
    return !!(window as any).oisMeet;
  }

  constructor(private zone: NgZone) {}

  async startRecording(): Promise<void> {
    this.stream = await this.acquireStream();

    const mimeType = this.getSupportedMimeType();
    try {
      this.mediaRecorder = new MediaRecorder(
        this.stream,
        mimeType ? { mimeType } : {}
      );
    } catch {
      this.mediaRecorder = new MediaRecorder(this.stream);
    }

    this.chunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    // When the user clicks the browser's / OS's native "Stop sharing" button,
    // collect what was recorded and emit it so the component can upload it.
    const videoTrack = this.stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        this.zone.run(() => {
          if (!this.stateSubject.value.isRecording) return;

          const stopAndEmit = () => {
            const mt = this.mediaRecorder?.mimeType || 'video/webm';
            const blob = new Blob(this.chunks, { type: mt });
            this.cleanup();
            if (blob.size > 0) this.nativeStopped$.next(blob);
          };

          if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.onstop = stopAndEmit;
            this.mediaRecorder.stop();
          } else {
            stopAndEmit();
          }
        });
      };
    }

    this.mediaRecorder.start(500);
    this.stateSubject.next({ isRecording: true, isPaused: false, duration: 0 });
    this.startTimer();
  }

  async stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanup();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mt = this.mediaRecorder?.mimeType || 'video/webm';
        const blob = new Blob(this.chunks, { type: mt });
        this.cleanup();
        resolve(blob.size > 0 ? blob : null);
      };

      this.mediaRecorder.stop();
    });
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      try { this.mediaRecorder.stop(); } catch { /* ignore */ }
    }
    this.cleanup();
  }

  pauseRecording(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.pause();
      this.stateSubject.next({ ...this.stateSubject.value, isPaused: true });
    }
  }

  resumeRecording(): void {
    if (this.mediaRecorder?.state === 'paused') {
      this.mediaRecorder.resume();
      this.stateSubject.next({ ...this.stateSubject.value, isPaused: false });
    }
  }

  // ── private ──────────────────────────────────────────────────────────────────

  /**
   * In Electron we use desktopCapturer (via IPC) + getUserMedia because
   * getDisplayMedia() requires setDisplayMediaRequestHandler in the main
   * process which may not always be configured.
   * In a regular browser we fall back to the standard getDisplayMedia().
   */
  private async acquireStream(): Promise<MediaStream> {
    if (this.isElectron) {
      return this.acquireStreamElectron();
    }
    return this.acquireStreamBrowser();
  }

  private async acquireStreamElectron(): Promise<MediaStream> {
    const oisMeet = (window as any).oisMeet;

    // Get available sources via IPC (desktopCapturer in main process)
    const sources: { id: string; name: string; thumbnail: string }[] =
      await oisMeet.getDesktopSources({ types: ['screen', 'window'] });

    if (!sources || sources.length === 0) {
      throw new Error('No screen sources available');
    }

    // Prefer the first full-screen source; fall back to any source
    const source = sources.find(s => s.id.startsWith('screen:')) ?? sources[0];

    // getUserMedia with Electron's chromeMediaSource extension
    const constraints: any = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          minWidth: 1280,
          maxWidth: 4096,
          minHeight: 720,
          maxHeight: 2160,
        }
      }
    };

    return navigator.mediaDevices.getUserMedia(constraints);
  }

  private async acquireStreamBrowser(): Promise<MediaStream> {
    // Try with system audio; fall back to video-only for platforms that
    // don't support screen audio capture (macOS, Firefox, older Electron).
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
    } catch {
      return await navigator.mediaDevices.getDisplayMedia({ video: true });
    }
  }

  private startTimer(): void {
    this.timerSubscription = timer(1000, 1000).subscribe(() => {
      this.zone.run(() => {
        const s = this.stateSubject.value;
        if (s.isRecording && !s.isPaused) {
          this.stateSubject.next({ ...s, duration: s.duration + 1 });
        }
      });
    });
  }

  private cleanup(): void {
    this.timerSubscription?.unsubscribe();
    this.timerSubscription = null;
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.stateSubject.next({ isRecording: false, isPaused: false, duration: 0 });
  }

  private getSupportedMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  }

  ngOnDestroy(): void {
    this.cleanup();
  }
}
