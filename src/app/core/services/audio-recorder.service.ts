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
  private recordingAudioContext: AudioContext | null = null;
  private mixedDestination: MediaStreamAudioDestinationNode | null = null;
  private audioSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private isRecording = false;

  get recording(): boolean {
    return this.isRecording;
  }

  get isElectron(): boolean {
    return !!(window.oisMeet?.isElectron);
  }

  /**
   * Convenience method for meeting recording:
   * - Mixes local microphone audio
   * - Mixes all current remote participant audio elements (audio[id^="remote-audio-"])
   */
  async startRecordingFromMeeting(localStream: MediaStream): Promise<boolean> {
    try {
      // Collect remote streams from existing hidden <audio> elements
      const remoteStreams = new Map<string, MediaStream>();
      const remoteAudioElements = document.querySelectorAll<HTMLAudioElement>('audio[id^="remote-audio-"]');

      remoteAudioElements.forEach((el) => {
        const stream = el.srcObject as MediaStream | null;
        if (stream) {
          remoteStreams.set(el.id, stream);
        }
      });

      console.log(`🎙️ Found ${remoteStreams.size} remote audio element(s) for recording`);

      return this.startRecording(localStream, remoteStreams);
    } catch (error) {
      console.error('Failed to start meeting recording:', error);
      return false;
    }
  }

  async startRecording(localStream: MediaStream, remoteStreams?: Map<string, MediaStream>): Promise<boolean> {
    try {
      if (this.isRecording) {
        console.warn('Recording already in progress');
        return false;
      }

      this.audioChunks = [];
      this.audioSources.clear();

      this.recordingAudioContext = new AudioContext();
      this.mixedDestination = this.recordingAudioContext.createMediaStreamDestination();

      const localAudioTracks = localStream.getAudioTracks();
      if (localAudioTracks.length > 0) {
        const localAudioStream = new MediaStream(localAudioTracks);
        const localSource = this.recordingAudioContext.createMediaStreamSource(localAudioStream);
        localSource.connect(this.mixedDestination);
        this.audioSources.set('local', localSource);
        console.log('🎙️ Added local audio to mixer');
      }

      if (remoteStreams) {
        remoteStreams.forEach((stream, peerId) => {
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            const audioStream = new MediaStream(audioTracks);
            const source = this.recordingAudioContext!.createMediaStreamSource(audioStream);
            source.connect(this.mixedDestination!);
            this.audioSources.set(peerId, source);
            console.log(`🎙️ Added remote audio from ${peerId} to mixer`);
          }
        });
      }

      if (this.audioSources.size === 0) {
        console.error('No audio sources available for recording');
        this.cleanupRecordingContext();
        return false;
      }

      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.mixedDestination.stream, {
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

      console.log(`🎙️ Audio recording started with ${this.audioSources.size} audio source(s)`);
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.cleanupRecordingContext();
      return false;
    }
  }

  addRemoteStream(peerId: string, stream: MediaStream): void {
    if (!this.isRecording || !this.recordingAudioContext || !this.mixedDestination) {
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0 && !this.audioSources.has(peerId)) {
      try {
        const audioStream = new MediaStream(audioTracks);
        const source = this.recordingAudioContext.createMediaStreamSource(audioStream);
        source.connect(this.mixedDestination);
        this.audioSources.set(peerId, source);
        console.log(`🎙️ Added new remote audio from ${peerId} to recording`);
      } catch (error) {
        console.error(`Failed to add remote stream ${peerId}:`, error);
      }
    }
  }

  removeRemoteStream(peerId: string): void {
    const source = this.audioSources.get(peerId);
    if (source) {
      try {
        source.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.audioSources.delete(peerId);
      console.log(`🎙️ Removed remote audio from ${peerId} from recording`);
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
        this.cleanupRecordingContext();

        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  private cleanupRecordingContext(): void {
    this.audioSources.forEach((source) => {
      try {
        source.disconnect();
      } catch (e) {
        // Ignore
      }
    });
    this.audioSources.clear();

    if (this.recordingAudioContext) {
      this.recordingAudioContext.close().catch(() => {});
      this.recordingAudioContext = null;
    }
    this.mixedDestination = null;
  }

  async saveRecordingAsWav(audioBlob: Blob, meetingId: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> {
    try {
      const wavBlob = await this.convertToWav(audioBlob);
      const arrayBuffer = await wavBlob.arrayBuffer();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFileName = `meeting-${meetingId}-${timestamp}.wav`;

      // Send to transcription service (fire-and-forget, log result)
      this.sendToTranscriptionService(wavBlob, defaultFileName).catch(err => {
        console.error('Failed to send recording for transcription:', err);
      });

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

  private async sendToTranscriptionService(wavBlob: Blob, fileName: string): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('file', wavBlob, fileName);

      const response = await fetch('http://20.64.87.203:8002/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        console.error('Transcription request failed with status:', response.status, response.statusText);
        return;
      }

      const data = await response.json();
      console.log('Transcription response:', data);
    } catch (error) {
      console.error('Error calling transcription service:', error);
    }
  }

  private async convertToWav(audioBlob: Blob): Promise<Blob> {
    const arrayBuffer = await audioBlob.arrayBuffer();

    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const wavBuffer = this.audioBufferToWav(audioBuffer);
    audioContext.close().catch(() => {});
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
    this.cleanupRecordingContext();
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
  }
}
