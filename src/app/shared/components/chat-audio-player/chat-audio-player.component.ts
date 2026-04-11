import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chat-audio-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="voice-note-player" [class.is-mine]="isMine">
      <button class="play-pause-btn" (click)="togglePlay()" [title]="isPlaying ? 'Pause' : 'Play'">
        <i class="bi" [class.bi-play-fill]="!isPlaying" [class.bi-pause-fill]="isPlaying"></i>
      </button>

      <div class="waveform-container" (click)="seek($event)">
        <div class="waveform-bars">
          <div *ngFor="let h of waveformBars; let idx = index"
            class="bar"
            [class.played]="(idx / waveformBars.length) * 100 < progress"
            [style.height.px]="h">
          </div>
        </div>
      </div>

      <div class="player-meta">
        <!-- {{ formatTime(currentTime) }} /  -->
        <span class="time-label">{{ formatTime(duration) }}</span>
        <!-- <button class="speed-badge" (click)="toggleSpeed(); $event.stopPropagation()" title="Playback Speed">
          {{ playbackSpeed }}x
        </button>
        <button class="download-btn" (click)="download($event)" title="Download">
          <i class="bi bi-download"></i>
        </button> -->
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; max-width: 340px; }

    .voice-note-player {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 4px;
      background: transparent;
      user-select: none;
    }

    .play-pause-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: var(--accent-color);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.15s;
      box-shadow: 0 2px 6px rgba(99, 102, 241, 0.35);

      &:hover {
        background: color-mix(in srgb, var(--accent-color) 85%, #000);
        transform: scale(1.06);
      }

      i { font-size: 1rem; }
    }

    .waveform-container {
      flex: 1;
      height: 36px;
      position: relative;
      cursor: pointer;
      display: flex;
      align-items: center;
      min-width: 100px;
    }

    .waveform-bars {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2px;
    }

    .bar {
      flex: 1;
      max-width: 3px;
      min-height: 3px;
      background: rgba(161, 185, 235, 0.25);
      border-radius: 3px;
      transition: background 0.12s ease;
    }

    .bar.played {
      background: var(--accent-color);
    }

    .player-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      flex-shrink: 0;
    }

    .player-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .speed-badge {
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.2);
      padding: 1px 7px;
      border-radius: 5px;
      font-size: 10px;
      font-weight: 700;
      color: var(--accent-color);
      cursor: pointer;
      transition: background 0.15s;
      &:hover { background: rgba(99, 102, 241, 0.16); }
    }

    .download-btn {
      background: transparent;
      border: none;
      padding: 3px;
      color: #94a3b8;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      transition: color 0.15s;
      &:hover { color: var(--accent-color); }
    }

    .time-label {
      font-size: 1rem;
      font-weight: 600;
      color: #64748b;
      white-space: nowrap;
      letter-spacing: 0.2px;
    }
  `]
})
export class ChatAudioPlayerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) audioUrl!: string;
  @Input() duration: number = 0;
  @Input() isMine: boolean = false;
  @Input() fileName: string = 'voice-note.webm';

  private audio: HTMLAudioElement = new Audio();
  isPlaying = false;
  currentTime = 0;
  progress = 0;
  playbackSpeed = 1;

  waveformBars: number[] = this.generateWaveform(40);

  constructor(private cdr: ChangeDetectorRef) { }

  generateWaveform(count: number): number[] {
    const bars: number[] = [];
    for (let i = 0; i < count; i++) {
      // Create a more natural-looking waveform with peaks and valleys
      const center = count / 2;
      const distFromCenter = Math.abs(i - center) / center;
      const envelope = 1 - distFromCenter * 0.4;
      const noise = Math.random();
      const height = Math.round((noise * 0.7 + 0.3) * envelope * 28) + 4;
      bars.push(height);
    }
    return bars;
  }

  ngOnInit() {
    this.audio.src = this.audioUrl;

    this.audio.addEventListener('loadedmetadata', () => {
      if (isFinite(this.audio.duration)) {
        this.duration = this.audio.duration;
        this.cdr.detectChanges();
      }
    });

    this.audio.addEventListener('timeupdate', () => {
      this.currentTime = this.audio.currentTime;
      if (isFinite(this.audio.duration)) {
        this.duration = this.audio.duration;
      }
      this.progress = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
      this.cdr.detectChanges();
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.currentTime = 0;
      this.progress = 0;
      this.cdr.detectChanges();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.cdr.detectChanges();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.cdr.detectChanges();
    });
  }

  togglePlay() {
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play();
    }
  }

  seek(event: MouseEvent) {
    const container = event.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = x / rect.width;
    if (this.duration) {
      this.audio.currentTime = percentage * this.duration;
    }
  }

  toggleSpeed() {
    const speeds = [1, 1.5, 2];
    const currentIndex = speeds.indexOf(this.playbackSpeed);
    this.playbackSpeed = speeds[(currentIndex + 1) % speeds.length];
    this.audio.playbackRate = this.playbackSpeed;
  }

  download(event: Event) {
    event.stopPropagation();
    const link = document.createElement('a');
    link.href = this.audioUrl;
    link.download = this.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  ngOnDestroy() {
    this.audio.pause();
    this.audio.src = '';
    this.audio.load();
  }
}
