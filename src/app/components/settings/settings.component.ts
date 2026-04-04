import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService, UserSettings } from '../../core/services/settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  settings: UserSettings = {
    showMessagePreview: true,
    showMediaPreviews: true,
    notificationsMentionsOnly: false,
    preferredAudioInputId: 'default',
    preferredAudioOutputId: 'default',
    preferredVideoInputId: 'default'
  };

  audioInputs: MediaDeviceInfo[] = [];
  audioOutputs: MediaDeviceInfo[] = [];
  videoInputs: MediaDeviceInfo[] = [];

  isPreviewing: boolean = false;
  @ViewChild('previewVideo') previewVideo!: ElementRef<HTMLVideoElement>;
  private previewStream: MediaStream | null = null;
  audioLevel: number = 0;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrame: number | null = null;

  constructor(
    private settingsService: SettingsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.settingsService.settings$.subscribe(settings => {
      this.settings = { ...settings };
      this.cdr.detectChanges();
    });
    this.loadDevices();
  }

  async loadDevices(): Promise<void> {
    try {
      // Request permissions first to get labels
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      this.audioInputs = devices.filter(d => d.kind === 'audioinput');
      this.audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      this.videoInputs = devices.filter(d => d.kind === 'videoinput');
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error loading devices:', err);
    }
  }

  updateDevice(key: 'preferredAudioInputId' | 'preferredAudioOutputId' | 'preferredVideoInputId', event: any): void {
    const value = event.target.value;
    this.settings[key] = value;
    this.settingsService.updateSettings({ [key]: value });
    
    if (this.isPreviewing) {
      this.stopPreview();
      this.startPreview();
    }
  }

  toggleSetting(key: keyof UserSettings): void {
    const val = this.settings[key];
    if (typeof val === 'boolean') {
      const newVal = !val;
      (this.settings as any)[key] = newVal;
      this.settingsService.updateSettings({ [key]: newVal });
    }
  }

  async startPreview(): Promise<void> {
    try {
      const constraints = {
        audio: { deviceId: this.settings.preferredAudioInputId ? { exact: this.settings.preferredAudioInputId } : undefined },
        video: { deviceId: this.settings.preferredVideoInputId ? { exact: this.settings.preferredVideoInputId } : undefined }
      };

      this.previewStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.previewVideo?.nativeElement) {
        this.previewVideo.nativeElement.srcObject = this.previewStream;
      }
      this.isPreviewing = true;
      this.setupAudioLevelTracking(this.previewStream);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error starting preview:', err);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  }

  stopPreview(): void {
    if (this.previewStream) {
      this.previewStream.getTracks().forEach(track => track.stop());
      this.previewStream = null;
    }
    if (this.previewVideo?.nativeElement) {
      this.previewVideo.nativeElement.srcObject = null;
    }
    this.isPreviewing = false;
    this.stopAudioLevelTracking();
    this.cdr.detectChanges();
  }

  private setupAudioLevelTracking(stream: MediaStream): void {
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      this.audioLevel = Math.min(100, (sum / bufferLength) * 2);
      this.cdr.detectChanges();
      this.animationFrame = requestAnimationFrame(update);
    };
    update();
  }

  private stopAudioLevelTracking(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.audioLevel = 0;
  }

  resetDefaults(): void {
    if (confirm('Are you sure you want to reset all settings to default?')) {
      this.settingsService.resetToDefault();
    }
  }
}
