import {
  Component, Input, OnInit, OnDestroy, ChangeDetectorRef,
  ElementRef, ViewChild, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chat-video-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="screen-rec-player" [class.is-mine]="isMine">

      <!-- Thumbnail / video area -->
      <div class="video-wrapper" (click)="togglePlay()">
        <video
          #videoEl
          [src]="videoUrl"
          preload="metadata"
          playsinline
          (loadedmetadata)="onMetadata()"
          (seeked)="onSeeked()"
          (timeupdate)="onTimeUpdate()"
          (ended)="onEnded()"
          (play)="isPlaying = true; cdr.detectChanges()"
          (pause)="isPlaying = false; cdr.detectChanges()">
        </video>

        <!-- Overlay play button -->
        <div class="play-overlay" [class.hidden]="isPlaying">
          <div class="play-circle">
            <i class="bi bi-play-fill"></i>
          </div>
        </div>

        <!-- Screen recording badge -->
        <span class="rec-badge">
          <i class="bi bi-display"></i> Screen
        </span>

        <!-- Fullscreen button (top-right of video) -->
        <button class="fullscreen-btn" (click)="openFullscreen($event)" title="Full screen">
          <i class="bi bi-fullscreen"></i>
        </button>
      </div>

      <!-- Controls bar -->
      <div class="controls-bar">
        <button class="ctrl-btn" (click)="togglePlay()" [title]="isPlaying ? 'Pause' : 'Play'">
          <i class="bi" [class.bi-play-fill]="!isPlaying" [class.bi-pause-fill]="isPlaying"></i>
        </button>

        <div class="progress-area" (click)="seek($event)">
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="progress"></div>
          </div>
        </div>

        <span class="time-info">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>

        <button class="ctrl-btn speed-btn" (click)="toggleSpeed(); $event.stopPropagation()" title="Speed">
          {{ playbackSpeed }}x
        </button>

        <button class="ctrl-btn" (click)="openFullscreen($event)" title="Full screen">
          <i class="bi bi-fullscreen"></i>
        </button>

        <button class="ctrl-btn" (click)="download($event)" title="Download">
          <i class="bi bi-download"></i>
        </button>
      </div>

    </div>

    <!-- ── Custom fullscreen overlay ─────────────────────────────────────── -->
    <div class="fs-overlay" *ngIf="isFullscreen" (click)="closeFullscreen()">
      <video
        #fsVideoEl
        class="fs-video"
        [src]="videoUrl"
        playsinline
        (click)="$event.stopPropagation(); fsTogglePlay()"
        (loadedmetadata)="fsSeeked()"
        (timeupdate)="fsTimeUpdate()"
        (ended)="fsEnded()"
        (play)="fsPlaying = true; cdr.detectChanges()"
        (pause)="fsPlaying = false; cdr.detectChanges()">
      </video>

      <!-- Top bar -->
      <div class="fs-top" (click)="$event.stopPropagation()">
        <span class="fs-badge"><i class="bi bi-display"></i> Screen Recording</span>
        <button class="fs-close-btn" (click)="closeFullscreen()" title="Exit fullscreen">
          <i class="bi bi-fullscreen-exit"></i>
        </button>
      </div>

      <!-- Play overlay -->
      <div class="fs-play-overlay" [class.hidden]="fsPlaying" (click)="$event.stopPropagation(); fsTogglePlay()">
        <div class="play-circle">
          <i class="bi bi-play-fill"></i>
        </div>
      </div>

      <!-- Bottom controls -->
      <div class="fs-controls" (click)="$event.stopPropagation()">
        <button class="ctrl-btn" (click)="fsTogglePlay()" [title]="fsPlaying ? 'Pause' : 'Play'">
          <i class="bi" [class.bi-play-fill]="!fsPlaying" [class.bi-pause-fill]="fsPlaying"></i>
        </button>

        <div class="progress-area" (click)="fsSeek($event)">
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="fsProgress"></div>
          </div>
        </div>

        <span class="time-info">{{ formatTime(fsCurrentTime) }} / {{ formatTime(duration) }}</span>

        <button class="ctrl-btn speed-btn" (click)="fsToggleSpeed()">{{ fsSpeed }}x</button>
        <button class="ctrl-btn" (click)="download($event)" title="Download">
          <i class="bi bi-download"></i>
        </button>
        <button class="ctrl-btn" (click)="closeFullscreen()" title="Exit fullscreen">
          <i class="bi bi-fullscreen-exit"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; max-width: 360px; }

    .screen-rec-player {
      border-radius: 12px;
      overflow: hidden;
      background: #0f172a;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      user-select: none;
    }

    .video-wrapper {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #0f172a;
      cursor: pointer;
      overflow: hidden;

      video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
    }

    .play-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.35);
      transition: opacity 0.2s;

      &.hidden { opacity: 0; pointer-events: none; }
    }

    .play-circle {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(255,255,255,0.92);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);

      i { font-size: 1.4rem; color: #1e293b; padding-left: 3px; }
    }

    .fullscreen-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: rgba(0,0,0,0.5);
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 0.8rem;
      opacity: 0;
      transition: opacity 0.2s;
      backdrop-filter: blur(4px);

      &:hover { background: rgba(0,0,0,0.75); color: #fff; }
    }

    .video-wrapper:hover .fullscreen-btn { opacity: 1; }

    .rec-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      background: rgba(15,23,42,0.75);
      color: #e2e8f0;
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
      backdrop-filter: blur(4px);
    }

    .controls-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: #1e293b;
    }

    .ctrl-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      font-size: 0.9rem;
      flex-shrink: 0;
      transition: color 0.15s;

      &:hover { color: #f1f5f9; }
    }

    .progress-area {
      flex: 1;
      cursor: pointer;
      padding: 8px 0;
    }

    .progress-track {
      height: 3px;
      background: rgba(255,255,255,0.15);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent-color, #6366f1);
      border-radius: 2px;
      transition: width 0.1s linear;
    }

    .time-info {
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .speed-btn {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      border: 1px solid #334155;
      border-radius: 4px;
      padding: 1px 6px;
      &:hover { color: #94a3b8; border-color: #475569; }
    }

    /* ── Fullscreen overlay ────────────────────────────────────────────── */
    .fs-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #000;
      display: flex;
      flex-direction: column;
      user-select: none;
    }

    .fs-video {
      flex: 1;
      width: 100%;
      object-fit: contain;
      display: block;
      cursor: pointer;
      min-height: 0;
    }

    .fs-top {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%);
    }

    .fs-badge {
      background: rgba(15,23,42,0.75);
      color: #e2e8f0;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 5px;
      backdrop-filter: blur(4px);
    }

    .fs-close-btn {
      background: rgba(0,0,0,0.5);
      border: none;
      color: #e2e8f0;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 0.9rem;
      backdrop-filter: blur(4px);

      &:hover { background: rgba(0,0,0,0.8); color: #fff; }
    }

    .fs-play-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
      pointer-events: auto;

      &.hidden { opacity: 0; pointer-events: none; }

      .play-circle {
        width: 72px;
        height: 72px;
        i { font-size: 2rem; }
      }
    }

    .fs-controls {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);

      .ctrl-btn { font-size: 1rem; color: #cbd5e1; &:hover { color: #fff; } }
      .time-info { font-size: 11px; color: #94a3b8; }
      .speed-btn { border-color: #475569; color: #94a3b8; }
      .progress-area { padding: 10px 0; }
      .progress-track { height: 4px; }
    }
  `]
})
export class ChatVideoPlayerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) videoUrl!: string;
  @Input() isMine = false;
  @Input() fileName = 'screen-recording.webm';

  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('fsVideoEl') fsVideoEl?: ElementRef<HTMLVideoElement>;

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  progress = 0;
  playbackSpeed = 1;
  private durationFixed = false;

  // Fullscreen overlay state
  isFullscreen = false;
  fsPlaying = false;
  fsCurrentTime = 0;
  fsProgress = 0;
  fsSpeed = 1;

  constructor(public cdr: ChangeDetectorRef) {}

  ngOnInit() {}

  // ── Inline player handlers ──────────────────────────────────────────────

  onMetadata() {
    const v = this.videoEl?.nativeElement;
    if (!v) return;

    if (isFinite(v.duration) && v.duration > 0) {
      this.duration = v.duration;
      this.durationFixed = true;
      this.cdr.detectChanges();
    } else {
      this.durationFixed = false;
      v.currentTime = 1e10;
    }
  }

  onSeeked() {
    if (this.durationFixed) return;
    const v = this.videoEl?.nativeElement;
    if (!v) return;

    if (isFinite(v.duration) && v.duration > 0) {
      this.duration = v.duration;
      this.durationFixed = true;
      v.currentTime = 0;
      this.cdr.detectChanges();
    }
  }

  onTimeUpdate() {
    const v = this.videoEl?.nativeElement;
    if (!v) return;
    this.currentTime = v.currentTime;
    if (isFinite(v.duration)) this.duration = v.duration;
    this.progress = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
    this.cdr.detectChanges();
  }

  onEnded() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.progress = 0;
    const v = this.videoEl?.nativeElement;
    if (v) v.currentTime = 0;
    this.cdr.detectChanges();
  }

  togglePlay() {
    const v = this.videoEl?.nativeElement;
    if (!v) return;
    this.isPlaying ? v.pause() : v.play();
  }

  seek(event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pct = (event.clientX - rect.left) / rect.width;
    const v = this.videoEl?.nativeElement;
    if (v && this.duration) v.currentTime = pct * this.duration;
  }

  toggleSpeed() {
    const speeds = [1, 1.5, 2];
    const idx = speeds.indexOf(this.playbackSpeed);
    this.playbackSpeed = speeds[(idx + 1) % speeds.length];
    const v = this.videoEl?.nativeElement;
    if (v) v.playbackRate = this.playbackSpeed;
  }

  // ── Custom fullscreen overlay ───────────────────────────────────────────

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (this.isFullscreen) {
      if (event.key === 'Escape') {
        this.closeFullscreen();
      } else if (event.key === ' ') {
        event.preventDefault();
        this.fsTogglePlay();
      }
    }
  }

  openFullscreen(event: Event) {
    event.stopPropagation();
    const v = this.videoEl?.nativeElement;
    if (!v) return;

    // Capture current state
    this.fsCurrentTime = v.currentTime;
    this.fsProgress = (v.currentTime / this.duration) * 100 || 0;
    this.fsSpeed = v.playbackRate || 1;
    this.fsPlaying = !v.paused;

    // Pause the inline player while fullscreen is open
    if (this.isPlaying) v.pause();

    this.isFullscreen = true;
    this.cdr.detectChanges();

    // Prevent body scroll if needed (optional for Electron but good practice)
    document.body.style.overflow = 'hidden';

    // Sync the fullscreen video
    setTimeout(() => {
      const fs = this.fsVideoEl?.nativeElement;
      if (!fs) return;
      
      fs.playbackRate = this.fsSpeed;
      if (isFinite(this.fsCurrentTime)) {
        fs.currentTime = this.fsCurrentTime;
      }
      
      // Auto-play if it was playing, or just let user click
      if (this.fsPlaying) {
        fs.play().catch(() => {
          this.fsPlaying = false;
          this.cdr.detectChanges();
        });
      }
      this.cdr.detectChanges();
    }, 100); // Slightly longer timeout for DOM stability
  }

  closeFullscreen() {
    const fs = this.fsVideoEl?.nativeElement;
    const pos = fs ? fs.currentTime : this.fsCurrentTime;
    const wasPlaying = this.fsPlaying;

    if (fs) { fs.pause(); }

    this.isFullscreen = false;
    document.body.style.overflow = '';
    this.cdr.detectChanges();

    // Restore inline player position
    const v = this.videoEl?.nativeElement;
    if (v) {
      if (isFinite(pos) && pos > 0) {
        v.currentTime = pos;
      }
      if (wasPlaying) {
        v.play().catch(() => {});
      }
    }
  }

  fsSeeked() {
    // metadata or seek finished
  }

  fsTimeUpdate() {
    const fs = this.fsVideoEl?.nativeElement;
    if (!fs) return;
    this.fsCurrentTime = fs.currentTime;
    this.fsProgress = this.duration > 0 ? (this.fsCurrentTime / this.duration) * 100 : 0;
    this.cdr.detectChanges();
  }

  fsEnded() {
    this.fsPlaying = false;
    this.fsCurrentTime = 0;
    this.fsProgress = 0;
    const fs = this.fsVideoEl?.nativeElement;
    if (fs) fs.currentTime = 0;
    this.cdr.detectChanges();
  }

  fsTogglePlay() {
    const fs = this.fsVideoEl?.nativeElement;
    if (!fs) return;
    if (fs.paused) {
      fs.play().then(() => {
        this.fsPlaying = true;
        this.cdr.detectChanges();
      }).catch(() => {});
    } else {
      fs.pause();
      this.fsPlaying = false;
      this.cdr.detectChanges();
    }
  }

  fsSeek(event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pct = (event.clientX - rect.left) / rect.width;
    const fs = this.fsVideoEl?.nativeElement;
    if (fs && this.duration) fs.currentTime = pct * this.duration;
  }

  fsToggleSpeed() {
    const speeds = [1, 1.5, 2];
    const idx = speeds.indexOf(this.fsSpeed);
    this.fsSpeed = speeds[(idx + 1) % speeds.length];
    const fs = this.fsVideoEl?.nativeElement;
    if (fs) fs.playbackRate = this.fsSpeed;
  }

  // ── Shared ─────────────────────────────────────────────────────────────

  download(event: Event) {
    event.stopPropagation();
    const a = document.createElement('a');
    a.href = this.videoUrl;
    a.download = this.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  formatTime(s: number): string {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  ngOnDestroy() {
    document.body.style.overflow = '';
    const v = this.videoEl?.nativeElement;
    if (v) { v.pause(); v.src = ''; }
    const fs = this.fsVideoEl?.nativeElement;
    if (fs) { fs.pause(); fs.src = ''; }
  }
}
