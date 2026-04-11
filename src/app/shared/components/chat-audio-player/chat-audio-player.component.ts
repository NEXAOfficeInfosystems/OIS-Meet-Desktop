import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chat-audio-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="audio-player" [class.playing]="isPlaying">
      <button class="play-btn" (click)="togglePlay()" [title]="isPlaying ? 'Pause' : 'Play'">
        <i class="bi" [class.bi-play-fill]="!isPlaying" [class.bi-pause-fill]="isPlaying"></i>
      </button>
      
      <div class="player-content">
        <div class="waveform-container">
          <div class="progress-bar" [style.width.%]="progress"></div>
          <div class="waveform-overlay">
            <div class="bar" *ngFor="let h of waveformBars" [style.height.%]="h"></div>
          </div>
        </div>
        <div class="player-meta">
          <span class="currentTime">{{ formatTime(currentTime) }}</span>
          <span class="duration">{{ formatTime(duration) }}</span>
        </div>
      </div>

      <div class="speed-control" (click)="toggleSpeed()">
        {{ playbackSpeed }}x
      </div>
    </div>
  `,
  styles: [`
    .audio-player {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      min-width: 240px;
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .play-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: var(--fluent-primary, #2563EB);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .play-btn:hover { transform: scale(1.05); }
    .play-btn i { font-size: 1.2rem; }

    .player-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .waveform-container {
      position: relative;
      height: 24px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
    }
    .progress-bar {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: rgba(37, 99, 235, 0.2);
      transition: width 0.1s linear;
    }
    .waveform-overlay {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-around;
      padding: 0 4px;
    }
    .bar {
      width: 2px;
      background: var(--fluent-primary, #2563EB);
      opacity: 0.4;
      border-radius: 1px;
    }

    .player-meta {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--fluent-text-secondary, #64748b);
      font-weight: 500;
    }

    .speed-control {
      font-size: 11px;
      font-weight: 700;
      color: var(--fluent-primary, #2563EB);
      cursor: pointer;
      padding: 4px 6px;
      background: rgba(37, 99, 235, 0.1);
      border-radius: 4px;
      user-select: none;
    }
    .speed-control:hover { background: rgba(37, 99, 235, 0.2); }
  `]
})
export class ChatAudioPlayerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) audioUrl!: string;
  @Input() duration: number = 0;

  private audio: HTMLAudioElement = new Audio();
  isPlaying = false;
  currentTime = 0;
  progress = 0;
  playbackSpeed = 1;

  waveformBars: number[] = [];

  constructor(private cdr: ChangeDetectorRef) {
    // Generate random heights for the waveform look
    for (let i = 0; i < 30; i++) {
      this.waveformBars.push(Math.random() * 60 + 20);
    }
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

  toggleSpeed() {
    const speeds = [1, 1.5, 2];
    const currentIndex = speeds.indexOf(this.playbackSpeed);
    this.playbackSpeed = speeds[(currentIndex + 1) % speeds.length];
    this.audio.playbackRate = this.playbackSpeed;
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
