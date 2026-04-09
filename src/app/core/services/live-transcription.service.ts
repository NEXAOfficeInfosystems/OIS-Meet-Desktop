// src/app/core/services/live-transcription.service.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Live Transcription Service  — Distributed Mic Architecture  (v4)
//
// WHY THE PREVIOUS APPROACH FAILED
// ─────────────────────────────────
// Browsers enforce a security rule: audio playing through an <audio> or <video>
// element CANNOT be re-captured by an AudioContext on the same page (CORS +
// autoplay policies). So the host trying to pipe remote participants' audio into
// the Whisper WebSocket silently received silence for those tracks.
//
// NEW ARCHITECTURE
// ────────────────
// • Every participant captures ONLY their OWN microphone locally.
// • Every participant sends their own PCM chunks to the Whisper WebSocket.
// • Transcription results are labelled with the sender's name and broadcast to
//   the entire meeting via SignalR so everyone sees a unified stream.
// • The "host" role is now just a coordinator flag (first to click Start):
//     - Host clicks Start  → notifies all via SignalR → everyone opens WS + captures mic.
//     - Host clicks Stop   → notifies all via SignalR → everyone closes WS.
//     - Viewer hides panel → local only, WS stays open, mic capture continues.
//     - Participant leaves → their WS closes, others keep running.
//
// PUBLIC API (used by meeting.component.ts)
// ─────────────────────────────────────────
//   start(micStream, wsUrl, participantName, meetingId, signalR)
//     → opens WS, starts sending own mic, labels segments with participantName
//   startAsViewer()
//     → pure receiver mode (no WS), receives segments via SignalR
//   receiveRemoteSegment(raw)
//     → called on SignalR "LiveTranscriptionSegments" event
//   stop()
//     → closes WS, stops mic capture
//   stopViewing()
//     → clears viewer state
//   clearSegments()
//   segments$  / status$  / error$
//   isActiveParticipant  → boolean (true = this client has its own WS open)
// ═══════════════════════════════════════════════════════════════════════════════

import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface LiveTranscriptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  language?: string;
  speakerName: string;     // who spoke this segment
  receivedAt: Date;
  isOwn: boolean;          // true = produced by THIS client's mic
}

export type LiveTranscriptionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'     // this client has its own WS open and mic capturing
  | 'viewing'       // receiving via SignalR only (viewer, no mic capture)
  | 'error'
  | 'stopped';

