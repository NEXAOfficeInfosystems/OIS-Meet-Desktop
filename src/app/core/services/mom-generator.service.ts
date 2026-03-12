import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { TranscriptionSegment } from './audio-recorder.service';

export interface GenerateMomRequest {
  meetingId: string;
  momTemplateName?: string;
  date?: string; // dd-MM-yyyy (default)
  segments: TranscriptionSegment[];
  sourceAudioFileName?: string;
}

export interface GenerateMomResponse {
  status: 'success' | 'error' | string;
  result?: any;
  error?: string;
  details?: any;
  transcriptFilePath?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MomGeneratorService {
  private readonly defaultMomTemplateName = 'investor';

  async generateMomFromTranscription(req: GenerateMomRequest): Promise<GenerateMomResponse> {
    try {
      const meetingId = (req.meetingId || '').toString().trim();
      if (!meetingId) {
        return { status: 'error', error: 'Missing meetingId' };
      }

      const transcriptText = this.formatTranscriptText({
        meetingId,
        segments: req.segments || [],
        sourceAudioFileName: req.sourceAudioFileName
      });

      const transcriptFileName = this.safeMeetingFileName(meetingId) + '.txt';

      const aiApiBaseUrl = (environment.aiApiBaseUrl || '').toString().trim().replace(/\/+$/, '');

      // Prefer Electron main-process call (avoids CORS and supports filesystem path)
      if (window.oisMeet?.isElectron && window.oisMeet.saveTranscriptTextFile && window.oisMeet.generateMom) {
        const saved = await window.oisMeet.saveTranscriptTextFile(transcriptText, transcriptFileName);
        if (!saved?.success || !saved.filePath) {
          return { status: 'error', error: saved?.error || 'Failed to save transcript file' };
        }

        const date = (req.date || '').toString().trim() || this.formatDateDdMmYyyy(new Date());
        const momTemplateName = (req.momTemplateName || '').toString().trim() || this.defaultMomTemplateName;

        const momResponse = await window.oisMeet.generateMom({
          meetingId,
          date,
          momTemplateName,
          transcriptFilePath: saved.filePath,
          aiApiBaseUrl
        });

        return {
          ...(momResponse || { status: 'error', error: 'Empty response from generate-mom' }),
          transcriptFilePath: saved.filePath
        };
      }

      // Browser fallback (may be blocked by CORS depending on server config)
      const formData = new FormData();
      formData.append('meeting_id', meetingId);
      formData.append('date', (req.date || '').toString().trim() || this.formatDateDdMmYyyy(new Date()));
      formData.append('mom_template_name', (req.momTemplateName || '').toString().trim() || this.defaultMomTemplateName);
      formData.append('transcript_file', new Blob([transcriptText], { type: 'text/plain' }), transcriptFileName);

      const response = await fetch(`${aiApiBaseUrl}/generate-mom`, {
        method: 'POST',
        body: formData
      });

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => '');

      if (!response.ok) {
        return {
          status: 'error',
          error: `Generate MoM request failed (${response.status} ${response.statusText})`,
          details: payload
        };
      }

      return { status: 'success', result: payload };
    } catch (error: any) {
      return { status: 'error', error: error?.message || 'Failed to generate MoM' };
    }
  }

  private formatTranscriptText(input: { meetingId: string; segments: TranscriptionSegment[]; sourceAudioFileName?: string }): string {
    const headerLines: string[] = [];
    headerLines.push(`meeting_id: ${input.meetingId}`);
    headerLines.push(`generated_at: ${new Date().toISOString()}`);
    if (input.sourceAudioFileName) {
      headerLines.push(`source_audio: ${input.sourceAudioFileName}`);
    }
    headerLines.push('');

    const lines = (input.segments || []).map((seg) => {
      const start = this.formatSeconds(seg.start);
      const end = this.formatSeconds(seg.end);
      const speaker = (seg.speaker || 'Speaker').toString().trim() || 'Speaker';
      const text = (seg.text || '').toString().trim();
      return `[${start} - ${end}] ${speaker}: ${text}`;
    });

    return headerLines.concat(lines).join('\n');
  }

  private formatSeconds(value: number): string {
    const n = Number.isFinite(value) ? value : 0;
    return n.toFixed(3);
  }

  private formatDateDdMmYyyy(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = String(date.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  }

  private safeMeetingFileName(meetingId: string): string {
    return meetingId
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/[.\s]+$/g, '')
      .slice(0, 180) || 'meeting';
  }
}
