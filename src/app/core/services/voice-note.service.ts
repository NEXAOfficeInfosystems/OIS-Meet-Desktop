import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, timer } from 'rxjs';
import { map } from 'rxjs/operators';

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number; // in seconds
  amplitude: number; // 0 to 1
}

@Injectable({
  providedIn: 'root'
})
export class VoiceNoteService implements OnDestroy {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;

  private stateSubject = new BehaviorSubject<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    amplitude: 0
  });

  public state$ = this.stateSubject.asObservable();
  private timerSubscription: Subscription | null = null;

  constructor() {}

  async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.setupAnalyser(this.stream);
      this.mediaRecorder.start();
      
      this.stateSubject.next({
        isRecording: true,
        isPaused: false,
        duration: 0,
        amplitude: 0
      });

      this.startTimer();
      this.startAmplitudeAnalysis();
    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }

  private setupAnalyser(stream: MediaStream): void {
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
  }

  private startTimer(): void {
    this.timerSubscription = timer(0, 1000).subscribe(() => {
      const currentState = this.stateSubject.value;
      if (!currentState.isPaused) {
        this.stateSubject.next({
          ...currentState,
          duration: currentState.duration + 1
        });
      }
    });
  }

  private startAmplitudeAnalysis(): void {
    const bufferLength = this.analyser!.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const analyze = () => {
      if (!this.stateSubject.value.isRecording) return;

      this.analyser!.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const amplitude = Math.min(1, average / 128);

      this.stateSubject.next({
        ...this.stateSubject.value,
        amplitude: amplitude
      });

      this.animationFrameId = requestAnimationFrame(analyze);
    };

    analyze();
  }

  pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.stateSubject.next({
        ...this.stateSubject.value,
        isPaused: true
      });
    }
  }

  resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.stateSubject.next({
        ...this.stateSubject.value,
        isPaused: false
      });
    }
  }

  async stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  cancelRecording(): void {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.cleanup();
    }
  }

  private cleanup(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stateSubject.next({
      isRecording: false,
      isPaused: false,
      duration: 0,
      amplitude: 0
    });
  }

  ngOnDestroy(): void {
    this.cleanup();
  }
}