export interface ISignalRBridge {
  broadcastLiveTranscriptionSegments(
    meetingId: string,
    segments: Array<{ start: number; end: number; text: string; language?: string; speakerName: string }>
  ): Promise<void>;
  notifyLiveTranscriptionStarted(meetingId: string): Promise<void>;
  notifyLiveTranscriptionStopped(meetingId: string): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class LiveTranscriptionService implements OnDestroy {

  // ── Public observables ──────────────────────────────────────────────────────
  private readonly segmentsSubject = new BehaviorSubject<LiveTranscriptionSegment[]>([]);
  public readonly segments$: Observable<LiveTranscriptionSegment[]> = this.segmentsSubject.asObservable();

  private readonly statusSubject = new BehaviorSubject<LiveTranscriptionStatus>('idle');
  public readonly status$: Observable<LiveTranscriptionStatus> = this.statusSubject.asObservable();

  private readonly errorSubject = new Subject<string>();
  public readonly error$: Observable<string> = this.errorSubject.asObservable();

  /** True when this client's own WebSocket + mic capture is running. */
  public get isActiveParticipant(): boolean { return this._isActiveParticipant; }
  private _isActiveParticipant = false;

  /** True when this client is the one who initiated the session (clicked Start). */
  public get isSessionHost(): boolean { return this._isSessionHost; }
  private _isSessionHost = false;

  // ── Private WebSocket / Audio state ────────────────────────────────────────
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  private sampleBuffer: Float32Array[] = [];
  private segmentCounter = 0;

  // Kept for reconnect
  private activeWsUrl = '';
  private activeMeetingId = '';
  private activeLanguage = 'en';
  private activeParticipantName = '';
  private activeMicStream: MediaStream | null = null;
  private signalRBridge: ISignalRBridge | null = null;

  // Audio constants
  private readonly SAMPLE_RATE = 16000;
  private readonly CHUNK_INTERVAL_MS = 1500;
  private readonly SCRIPT_PROCESSOR_SZ = 4096;
  private readonly MAX_SEGMENTS = 500;
  private readonly SILENCE_THRESHOLD = 0.005;

  constructor(private ngZone: NgZone) { }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start capturing THIS participant's own microphone and sending to Whisper.
   * Called on every participant (host AND viewers) when the session is active.
   *
   * @param micStream        The local MediaStream (mic only)
   * @param wsUrl            e.g. "ws://192.168.1.47:8001/ws/transcribe"
   * @param participantName  Used to label segments (e.g. "Alice")
   * @param meetingId        Used to broadcast segments via SignalR
   * @param signalR          Bridge for SignalR invocations
   * @param isSessionHost    True only for the participant who clicked Start
   * @param language         ISO-639-1 code, default "en"
   */
  public async start(
    micStream: MediaStream,
    wsUrl: string,
    participantName: string,
    meetingId: string,
    signalR: ISignalRBridge,
    isSessionHost = false,
    language = 'en'
  ): Promise<void> {
    const s = this.statusSubject.value;
    if (s === 'connecting' || s === 'connected') return;

    this._isActiveParticipant = true;
    this._isSessionHost = isSessionHost;
    this.activeWsUrl = wsUrl;
    this.activeMeetingId = meetingId;
    this.activeLanguage = language;
    this.activeParticipantName = participantName;
    this.activeMicStream = micStream;
    this.signalRBridge = signalR;

    this.statusSubject.next('connecting');
    this.connectWebSocket();
  }

  /**
   * Pure viewer mode: receive segments via SignalR, no mic capture, no WS.
   * Called on late joiners or if a participant's WS fails completely.
   */
  public startAsViewer(): void {
    this.cleanup();
    this._isActiveParticipant = false;
    this._isSessionHost = false;
    this.statusSubject.next('viewing');
  }

  /**
   * Inject a segment received via SignalR from another participant.
   * The segment already carries speakerName set by the sender.
   */
  public receiveRemoteSegment(raw: {
    start: number; end: number; text: string; language?: string; speakerName?: string;
  }): void {
    if (!raw.text?.trim()) return;
    this.ngZone.run(() => {
      const seg: LiveTranscriptionSegment = {
        id: `rmt-${++this.segmentCounter}-${Date.now()}`,
        start: raw.start,
        end: raw.end,
        text: raw.text.trim(),
        language: raw.language,
        speakerName: raw.speakerName || 'Participant',
        receivedAt: new Date(),
        isOwn: false,
      };
      const updated = [...this.segmentsSubject.value, seg].slice(-this.MAX_SEGMENTS);
      this.segmentsSubject.next(updated);
    });
  }

  /** Stop WS + mic capture. For the host this ends the session for everyone (caller handles SignalR notify). */
  public stop(): void {
    this.cleanup();
    this._isActiveParticipant = false;
    this._isSessionHost = false;
    this.statusSubject.next('stopped');
  }

  /** Stop viewer state without affecting the running session. */
  public stopViewing(): void {
    this._isActiveParticipant = false;
    this._isSessionHost = false;
    this.statusSubject.next('stopped');
    this.segmentsSubject.next([]);
    this.segmentCounter = 0;
  }

  /** Wipe displayed segments without stopping. */
  public clearSegments(): void {
    this.segmentsSubject.next([]);
    this.segmentCounter = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET
  // ═══════════════════════════════════════════════════════════════════════════

  private connectWebSocket(): void {
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } this.ws = null; }

    try {
      this.ws = new WebSocket(this.activeWsUrl);

      this.ws.onopen = () => {
        this.ngZone.run(() => this.statusSubject.next('connected'));
        this.startMicCapture();
        this.startPing();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'transcription' && Array.isArray(msg.segments) && msg.segments.length) {
            this.ngZone.run(() => this.handleSegmentsFromWs(msg.segments, msg.language));
          }
        } catch { /* ignore malformed frame */ }
      };

      this.ws.onerror = () => {
        this.ngZone.run(() => {
          this.statusSubject.next('error');
          this.errorSubject.next('WebSocket error – retrying…');
        });
        this.stopMicCapture();
        this.stopPing();
        this.scheduleReconnect();
      };

