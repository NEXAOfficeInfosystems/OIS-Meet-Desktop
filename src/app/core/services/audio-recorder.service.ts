import { Injectable } from '@angular/core';

declare global {
  interface Window {
    oisMeet?: {
      isElectron: boolean;
      saveAudioFile: (buffer: ArrayBuffer, defaultFileName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
      getRecordingsPath: () => Promise<string>;
    };
  }
}

@Injectable({
  providedIn: 'root'
})
export class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private isRecording = false;

  get recording(): boolean {
    return this.isRecording;
  }

  get isElectron(): boolean {
    return !!(window.oisMeet?.isElectron);
  }

  async startRecording(stream: MediaStream): Promise<boolean> {
    try {
      if (this.isRecording) {
        console.warn('Recording already in progress');
        return false;
      }

      this.audioChunks = [];

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.error('No audio tracks available in stream');
        return false;
      }

      const audioStream = new MediaStream(audioTracks);

      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(audioStream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
      };

      this.mediaRecorder.start(1000);
      this.isRecording = true;

      console.log('🎙️ Audio recording started');
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }

  async stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        console.warn('No recording in progress');
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });

        console.log('🎙️ Audio recording stopped, blob size:', audioBlob.size);

        this.audioChunks = [];
        this.isRecording = false;

        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  async saveRecordingAsWav(audioBlob: Blob, meetingId: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> {
    try {
      const wavBlob = await this.convertToWav(audioBlob);
      const arrayBuffer = await wavBlob.arrayBuffer();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFileName = `meeting-${meetingId}-${timestamp}.wav`;

      if (this.isElectron && window.oisMeet) {
        const result = await window.oisMeet.saveAudioFile(arrayBuffer, defaultFileName);
        return result;
      } else {
        this.downloadInBrowser(wavBlob, defaultFileName);
        return { success: true, filePath: defaultFileName, canceled: false };
      }
    } catch (error: any) {
      console.error('Failed to save recording:', error);
      return { success: false, canceled: false, error: error.message };
    }
  }

  private async convertToWav(audioBlob: Blob): Promise<Blob> {
    const arrayBuffer = await audioBlob.arrayBuffer();

    this.audioContext = new AudioContext();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const wavBuffer = this.audioBufferToWav(audioBuffer);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  private audioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1;
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const samples = this.interleave(audioBuffer);
    const dataLength = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    this.floatTo16BitPCM(view, 44, samples);

    return buffer;
  }

  private interleave(audioBuffer: AudioBuffer): Float32Array {
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const result = new Float32Array(length * numChannels);

    let index = 0;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        result[index++] = audioBuffer.getChannelData(channel)[i];
      }
    }

    return result;
  }

  private floatTo16BitPCM(view: DataView, offset: number, input: Float32Array): void {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm';
  }

  private downloadInBrowser(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
  }
}
