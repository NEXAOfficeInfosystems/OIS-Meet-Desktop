import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface LiveTranscriptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  language?: string;
  receivedAt: Date;
}

export type LiveTranscriptionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'stopped';

@Injectable({ providedIn: 'root' })
export class LiveTranscriptionService implements OnDestroy {

  // ── Public streams ──────────────────────────────────────────────────────────
  private readonly segmentsSubject = new BehaviorSubject<LiveTranscriptionSegment[]>([]);
  public readonly segments$: Observable<LiveTranscriptionSegment[]> = this.segmentsSubject.asObservable();

  private readonly statusSubject = new BehaviorSubject<LiveTranscriptionStatus>('idle');
  public readonly status$: Observable<LiveTranscriptionStatus> = this.statusSubject.asObservable();

  private readonly errorSubject = new Subject<string>();
  public readonly error$: Observable<string> = this.errorSubject.asObservable();

  // ── Private state ───────────────────────────────────────────────────────────
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private activeStream: MediaStream | null = null;
  private activeWsUrl: string = '';
  private activeLanguage: string = 'en';

  /** Buffer of PCM float32 samples. Flushed to WS at CHUNK_INTERVAL_MS cadence. */
  private sampleBuffer: Float32Array[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  // Audio settings
  private readonly SAMPLE_RATE = 16000;        // Whisper expects 16 kHz
  private readonly CHUNK_INTERVAL_MS = 1500;   // Send a chunk every 1.5 s
  private readonly SCRIPT_PROCESSOR_SIZE = 4096;

  private segmentCounter = 0;

  constructor(private ngZone: NgZone) { }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Start live transcription.
   * Safe to call when already running – it will no-op.
   */
  public async start(
    micStream: MediaStream,
    wsUrl: string,
    language = 'en'
  ): Promise<void> {
    if (this.statusSubject.value === 'connecting' || this.statusSubject.value === 'connected') {
      return;
    }

    this.activeStream = micStream;
    this.activeWsUrl = wsUrl;
    this.activeLanguage = language;

    this.segmentsSubject.next([]);
    this.segmentCounter = 0;

    this.statusSubject.next('connecting');
    this.connectWebSocket();
  }

  /** Stop live transcription and release all resources. */
  public stop(): void {
    this.cleanup();
    this.statusSubject.next('stopped');
  }

  /** Clear displayed segments without stopping. */
  public clearSegments(): void {
    this.segmentsSubject.next([]);
    this.segmentCounter = 0;
  }

  // ── WebSocket ───────────────────────────────────────────────────────────────

  private connectWebSocket(): void {
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(this.activeWsUrl);

      this.ws.onopen = () => {
        this.ngZone.run(() => this.statusSubject.next('connected'));
        this.startAudioCapture();
        this.startPing();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'transcription' && Array.isArray(msg.segments)) {
            this.ngZone.run(() => this.handleSegments(msg.segments, msg.language));
          }
        } catch {
          // ignore malformed frames
        }
      };

      this.ws.onerror = () => {
        this.ngZone.run(() => {
          this.statusSubject.next('error');
          this.errorSubject.next('WebSocket connection error');
        });
        this.scheduleReconnect();
      };

      this.ws.onclose = () => {
        this.ngZone.run(() => {
          if (this.statusSubject.value !== 'stopped') {
            this.statusSubject.next('error');
          }
        });
        this.stopAudioCapture();
        this.stopPing();
      };

    } catch (err) {
      this.ngZone.run(() => {
        this.statusSubject.next('error');
        this.errorSubject.next('Failed to open WebSocket');
      });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.statusSubject.value === 'stopped') return;
    this.clearReconnectTimeout();
    this.reconnectTimeout = setTimeout(() => {
      if (this.statusSubject.value !== 'stopped') {
        this.statusSubject.next('connecting');
        this.connectWebSocket();
      }
    }, 3000);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // ── Ping ────────────────────────────────────────────────────────────────────

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 10000);
  }

  private stopPing(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ── Audio Capture ───────────────────────────────────────────────────────────

  private startAudioCapture(): void {
    if (!this.activeStream) return;

    const audioTracks = this.activeStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      // Use a resampling AudioContext so the server always receives 16 kHz
      this.audioContext = new AudioContext({ sampleRate: this.SAMPLE_RATE });

      const audioOnlyStream = new MediaStream(audioTracks);
      this.sourceNode = this.audioContext.createMediaStreamSource(audioOnlyStream);

      // ScriptProcessorNode is deprecated but remains the most compatible
      // cross-browser approach for raw PCM access without SharedArrayBuffer.
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        this.SCRIPT_PROCESSOR_SIZE,
        1,   // mono input
        1    // mono output
      );

      this.scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;

        // Clone the samples so the buffer isn't re-used underneath us
        const inputData = e.inputBuffer.getChannelData(0);
        this.sampleBuffer.push(new Float32Array(inputData));
      };

      this.sourceNode.connect(this.scriptProcessor);
      // Must connect to destination; otherwise Chrome stops firing the callback
      this.scriptProcessor.connect(this.audioContext.destination);

      // Start periodic flush
      this.flushInterval = setInterval(() => this.flushBuffer(), this.CHUNK_INTERVAL_MS);

    } catch (err) {
      console.error('[LiveTranscription] Audio capture failed:', err);
      this.ngZone.run(() => {
        this.errorSubject.next('Audio capture setup failed');
        this.statusSubject.next('error');
      });
    }
  }

  private stopAudioCapture(): void {
    if (this.flushInterval !== null) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.sampleBuffer = [];

    try { this.scriptProcessor?.disconnect(); } catch { /* ignore */ }
    try { this.sourceNode?.disconnect(); } catch { /* ignore */ }
    try { this.audioContext?.close(); } catch { /* ignore */ }

    this.scriptProcessor = null;
    this.sourceNode = null;
    this.audioContext = null;
  }

  /** Concatenate buffered PCM frames and send to the WS server. */
  private flushBuffer(): void {
    if (!this.sampleBuffer.length || this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    const totalLen = this.sampleBuffer.reduce((acc, f) => acc + f.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const frame of this.sampleBuffer) {
      merged.set(frame, offset);
      offset += frame.length;
    }
    this.sampleBuffer = [];

    // Skip near-silent chunks to avoid sending noise to Whisper
    const rms = this.computeRMS(merged);
    if (rms < 0.005) return;

    const payload = {
      type: 'audio_data',
      data: Array.from(merged),
      language: this.activeLanguage,
    };
    try {
      this.ws!.send(JSON.stringify(payload));
    } catch {
      // WS closed between the check and send – ignore
    }
  }

  /** Root-mean-square of a Float32 audio frame. */
  private computeRMS(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  // ── Segment Handling ────────────────────────────────────────────────────────

  private handleSegments(
    rawSegments: { start: number; end: number; text: string }[],
    language?: string
  ): void {
    const now = new Date();
    const newSegs: LiveTranscriptionSegment[] = rawSegments
      .filter((s) => s.text?.trim())
      .map((s) => ({
        id: `lt-${++this.segmentCounter}-${Date.now()}`,
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        language: language ?? this.activeLanguage,
        receivedAt: now,
      }));

    if (newSegs.length === 0) return;

    const current = this.segmentsSubject.value;
    // Keep at most 200 segments to avoid memory growth in long meetings
    const combined = [...current, ...newSegs].slice(-200);
    this.segmentsSubject.next(combined);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  private cleanup(): void {
    this.clearReconnectTimeout();
    this.stopAudioCapture();
    this.stopPing();

    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }

    this.activeStream = null;
  }

  ngOnDestroy(): void {
    this.cleanup();
  }
}