      this.ws.onclose = () => {
        this.ngZone.run(() => {
          if (this.statusSubject.value !== 'stopped') this.statusSubject.next('error');
        });
        this.stopMicCapture();
        this.stopPing();
      };

    } catch {
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
    if (this.reconnectTimeout !== null) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
  }

  // ── Ping ────────────────────────────────────────────────────────────────────
  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'ping' }));
    }, 10000);
  }
  private stopPing(): void {
    if (this.pingInterval !== null) { clearInterval(this.pingInterval); this.pingInterval = null; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MIC CAPTURE  (own mic only → 16 kHz mono PCM)
  // ═══════════════════════════════════════════════════════════════════════════

  private startMicCapture(): void {
    if (!this.activeMicStream) return;

    // Use only live, active audio tracks — ignore ended or muted-at-hardware-level tracks
    const micTracks = this.activeMicStream.getAudioTracks()
      .filter(t => t.readyState === 'live');
    if (!micTracks.length) {
      console.warn('[LiveTranscription] No live audio tracks available for capture');
      return;
    }

    try {
      // AudioContext resampled to 16 kHz so Whisper gets the right sample rate
      this.audioContext = new AudioContext({ sampleRate: this.SAMPLE_RATE });

      // Resume suspended context (Electron/Chromium autoplay policy)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(e =>
          console.warn('[LiveTranscription] AudioContext resume failed:', e));
      }

      this.micSourceNode = this.audioContext.createMediaStreamSource(
        new MediaStream(micTracks)
      );

      // ScriptProcessorNode: collect raw PCM frames
      // (deprecated but universally supported without SharedArrayBuffer)
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        this.SCRIPT_PROCESSOR_SZ, 1, 1
      );
      this.scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        if (this.audioContext?.state !== 'running') return;
        // Clone samples — the underlying buffer is reused after the event
        this.sampleBuffer.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };

      this.micSourceNode.connect(this.scriptProcessor);
      // Must connect to destination; otherwise Chrome suppresses the callback
      this.scriptProcessor.connect(this.audioContext.destination);

      // Flush samples to WS on a fixed cadence
      this.flushInterval = setInterval(() => this.flushBuffer(), this.CHUNK_INTERVAL_MS);

      console.log('[LiveTranscription] Mic capture started, AudioContext state:', this.audioContext.state);

    } catch (err) {
      console.error('[LiveTranscription] Mic capture failed:', err);
      this.ngZone.run(() => {
        this.errorSubject.next('Microphone capture failed — please check mic permissions');
        this.statusSubject.next('error');
      });
    }
  }

  private stopMicCapture(): void {
    if (this.flushInterval !== null) { clearInterval(this.flushInterval); this.flushInterval = null; }
    this.sampleBuffer = [];
    try { this.scriptProcessor?.disconnect(); } catch { /* ignore */ }
    try { this.micSourceNode?.disconnect(); } catch { /* ignore */ }
    try { this.audioContext?.close(); } catch { /* ignore */ }
    this.scriptProcessor = null;
    this.micSourceNode = null;
    this.audioContext = null;
  }

  /** Merge buffered PCM frames into one chunk and send to Whisper. */
  private flushBuffer(): void {
    if (!this.sampleBuffer.length || this.ws?.readyState !== WebSocket.OPEN) return;

    const totalLen = this.sampleBuffer.reduce((a, f) => a + f.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const frame of this.sampleBuffer) { merged.set(frame, offset); offset += frame.length; }
    this.sampleBuffer = [];

    // Skip near-silent chunks (background noise / muted mic)
    if (this.computeRMS(merged) < this.SILENCE_THRESHOLD) return;

    try {
      this.ws!.send(JSON.stringify({
        type: 'audio_data',
        data: Array.from(merged),
        language: this.activeLanguage,
      }));
    } catch { /* WS closed between check and send */ }
  }

  private computeRMS(s: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
    return Math.sqrt(sum / s.length);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEGMENT HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  private handleSegmentsFromWs(
    raw: { start: number; end: number; text: string }[],
    language?: string
  ): void {
    const now = new Date();
    const newSegs: LiveTranscriptionSegment[] = raw
      .filter((s) => s.text?.trim())
      .map((s) => ({
        id: `lt-${++this.segmentCounter}-${Date.now()}`,
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        language: language ?? this.activeLanguage,
        speakerName: this.activeParticipantName,
        receivedAt: now,
        isOwn: true,
      }));

    if (!newSegs.length) return;

    // Add to own display immediately (zero latency for the speaker)
    const combined = [...this.segmentsSubject.value, ...newSegs].slice(-this.MAX_SEGMENTS);
    this.segmentsSubject.next(combined);

    // Broadcast to all other participants via SignalR
    if (this.signalRBridge && this.activeMeetingId) {
      this.signalRBridge
        .broadcastLiveTranscriptionSegments(
          this.activeMeetingId,
          newSegs.map((s) => ({
            start: s.start,
            end: s.end,
            text: s.text,
            language: s.language,
            speakerName: s.speakerName,
          }))
        )
        .catch(() => { /* non-fatal */ });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  private cleanup(): void {
    this.clearReconnectTimeout();
    this.stopMicCapture();
    this.stopPing();
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } this.ws = null; }
    this.activeMicStream = null;
    this.signalRBridge = null;
  }

  ngOnDestroy(): void { this.cleanup(); }
}