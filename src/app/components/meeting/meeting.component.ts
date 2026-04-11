import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, NgZone, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';
import * as bootstrap from 'bootstrap';
import SimplePeer from 'simple-peer';
import { Subject, takeUntil } from 'rxjs';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { environment } from '../../../environments/environment';

// Services
import { SessionService } from '../../core/services/session.service';
import { MeetingService } from '../../core/services/meeting.service';
import { SignalRService, MeetingParticipant } from '../../core/services/signalr.service';
import { StorageService } from '../../core/services/storage.service';
import { AudioRecorderService, TranscriptionResponse, TranscriptionSegment } from '../../core/services/audio-recorder.service';
import { MomGeneratorService } from '../../core/services/mom-generator.service';
import { LivekitService } from '../../core/services/livekit.service';
import { SettingsService } from '../../core/services/settings.service';
import { CommonService } from '../../core/services/common.service';
import { InitialsPipe } from '../../shared/pipes/initials.pipe';
import {
  LiveTranscriptionService,
  LiveTranscriptionSegment,
  LiveTranscriptionStatus,
  ISignalRBridge,
} from '../../core/services/live-transcription.service';
import { UserService } from '../../core/services/user.service';
import { CallService } from '../../core/services/call.service';
import { ScreenShareStateService, ScreenShareState } from '../../core/services/screen-share-state.service';
import { MeetingRecorderService, RecordingMode, RecordingState } from '../../core/services/meeting-recorder.service';

@Component({
  selector: 'app-meeting',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSnackBarModule, InitialsPipe],
  templateUrl: './meeting.component.html',
  styleUrls: ['./meeting.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})

export class MeetingComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('screenShareVideo') screenShareVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideosContainer') remoteVideosContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('chatMessagesContainer') chatMessagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('liveTranscriptionScroll') liveTranscriptionScroll?: ElementRef<HTMLDivElement>;

  // Meeting Info
  meetingId: string = '';
  displayMeetingId: string = '';
  meetingTopic: string = 'OIS Meet';
  meetingDetails: any = null;
  isHost: boolean = false;

  // UI States
  isMuted: boolean = true;
  isVideoOff: boolean = false;
  isScreenSharing: boolean = false;
  isRemoteScreenSharing: boolean = false;
  screenShareOwnerName: string = 'Your Screen';
  isSpeaking: boolean = false;
  showParticipants: boolean = false;
  showChat: boolean = false;
  isLoading: boolean = true;

  // ── Custom Dialog State ────────────────────────────────────────────
  dialogState = {
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDestructive: false,
    onConfirm: () => { },
    onCancel: () => { }
  };
  // Volume & local mute
  volume: number = 1;
  showVolumeControl: boolean = false;
  private localMutedParticipants: Set<string> = new Set();

  // Real-time Invites Support
  showInvitePopover: boolean = false;
  oisMeetUsers: any[] = [];
  filteredInviteUsers: any[] = [];
  inviteSearchQuery: string = '';
  invitingUserIds = new Set<string>();
  invitedUserIds = new Set<string>();
  participantSearchQuery: string = '';
  isVoiceMode: boolean = false;
  showAddParticipantPanel: boolean = false;

  private readonly livekitEnabled: boolean = !!(environment as any)?.livekitEnabled;
  private livekitInitializing: boolean = false;
  private livekitActive: boolean = false;
  private livekitSubscriptionsInitialized: boolean = false;
  private localLivekitScreenShareTrackSid: string | null = null;
  private remoteLivekitScreenShareTrackSid: string | null = null;
  private livekitAudioTrackSidToIdentity: Map<string, string> = new Map();
  private livekitVideoTrackSidToIdentity: Map<string, string> = new Map();
  // Buffers for LiveKit tracks that arrive before the participant is added via SignalR.
  private pendingLivekitVideoTracks: Map<string, { trackSid: string; mediaStreamTrack: MediaStreamTrack }> = new Map();
  private pendingLivekitAudioTracks: Map<string, { trackSid: string; mediaStreamTrack: MediaStreamTrack }> = new Map();

  private tooltips: bootstrap.Tooltip[] = [];

  // Timer
  meetingDuration: number = 0;
  private timerInterval: any;
  formattedDuration: string = '00:00';

  // Participants
  participants: Participant[] = [];
  private peers: Map<string, any> = new Map();
  private remoteVideoElements: Map<string, HTMLVideoElement> = new Map();
  private remoteAudioStreams: Map<string, MediaStream> = new Map();

  private pendingSignals: Map<string, any[]> = new Map();
  private peerRestartAttempts: Map<string, number> = new Map();
  private connectPeersTimeout: any;

  // Chat Messages
  chatMessages: ChatMessage[] = [];
  newMessage: string = '';

  // Chat Sidebar Tabs
  activeSidebarTab: 'chat' | 'transcription' = 'chat';

  // Transcription
  transcriptionSegments: TranscriptionSegment[] = [];
  transcriptionLoading: boolean = false;
  transcriptionError: string | null = null;
  transcriptionFileName: string | null = null;

  // MoM
  momApiResponse: any = null;
  momPdfGenerating: boolean = false;

  // Grid Layout
  gridLayout: 'grid' | 'speaker' = 'grid';

  private mediaStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  // ── Noise suppression pipeline ────────────────────────────────────────────
  // A dedicated AudioContext processes the raw mic track through a DSP chain
  // (highpass filter → compressor → gain) before the track is sent to peers.
  private noiseSuppressionContext: AudioContext | null = null;
  private processedMicStream: MediaStream | null = null;

  // ── Live Transcription ────────────────────────────────────────────
  isLiveTranscriptionOn: boolean = false;
  liveTranscriptionIsHost: boolean = false;
  showLiveTranscriptionPanel: boolean = false;
  liveTranscriptionStatus: LiveTranscriptionStatus = 'idle';
  liveTranscriptionSegments: LiveTranscriptionSegment[] = [];
  liveTranscriptionError: string | null = null;
  // ───────────────────────────────────────────────────────────────────────

  // User Info
  userFullName: string;
  oisMeetUserId: string = '';
  private connectionId: string | null = null;

  private processedMessageIds: Set<string> = new Set();
  private processedTranscriptionFiles: Set<string> = new Set();
  private signalRListenersInitialized: boolean = false;
  private isDestroying: boolean = false;
  private pendingSignalFlushTimeouts: Map<string, any> = new Map();
  private speakingDetectionHandles: Map<string, { audioContext: AudioContext; frameId: number | null }> = new Map();
  private participantByConnectionId: Map<string, Participant> = new Map();
  private pendingChatScrollFrame: number | null = null;
  private pendingLiveTranscriptionScrollFrame: number | null = null;
  private pendingTooltipInitTimeout: any = null;
  private pendingTooltipRefreshTimeout: any = null;
  private meetingEndedCloseTimeout: any = null;
  private preservedCameraTrack: MediaStreamTrack | null = null;

  private destroy$ = new Subject<void>();

  private readonly maxPeerRestartAttempts = 1;

  // ── Screen-share overlay auto-hide timer ─────────────────────────────────
  private ssControlsHideTimer: any = null;

  // ── ScreenShare state proxy (used by template) ────────────────────────────
  get ssState(): ScreenShareState { return this.ssStateService.state; }
  get ssIsFullScreen(): boolean { return this.ssStateService.state.isFullScreen; }
  get ssIsFocusMode(): boolean { return this.ssStateService.state.isFocusMode; }
  get ssIsPinned(): boolean { return this.ssStateService.state.isPinned; }
  get ssScaleMode(): string { return this.ssStateService.state.scaleMode; }
  get ssShowControls(): boolean { return this.ssStateService.state.showControls; }

  // ── Recording state proxies (used by template) ────────────────────────────
  get recState(): RecordingState { return this.recorderService.state; }
  get isRecording(): boolean { return this.recorderService.isRecording; }
  get isRecPaused(): boolean { return this.recorderService.isPaused; }
  get recStatus(): string { return this.recorderService.state.status; }
  get recTime(): string { return this.recorderService.state.formattedTime; }
  get recSizeKb(): number { return this.recorderService.state.sizeKb; }
  get recMode(): string { return this.recorderService.state.mode; }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private sessionService: SessionService,
    private clipboard: Clipboard,
    private meetingService: MeetingService,
    private signalRService: SignalRService,
    private ngZone: NgZone,
    private audioRecorderService: AudioRecorderService,
    private momGeneratorService: MomGeneratorService,
    private livekitService: LivekitService,
    private liveTranscriptionService: LiveTranscriptionService,
    private settingsService: SettingsService,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
    private callService: CallService,
    public ssStateService: ScreenShareStateService,
    public recorderService: MeetingRecorderService,
    private commonService: CommonService
  ) {
    this.userFullName = this.sessionService.getFullName() || 'User';
    this.oisMeetUserId = this.sessionService.getOISMeetUserId() || '';
    // this.oisMeetUserId = this.storageService.getItem('oisMeetUserId') || this.oisMeetUserId;

    this.audioRecorderService.transcription$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: TranscriptionResponse) => {
        // Ensure UI updates even if callback occurs outside Angular zone
        this.ngZone.run(() => {
          if (data?.filename) {
            this.transcriptionFileName = data.filename;
          }

          if (data?.status === 'loading') {
            this.transcriptionLoading = true;
            this.transcriptionError = null;
            return;
          }

          if (data?.status === 'error') {
            this.transcriptionLoading = false;
            this.transcriptionError = data.error || 'Failed to generate transcription';
            return;
          }

          // Treat anything with a result array as a completed transcription.
          if (Array.isArray(data?.result)) {
            this.transcriptionLoading = false;
            this.transcriptionError = null;
            this.transcriptionSegments = data.result;

            // Fire-and-forget: save transcript to .txt (named by meetingId) and call generate-mom.
            // Run once per transcription filename to avoid duplicate calls.
            const transcriptionKey = `${this.meetingId || 'unknown'}::${data?.filename || 'no-filename'}`;
            if (!this.processedTranscriptionFiles.has(transcriptionKey) && this.meetingId) {
              this.processedTranscriptionFiles.add(transcriptionKey);

              // Share transcription with all participants.
              // Keep existing host-only generation intact; we just broadcast the result.
              if (this.isHost) {
                this.signalRService
                  .publishTranscription(this.meetingId, {
                    filename: data.filename,
                    status: data.status,
                    result: data.result
                  })
                  .catch(() => { });
              }

              this.momGeneratorService
                .generateMomFromTranscription({
                  meetingId: this.meetingId,
                  segments: data.result,
                  sourceAudioFileName: data.filename,
                  momTemplateName: 'investor'
                  // momTemplateName: 'scrum'
                })
                .then((momResponse) => {
                  this.ngZone.run(() => {
                    this.momApiResponse = momResponse;
                  });
                  console.log('Generate MoM response:', momResponse);

                  // Share MoM with all participants so they can download the PDF.
                  if (this.isHost) {
                    this.signalRService.publishMom(this.meetingId, momResponse as any).catch(() => { });
                  }
                })
                .catch((err) => {
                  console.error('Generate MoM failed:', err);
                });
            }
            return;
          }

          // If server returns an unexpected object, just stop loader.
          if (this.transcriptionLoading) {
            this.transcriptionLoading = false;
          }
        });
      });

    // ── Live Transcription subscriptions ─────────────────────────────────────
    this.liveTranscriptionService.segments$
      .pipe(takeUntil(this.destroy$))
      .subscribe((segs) => {
        this.ngZone.run(() => {
          this.liveTranscriptionSegments = segs;
          this.scrollLiveTranscriptionToBottom();
        });
      });

    this.liveTranscriptionService.status$
      .pipe(takeUntil(this.destroy$))
      .subscribe((status) => {
        this.ngZone.run(() => {
          this.liveTranscriptionStatus = status;
          if (status === 'error') {
            this.liveTranscriptionError = 'Reconnecting to transcription server...';
          } else if (status === 'connected' || status === 'viewing') {
            this.liveTranscriptionError = null;
          }
        });
      });

    this.liveTranscriptionService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => this.ngZone.run(() => { this.liveTranscriptionError = msg; }));
    // ────────────────────────────────────────────────────────────────────────
  }

  downloadMomPdf(): void {
    if (this.momPdfGenerating) {
      return;
    }

    const momPayload = this.extractMomPayload(this.momApiResponse);
    if (!momPayload) {
      console.warn('MoM data not available yet.');
      return;
    }

    this.momPdfGenerating = true;
    try {
      const meetingId = this.safeString(momPayload.meeting_id || this.meetingId || 'meeting');
      const date = this.safeString(momPayload.date || '');
      const title = this.safeString(momPayload.meeting_title || meetingId || 'Minutes of Meeting');
      const location = this.safeString(momPayload.location || '');
      const objective = this.safeString(momPayload.objective || '');

      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Minutes of Meeting (MoM)', 105, 14, { align: 'center' });

      doc.setFontSize(12);
      doc.text(title, 105, 22, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Meeting ID: ${meetingId}`, 14, 30);
      if (date) {
        doc.text(`Date: ${date}`, 150, 30);
      }

      let cursorY = 34;

      autoTable(doc, {
        startY: cursorY,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
        headStyles: { fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 150 }
        },
        body: [
          ['Objective', objective || '-'],
          ['Location', location || 'Virtual Meeting']
        ]
      });

      cursorY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : cursorY + 22;

      const attendees: string[] = Array.isArray(momPayload.attendees) ? momPayload.attendees : [];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Attendees', 14, cursorY);
      cursorY += 3;

      autoTable(doc, {
        startY: cursorY,
        theme: 'striped',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
        body: (attendees.length ? attendees : ['-']).map((a) => [this.safeString(a)])
      });
      cursorY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : cursorY + 20;

      // Agenda
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Agenda', 14, cursorY);
      cursorY += 6;

      const agendaItems: any[] = Array.isArray(momPayload.agenda_items) ? momPayload.agenda_items : [];
      if (!agendaItems.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('-', 14, cursorY);
        cursorY += 6;
      } else {
        agendaItems.forEach((agenda, index) => {
          cursorY = this.ensurePdfSpace(doc, cursorY, 18);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text(`${index + 1}. ${this.safeString(agenda?.item || '')}`, 14, cursorY);
          cursorY += 5;

          const discussion: string[] = Array.isArray(agenda?.discussion_summary) ? agenda.discussion_summary : [];
          const takeaways: string[] = Array.isArray(agenda?.key_takeaways) ? agenda.key_takeaways : [];

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);

          if (discussion.length) {
            cursorY = this.writePdfBulletList(doc, cursorY, discussion, 'Discussion');
          }
          if (takeaways.length) {
            cursorY = this.writePdfBulletList(doc, cursorY, takeaways, 'Key takeaways');
          }

          cursorY += 3;
        });
      }

      // Decisions
      cursorY = this.ensurePdfSpace(doc, cursorY, 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Decisions Made', 14, cursorY);
      cursorY += 6;
      const decisionsRaw: any[] = Array.isArray(momPayload.decisions_made) ? momPayload.decisions_made : [];
      if (!decisionsRaw.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('-', 14, cursorY);
        cursorY += 6;
      } else {
        const first = decisionsRaw[0];
        const isObjectArray = first && typeof first === 'object' && !Array.isArray(first);

        if (isObjectArray) {
          autoTable(doc, {
            startY: cursorY,
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
            headStyles: { fontStyle: 'bold' },
            head: [['Decision #', 'Description', 'Decision Maker', 'Date Made']],
            body: decisionsRaw.map((d: any, idx: number) => [
              this.safeString(d?.decision_number || `D-${String(idx + 1).padStart(3, '0')}`),
              this.safeString(d?.description || '-'),
              this.safeString(d?.decision_maker || '-'),
              this.safeString(d?.date_made || '-')
            ]),
            columnStyles: {
              0: { cellWidth: 22 },
              1: { cellWidth: 88 },
              2: { cellWidth: 40 },
              3: { cellWidth: 35 }
            }
          });
          cursorY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : cursorY + 30;
        } else {
          const decisions = decisionsRaw.map((v) => this.safeString(v)).map((s) => s.trim()).filter(Boolean);
          cursorY = this.writePdfBulletList(doc, cursorY, decisions.length ? decisions : ['-']);
        }
      }

      // Action items table
      cursorY = this.ensurePdfSpace(doc, cursorY, 22);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Action Items', 14, cursorY);
      cursorY += 4;

      const actionItems: any[] = Array.isArray(momPayload.action_items) ? momPayload.action_items : [];
      autoTable(doc, {
        startY: cursorY,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
        headStyles: { fontStyle: 'bold' },
        head: [['#', 'Description', 'Owner', 'Due Date', 'Status']],
        body: (actionItems.length ? actionItems : [{}]).map((ai, idx) => [
          this.safeString(ai?.item_number ?? idx + 1),
          this.safeString(ai?.description || ai?.item || '-'),
          this.safeString(ai?.owner || '-'),
          this.safeString(ai?.due_date || '-'),
          this.safeString(ai?.status || '-')
        ]),
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 90 },
          2: { cellWidth: 30 },
          3: { cellWidth: 30 },
          4: { cellWidth: 25 }
        }
      });

      cursorY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : cursorY + 30;

      // Metrics updates
      cursorY = this.ensurePdfSpace(doc, cursorY, 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Metrics Updates', 14, cursorY);
      cursorY += 6;
      const metricsUpdates = this.normalizeStringArray(momPayload.metrics_updates);
      if (!metricsUpdates.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('-', 14, cursorY);
        cursorY += 6;
      } else {
        cursorY = this.writePdfBulletList(doc, cursorY, metricsUpdates);
      }

      // Next steps
      cursorY = this.ensurePdfSpace(doc, cursorY, 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Next Steps', 14, cursorY);
      cursorY += 6;
      const nextSteps = this.normalizeStringArray(momPayload.next_steps);
      if (!nextSteps.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('-', 14, cursorY);
        cursorY += 6;
      } else {
        cursorY = this.writePdfBulletList(doc, cursorY, nextSteps);
      }

      // Next meeting
      cursorY = this.ensurePdfSpace(doc, cursorY, 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Next Meeting', 14, cursorY);
      cursorY += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(this.safeString(momPayload.next_meeting || '-'), 14, cursorY);
      cursorY += 8;

      // Annexes
      cursorY = this.ensurePdfSpace(doc, cursorY, 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Annexes', 14, cursorY);
      cursorY += 6;
      const annexes = this.normalizeStringArray(momPayload.annexes);
      if (!annexes.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('-', 14, cursorY);
        cursorY += 6;
      } else {
        cursorY = this.writePdfBulletList(doc, cursorY, annexes);
      }

      // Approval
      cursorY = this.ensurePdfSpace(doc, cursorY, 22);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Approval', 14, cursorY);
      cursorY += 4;
      const approval = momPayload.approval && typeof momPayload.approval === 'object' ? momPayload.approval : null;
      autoTable(doc, {
        startY: cursorY,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 140 }
        },
        body: [
          ['Prepared By', this.safeString(approval?.prepared_by || '-')],
          ['Prepared Date', this.safeString(approval?.prepared_date || '-')],
          ['Reviewed By', this.safeString(approval?.reviewed_by || '-')],
          ['Reviewed Date', this.safeString(approval?.reviewed_date || '-')]
        ]
      });
      cursorY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : cursorY + 26;

      // Distribution list
      cursorY = this.ensurePdfSpace(doc, cursorY, 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Distribution List', 14, cursorY);
      cursorY += 6;
      const distributionList = this.normalizeStringArray(momPayload.distribution_list);
      if (!distributionList.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('-', 14, cursorY);
        cursorY += 6;
      } else {
        cursorY = this.writePdfBulletList(doc, cursorY, distributionList);
      }

      // Final download
      const fileName = `${meetingId}-mom.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Failed to generate MoM PDF:', error);
    } finally {
      this.momPdfGenerating = false;
    }
  }

  hasMomPdf(): boolean {
    return !!this.extractMomPayload(this.momApiResponse);
  }

  private extractMomPayload(apiResponse: any): any | null {
    // Expected shapes:
    // 1) { status: 'success', result: { mom: {...} } }
    // 2) { status: 'success', result: { result: { mom: {...} } } }
    const root = apiResponse && typeof apiResponse === 'object' ? apiResponse : null;
    const level1 = root?.result;

    const candidate1 = level1?.mom;
    if (candidate1 && typeof candidate1 === 'object') {
      return candidate1;
    }

    const candidate2 = level1?.result?.mom;
    if (candidate2 && typeof candidate2 === 'object') {
      return candidate2;
    }

    return null;
  }

  private safeString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  private ensurePdfSpace(doc: jsPDF, cursorY: number, neededMm: number): number {
    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 12;
    if (cursorY + neededMm > pageHeight - bottomMargin) {
      doc.addPage();
      return 14;
    }
    return cursorY;
  }

  private writePdfBulletList(doc: jsPDF, cursorY: number, items: string[], title?: string): number {
    cursorY = this.ensurePdfSpace(doc, cursorY, 10);

    if (title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${title}:`, 14, cursorY);
      cursorY += 5;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const maxWidth = 180;
    for (const raw of items) {
      const text = this.safeString(raw).trim();
      if (!text) {
        continue;
      }

      const wrapped = doc.splitTextToSize(text, maxWidth);
      cursorY = this.ensurePdfSpace(doc, cursorY, wrapped.length * 5 + 2);
      doc.text('•', 16, cursorY);
      doc.text(wrapped, 20, cursorY);
      cursorY += wrapped.length * 5 + 1;
    }

    return cursorY;
  }

  private normalizeStringArray(value: any): string[] {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.safeString(v)).map((s) => s.trim()).filter(Boolean);
    }
    // Some APIs may return a single string.
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }
    return [];
  }

  async ngOnInit() {
    console.log('🎥 MeetingComponent initialized');

    this.meetingId = this.route.snapshot.paramMap.get('meetingId') || '';
    this.isHost = this.route.snapshot.queryParamMap.get('host') === 'true';

    // Get mic and cam settings from query params
    const micParam = this.route.snapshot.queryParamMap.get('mic');
    const camParam = this.route.snapshot.queryParamMap.get('cam');

    // Set initial media states
    // Default to muted/video-off when params are missing.
    // meet-now dialog passes booleans -> query params 'true'/'false'.
    this.isMuted = micParam !== 'true';
    this.isVideoOff = camParam !== 'true';
    if (camParam === null) {
      this.isVideoOff = true;
    }

    console.log('Meeting params:', {
      meetingId: this.meetingId,
      isHost: this.isHost,
      isMuted: this.isMuted,
      isVideoOff: this.isVideoOff
    });
    if (!this.meetingId) {
      this.snackBar.open('Invalid meeting ID', 'Close', { duration: 3000 });
      this.isLoading = false;
      this.cdr.markForCheck();
      return;
    }

    // Start SignalR connection in background
    console.log('Starting SignalR connection...');
    const signalrPromise = this.signalRService.startConnection(this.oisMeetUserId);

    // IMPORTANT: register SignalR listeners BEFORE any join/participant activity
    this.setupSignalRListeners();

    this.signalRService.reconnected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.ngZone.run(() => {
          this.handleSignalRReconnected();
        });
      });

    // 1. Load meeting details (this will dismiss loader as soon as metadata is ready)
    await this.loadMeetingDetails();

    // 2. Ensuring details are loaded before participants
    await this.loadExistingParticipants();

    // 3. Now wait for SignalR if it's still connecting
    try {
      await signalrPromise;
    } catch {
      // already handled in service, but we don't want to crash here
    }

    // 4. Initialize media and join the meeting
    await this.initializeMedia();

    // 5. LiveKit
    await this.initializeLivekit();

    if (!this.livekitActive) {
      this.scheduleConnectToKnownParticipants();
    }

    this.startTimer();
    this.cdr.markForCheck();
  }

  private async handleSignalRReconnected(): Promise<void> {
    if (!this.meetingId || !this.oisMeetUserId) {
      return;
    }

    console.log('Reconnected: re-joining meeting and rebuilding peers');

    // Update our connectionId and reset peer state.
    this.connectionId = this.signalRService.getConnectionId();

    if (!this.livekitActive) {
      // Tear down existing peers and remote media elements (connectionIds may have changed).
      const peerIds = Array.from(this.peers.keys());
      peerIds.forEach((id) => this.cleanupPeer(id, true));
      this.peers.clear();
      this.pendingSignals.clear();
    }

    // Re-join the meeting group so we receive CurrentParticipants again.
    const startWithAudio = !this.isMuted;
    const startWithVideo = !this.isVideoOff;
    await this.signalRService.joinMeeting(
      this.meetingId,
      this.oisMeetUserId,
      this.userFullName,
      startWithAudio,
      startWithVideo
    );

    // The hub will send CurrentParticipants; with mesh we connect peers after we receive it.
    if (!this.livekitActive) {
      this.scheduleConnectToKnownParticipants();
    }
  }

  // New method to load participants via REST API
  private async loadExistingParticipants() {
    try {
      console.log('Loading existing participants via API for meeting:', this.meetingId);
      const response: any = await this.meetingService.getMeetingParticipants(this.meetingId).toPromise();

      if (response.success && response.data) {
        console.log('📋 Existing participants from API:', response.data);

        // Map API response correctly to MeetingParticipant format.
        // IMPORTANT: p.id here is the DB record id, NOT the SignalR connectionId.
        // Leave connectionId blank so the real SignalR connectionId (sent via
        // CurrentParticipants immediately after joinMeeting) can be assigned later.
        const participants: MeetingParticipant[] = response.data.map((p: any) => ({
          connectionId: '',          // Will be updated when SignalR CurrentParticipants fires
          userId: p.userId,
          userName: p.userName,
          isAudioEnabled: !p.isMuted,   // API: isMuted=true → not enabled
          isVideoEnabled: !p.isVideoOff, // API: isVideoOff=true → not enabled
          isScreenSharing: false
        }));

        console.log('Converted participants:', participants.map(p => ({
          name: p.userName,
          isAudioEnabled: p.isAudioEnabled,
          isMuted: !p.isAudioEnabled
        })));

        // FILTER OUT the current user from participants list
        const filteredParticipants = participants.filter(p => p.userId !== this.oisMeetUserId);

        console.log('Filtered participants (excluding current user):',
          filteredParticipants.map(p => ({
            name: p.userName,
            isAudioEnabled: p.isAudioEnabled,
            isMuted: !p.isAudioEnabled
          })));

        // Batch-add all participants in one zone run to avoid multiple CD cycles
        this.ngZone.run(() => {
          this.participants = [];
          const batch: Participant[] = [];
          filteredParticipants.forEach(p => {
            if (p.userId === this.oisMeetUserId) return;
            const existing = batch.find(x => x.id === p.userId);
            if (!existing) {
              const np: Participant = {
                connectionId: '',    // Real connectionId comes from SignalR CurrentParticipants
                id: p.userId,
                name: p.userName,
                isMuted: !p.isAudioEnabled,
                isVideoOff: !p.isVideoEnabled,
                isScreenSharing: p.isScreenSharing,
                isHost: p.userId === this.meetingDetails?.hostId,
                isSpeaking: false,
                avatarColor: this.getRandomColor(p.userId)
              };
              batch.push(np);
              // Do NOT register into participantByConnectionId yet — connectionId is blank.
            }
          });
          this.participants = batch;
          this.cdr.markForCheck();
          console.log('Participants after API load:', this.participants.map(p => ({
            name: p.name,
            isMuted: p.isMuted
          })));
        });
      }
    } catch (error) {
      console.error('Error loading existing participants:', error);
    }
  }

  ngAfterViewInit() {
    this.pendingTooltipInitTimeout = setTimeout(() => {
      this.pendingTooltipInitTimeout = null;
      this.initializeTooltips();
    }, 500);
  }

  ngOnDestroy() {
    if (this.isDestroying) {
      return;
    }

    console.log('Destroying meeting component');
    this.isDestroying = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.performComponentCleanup(true);
    return;

    this.stopTimer();
    this.tooltips.forEach(t => t.dispose());

    if (this.mediaStream) {
      this.mediaStream?.getTracks().forEach(track => track.stop());
    }
    if (this.screenStream) {
      this.screenStream?.getTracks().forEach(track => track.stop());
    }

    this.peers.forEach(peer => peer.destroy());
    this.peers.clear();

    this.remoteVideoElements.forEach(video => video.remove());
    this.remoteVideoElements.clear();

    if (this.meetingId && this.oisMeetUserId) {
      this.signalRService.leaveMeeting(this.meetingId, this.oisMeetUserId);
    }

    // LiveKit media cleanup
    this.livekitService.disconnect();
    // ── Live Transcription teardown  ──────────────────────────────────
    if (this.liveTranscriptionIsHost && this.isLiveTranscriptionOn) {
      this.signalRService.notifyLiveTranscriptionStopped(this.meetingId).catch(() => { });
    }
    this.liveTranscriptionService.stop();
    this.signalRService.stopConnection();
  }

  private async initializeLivekit(): Promise<void> {
    if (!this.livekitEnabled || this.livekitActive) {
      return;
    }

    const livekitUrl = String((environment as any)?.livekitUrl ?? '').trim();
    if (!livekitUrl) {
      console.warn('LiveKit is enabled, but environment.livekitUrl is empty. Falling back to mesh WebRTC.');
      return;
    }

    if (!this.meetingId || !this.oisMeetUserId) {
      return;
    }

    // IMPORTANT: subscribe to LiveKit events BEFORE connecting.
    // Otherwise, if a participant is already in the room, TrackSubscribed can fire during connect
    // and we would miss it (result: LiveKit connected but no remote audio attached).
    this.initializeLivekitSubscriptions();

    try {
      this.livekitInitializing = true;
      const tokenResponse: any = await this.meetingService
        .getLivekitToken(this.meetingId, this.oisMeetUserId, this.userFullName)
        .toPromise();

      const token = tokenResponse?.token || tokenResponse?.data?.token || tokenResponse?.data;
      if (!token || typeof token !== 'string') {
        console.error('LiveKit token response missing token', tokenResponse);
        return;
      }

      await this.livekitService.connect(livekitUrl, token);

      // Once connected, we consider LiveKit the active media path.
      this.livekitActive = true;

      // Always publish mic track so remote participants can receive audio.
      // Then apply the initial mute state (setMicrophoneMuted skips publish when muted=true,
      // so we publish explicitly first then mute if needed).
      const localAudioTrack = this.mediaStream?.getAudioTracks()?.[0] ?? null;
      if (localAudioTrack) {
        try {
          await this.livekitService.publishMicrophoneTrack(localAudioTrack);
        } catch (pubErr) {
          console.error('Failed to publish mic to LiveKit:', pubErr);
        }
        if (this.isMuted) {
          try {
            await this.livekitService.setMicrophoneMuted(true, localAudioTrack);
          } catch (muteErr) {
            console.error('Failed to apply initial mute state in LiveKit:', muteErr);
          }
        }
      }

      // Publish camera track if video is enabled
      const localVideoTrack = this.mediaStream?.getVideoTracks()
        .find(t => t.readyState === 'live') ?? null;
      if (localVideoTrack && !this.isVideoOff) {
        try {
          await this.livekitService.publishCameraTrack(localVideoTrack);
        } catch (camErr) {
          console.error('Failed to publish camera to LiveKit:', camErr);
        }
      }

      console.log('✅ LiveKit connected');
    } catch (e) {
      console.error('Failed to initialize LiveKit:', e);

      // LiveKit failed; keep using mesh.
      this.livekitActive = false;
      // If signals arrived while we were trying LiveKit, start mesh peers now.
      this.scheduleConnectToKnownParticipants();
      for (const id of Array.from(this.pendingSignals.keys())) {
        this.flushPendingSignals(id);
      }
    } finally {
      this.livekitInitializing = false;
    }
  }

  private initializeLivekitSubscriptions(): void {
    if (this.livekitSubscriptionsInitialized) {
      return;
    }
    this.livekitSubscriptionsInitialized = true;

    this.livekitService.remoteAudioAdded$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt) => this.ngZone.run(() => this.attachLivekitRemoteAudio(evt.identity, evt.trackSid, evt.mediaStreamTrack)));

    this.livekitService.remoteAudioRemoved$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt) => this.ngZone.run(() => this.detachLivekitRemoteAudio(evt.trackSid)));

    // ── Remote camera video ──────────────────────────────────────────────────
    this.livekitService.remoteVideoAdded$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt) => this.ngZone.run(() =>
        this.attachLivekitRemoteVideo(evt.identity, evt.trackSid, evt.mediaStreamTrack)));

    this.livekitService.remoteVideoRemoved$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt) => this.ngZone.run(() =>
        this.detachLivekitRemoteVideo(evt.trackSid)));
    // ────────────────────────────────────────────────────────────────────────

    this.livekitService.screenShareStarted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt) => this.ngZone.run(() => this.attachRemoteScreenShare(evt.name, evt.trackSid, evt.mediaStreamTrack)));

    this.livekitService.screenShareStopped$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt) => this.ngZone.run(() => this.detachRemoteScreenShare(evt.trackSid)));
  }

  private attachLivekitRemoteAudio(identity: string, trackSid: string, mediaStreamTrack: MediaStreamTrack): void {
    if (!identity || identity === this.oisMeetUserId) {
      return;
    }

    if (trackSid) {
      this.livekitAudioTrackSidToIdentity.set(trackSid, identity);
    }

    // If the participant is not yet in the array, buffer the audio track.
    // The audio element itself can be created immediately for playback,
    // but we store in pending so addParticipant() can also register the stream for recording.
    const participantExists = this.participants.some(p => p.id === identity);
    if (!participantExists) {
      console.warn(`LiveKit remote audio: participant not found for identity "${identity}" — buffering audio track.`);
      this.pendingLivekitAudioTracks.set(identity, { trackSid, mediaStreamTrack });
      // Still create the audio element so playback starts immediately without waiting.
    }

    const stream = new MediaStream([mediaStreamTrack]);
    this.remoteAudioStreams.set(identity, stream);
    this.audioRecorderService.addRemoteStream(identity, stream);

    const audioId = `remote-audio-${identity}`;
    let audioEl = document.getElementById(audioId) as HTMLAudioElement | null;
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = audioId;
      audioEl.autoplay = true;
      audioEl.controls = false;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.setAttribute('webkit-playsinline', 'true');
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
    }

    audioEl.srcObject = stream;
    audioEl.muted = false;
    audioEl.volume = 1.0;

    audioEl.onloadedmetadata = () => {
      audioEl?.play().catch((err) => {
        console.warn('LiveKit remote audio play() failed:', err);
      });
    };

    audioEl.play().catch((err) => {
      console.warn('LiveKit remote audio play() failed (immediate):', err);
    });
  }

  private detachLivekitRemoteAudio(trackSid: string): void {
    const identity = this.livekitAudioTrackSidToIdentity.get(trackSid);
    if (!identity) {
      return;
    }

    this.livekitAudioTrackSidToIdentity.delete(trackSid);

    this.remoteAudioStreams.delete(identity);
    this.audioRecorderService.removeRemoteStream(identity);

    const audioEl = document.getElementById(`remote-audio-${identity}`) as HTMLAudioElement | null;
    if (audioEl) {
      try {
        audioEl.pause();
      } catch {
        // ignore
      }
      audioEl.srcObject = null;
      audioEl.remove();
    }
  }

  /** Attach a remote camera video track received from LiveKit. */
  private attachLivekitRemoteVideo(identity: string, trackSid: string, mediaStreamTrack: MediaStreamTrack): void {
    if (!identity || identity === this.oisMeetUserId) {
      return;
    }

    if (trackSid) {
      this.livekitVideoTrackSidToIdentity.set(trackSid, identity);
    }

    // Find participant by identity (which equals the remote participant's userId)
    const participant = this.participants.find(p => p.id === identity);
    if (!participant) {
      // Participant not yet in the array (SignalR participantJoined$ hasn't fired yet).
      // Buffer the track so it can be applied as soon as the participant is added.
      console.warn(`LiveKit remote video: participant not found for identity "${identity}" — buffering track for later.`);
      this.pendingLivekitVideoTracks.set(identity, { trackSid, mediaStreamTrack });
      return;
    }

    this._applyLivekitVideoToParticipant(participant, mediaStreamTrack);
  }

  /** Internal: write the video track into a participant's MediaStream and trigger CD. */
  private _applyLivekitVideoToParticipant(participant: any, mediaStreamTrack: MediaStreamTrack): void {
    if (!participant.stream) {
      participant.stream = new MediaStream([mediaStreamTrack]);
    } else {
      // Remove any stale video tracks and add the fresh one
      participant.stream.getVideoTracks().forEach((t: MediaStreamTrack) => participant.stream!.removeTrack(t));
      participant.stream.addTrack(mediaStreamTrack);
    }
    participant.isVideoOff = false;
    this.participants = [...this.participants];
    this.cdr.markForCheck();
  }

  /** Remove a remote camera video track when LiveKit unsubscribes it. */
  private detachLivekitRemoteVideo(trackSid: string): void {
    const identity = this.livekitVideoTrackSidToIdentity.get(trackSid);
    if (!identity) {
      return;
    }

    this.livekitVideoTrackSidToIdentity.delete(trackSid);

    const participant = this.participants.find(p => p.id === identity);
    if (!participant) {
      return;
    }

    if (participant.stream) {
      participant.stream.getVideoTracks().forEach(t => participant.stream!.removeTrack(t));
      if (participant.stream.getTracks().length === 0) {
        participant.stream = undefined;
      }
    }

    participant.isVideoOff = true;
    this.participants = [...this.participants];
    this.cdr.markForCheck();
  }

  private attachRemoteScreenShare(ownerName: string, trackSid: string, mediaStreamTrack: MediaStreamTrack): void {
    // If we are locally sharing, prefer showing our own preview.
    if (this.isScreenSharing) {
      return;
    }

    this.isRemoteScreenSharing = true;
    this.screenShareOwnerName = ownerName || 'Screen';
    this.remoteLivekitScreenShareTrackSid = trackSid;
    this.cdr.detectChanges(); // render screen-share-stage so #screenShareVideo is in DOM

    const stream = new MediaStream([mediaStreamTrack]);
    if (this.screenShareVideo) {
      this.screenShareVideo.nativeElement.srcObject = stream;
    }
    this.cdr.markForCheck();
  }

  private detachRemoteScreenShare(trackSid: string): void {
    if (!this.remoteLivekitScreenShareTrackSid || this.remoteLivekitScreenShareTrackSid !== trackSid) {

      this.remoteLivekitScreenShareTrackSid = null;
      this.isRemoteScreenSharing = false;
      this.screenShareOwnerName = 'Your Screen';

      if (this.screenShareVideo) {
        this.screenShareVideo.nativeElement.srcObject = null;
      }
    }
  }

  private async loadMeetingDetails() {
    this.isLoading = true;
    try {
      console.log('Loading meeting details for:', this.meetingId);
      const response: any = await this.meetingService.getMeeting(this.meetingId).toPromise();
      console.log('Meeting details response:', response);

      if (response.success) {
        this.meetingDetails = response.data;
        this.meetingTopic = this.meetingDetails?.topic || 'OIS Meet Session';
        this.displayMeetingId = this.meetingDetails?.meetingId || this.meetingId;
        this.cdr.markForCheck();
      }
    } catch (error) {
      console.error('Error loading meeting:', error);
      this.snackBar.open('Error loading meeting details', 'Close', { duration: 3000 });
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async initializeMedia() {
    try {
      const settings = this.settingsService.currentSettings;
      const audioConstraints: any = {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        channelCount: { ideal: 1 },   // mono is more effective for voice NS
        latency: { ideal: 0 },   // minimise buffering delay
        sampleRate: { ideal: 48000 }
      };

      if (settings.preferredAudioInputId && settings.preferredAudioInputId !== 'default') {
        audioConstraints.deviceId = { exact: settings.preferredAudioInputId };
      }

      const videoConstraints: any = !this.isVideoOff ? {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      } : false;

      if (videoConstraints && settings.preferredVideoInputId && settings.preferredVideoInputId !== 'default') {
        videoConstraints.deviceId = { exact: settings.preferredVideoInputId };
      }

      console.log('Requesting getUserMedia with constraints:', { audio: audioConstraints, video: videoConstraints });
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: videoConstraints
      });
      console.log('Got raw media stream with tracks:', rawStream.getTracks().length);

      // ── Apply Web Audio noise-suppression pipeline to the microphone track
      // The browser NS constraint is a hint; our DSP chain adds a second layer:
      //   highpass filter (cuts sub-100Hz rumble) → dynamics compressor
      //   (squashes sudden loud ambient bursts) → noise gate gain (silences
      //   anything below the voice-activity threshold).
      const { processedStream, audioContext } = this.buildNoiseSuppressedStream(rawStream);
      this.noiseSuppressionContext = audioContext;
      this.processedMicStream = processedStream;

      // Merge the processed audio track with the original video track(s).
      const videoTracks = rawStream.getVideoTracks();
      const processedAudioTracks = processedStream ? processedStream.getAudioTracks() : rawStream.getAudioTracks();
      this.mediaStream = new MediaStream([...processedAudioTracks, ...videoTracks]);
      console.log('Media stream with NS pipeline:', this.mediaStream.getTracks().length, 'tracks');

      const startWithAudio = !this.isMuted;
      const startWithVideo = !this.isVideoOff;

      this.mediaStream.getAudioTracks().forEach(track => {
        track.enabled = startWithAudio;
      });

      this.mediaStream.getVideoTracks().forEach(track => {
        track.enabled = startWithVideo;
      });

      // Bind to local video element (muted so it does not echo).
      if (this.localVideo) {
        this.localVideo.nativeElement.muted = true;
        this.localVideo.nativeElement.volume = 0;
        this.localVideo.nativeElement.srcObject = this.mediaStream;
      }

      await this.signalRService.joinMeeting(
        this.meetingId,
        this.oisMeetUserId,
        this.userFullName,
        startWithAudio,
        startWithVideo
      );
      this.connectionId = this.signalRService.getConnectionId();

      // Start local speaking detection
      this.setupSpeakingDetection(this.connectionId!, this.mediaStream, true);
    } catch (err) {
      console.error('Error initializing media:', err);
      // Fallback join with no media
      await this.signalRService.joinMeeting(
        this.meetingId,
        this.oisMeetUserId,
        this.userFullName,
        false,
        false
      );
    }
  }

  checkParticipants() {
    console.log('=== PARTICIPANTS LIST ===');
    this.participants.forEach(p => {
      console.log(`- ${p.name} (ID: ${p.id}, Host: ${p.isHost})`);
    });
    console.log('=========================');
  }
  private setupSignalRListeners() {
    if (this.signalRListenersInitialized) {
      return;
    }

    this.signalRListenersInitialized = true;
    console.log('Setting up SignalR listeners');

    // Handle current participants list (sent immediately after joining)
    this.signalRService.currentParticipants$.pipe(takeUntil(this.destroy$)).subscribe((participants: MeetingParticipant[]) => {
      console.log('📋 SignalR current participants received:', participants.length);
      this.ngZone.run(() => {
        // Filter out current user
        const filteredParticipants = participants.filter(p => p.userId !== this.oisMeetUserId);

        filteredParticipants.forEach(p => {
          // Check if participant already exists
          const existingParticipant = this.participants.find(
            existing => existing.id === p.userId
          );

          if (!existingParticipant) {
            console.log('Adding new participant from SignalR:', p.userName,
              'AudioEnabled:', p.isAudioEnabled,
              'VideoEnabled:', p.isVideoEnabled);
            this.addParticipant(p);
          } else {
            // Update ALL properties
            this.registerParticipantConnection(existingParticipant, p.connectionId);
            existingParticipant.isMuted = !p.isAudioEnabled;
            existingParticipant.isVideoOff = !p.isVideoEnabled;
            existingParticipant.isScreenSharing = p.isScreenSharing;

            // Flush any buffered LiveKit tracks now that we have a real connectionId.
            this._flushPendingLivekitTracks(p.userId, existingParticipant);

            console.log('🔄 Updated participant from current list:', existingParticipant.name,
              'Muted:', existingParticipant.isMuted,
              'VideoOff:', existingParticipant.isVideoOff);
          }
        });

        // Force change detection
        this.participants = [...this.participants];

        if (!this.livekitActive && !this.livekitInitializing) {
          // Ensure we establish peers for any participants we should initiate with.
          this.scheduleConnectToKnownParticipants();
        }
      });
    });

    // Handle new participant joining
    this.signalRService.participantJoined$.pipe(takeUntil(this.destroy$)).subscribe((participant: MeetingParticipant) => {
      console.log('👤 SignalR participant joined:', participant);
      this.ngZone.run(() => {
        // Don't add self
        if (participant.userId === this.oisMeetUserId) {
          console.log('Skipping self from participant joined event');
          return;
        }

        // Check if participant already exists
        const existingParticipant = this.participants.find(
          p => p.id === participant.userId
        );

        if (!existingParticipant) {
          // New participant, add them
          this.addParticipant(participant);

          console.log('✅ New participant added:', participant.userName,
            'Muted:', !participant.isAudioEnabled,
            'VideoOff:', !participant.isVideoEnabled);

          if (!this.livekitActive && !this.livekitInitializing) {
            // Create peer for this new participant
            if (participant.connectionId !== this.connectionId && this.mediaStream) {
              const initiator = this.shouldInitiatePeer(participant.connectionId);
              console.log('Peer initiation decision for new participant:', participant.userName, { initiator });

              if (initiator) {
                setTimeout(() => {
                  this.createPeer(participant.connectionId, participant.userName, true);
                }, 600);
              }
            }
          }

          this.snackBar.open(`${participant.userName} joined`, 'Close', {
            duration: 2000,
            verticalPosition: 'bottom'
          });
        } else {
          // Update existing participant's connectionId and media states
          this.registerParticipantConnection(existingParticipant, participant.connectionId);
          existingParticipant.isMuted = !participant.isAudioEnabled;
          existingParticipant.isVideoOff = !participant.isVideoEnabled;

          // Force change detection
          this.participants = [...this.participants];

          console.log('🔄 Updated existing participant:', existingParticipant.name,
            'Muted:', existingParticipant.isMuted,
            'VideoOff:', existingParticipant.isVideoOff);
        }
      });
      // if (this.liveTranscriptionService.isHostMode) {

      //   const tryAddAudio = (key: string) => {
      //     const audioEl = document.getElementById(`remote-audio-${key}`) as HTMLAudioElement | null;

      //     if (audioEl?.srcObject) {
      //       this.liveTranscriptionService.addRemoteStream(key, audioEl.srcObject as MediaStream);
      //     }
      //   };
      //   setTimeout(() => {
      //     tryAddAudio(participant.userId);
      //     tryAddAudio(participant.connectionId);
      //   }, 800);

      // }
    });

    // Handle participant leaving
    this.signalRService.participantLeft$.pipe(takeUntil(this.destroy$)).subscribe(({ connectionId, userId }) => {
      console.log('👋 Participant left:', connectionId);
      this.ngZone.run(() => {
        const participant = this.participants.find(p => p.connectionId === connectionId);
        if (participant) {
          this.snackBar.open(`${participant.name} left`, 'Close', {
            duration: 2000,
            verticalPosition: 'bottom'
          });
        }
        this.removeParticipant(connectionId);
        if (!this.livekitActive) {
          this.removePeer(connectionId);
        }
      });

      // if (this.liveTranscriptionService.isHostMode) {
      //   this.liveTranscriptionService.removeRemoteStream(connectionId);
      //   const p = this.participants.find(x => x.connectionId === connectionId);
      //   if (p) this.liveTranscriptionService.removeRemoteStream(p.id);
      // }
    });

    this.signalRService.participantDisconnected$.pipe(takeUntil(this.destroy$)).subscribe(({ connectionId, userId }) => {
      console.log('🔌 Participant disconnected:', connectionId);
      this.ngZone.run(() => {
        this.removeParticipant(connectionId);
        if (!this.livekitActive) {
          this.removePeer(connectionId);
        }
      });
    });

    // WebRTC signaling
    this.signalRService.receiveOffer$.pipe(takeUntil(this.destroy$)).subscribe(({ fromConnectionId, offer }) => {
      console.log('📞 Received offer from:', fromConnectionId);
      this.ngZone.run(() => {
        this.handleOffer(fromConnectionId, offer);
      });
    });

    this.signalRService.receiveAnswer$.pipe(takeUntil(this.destroy$)).subscribe(({ fromConnectionId, answer }) => {
      console.log('📞 Received answer from:', fromConnectionId);
      this.ngZone.run(() => {
        this.handleAnswer(fromConnectionId, answer);
      });
    });

    this.signalRService.receiveIceCandidate$.pipe(takeUntil(this.destroy$)).subscribe(({ fromConnectionId, candidate }) => {
      console.log('🧊 Received ICE candidate from:', fromConnectionId);
      this.ngZone.run(() => {
        this.handleIceCandidate(fromConnectionId, candidate);
      });
    });

    // Media toggles
    this.signalRService.audioToggled$.pipe(takeUntil(this.destroy$)).subscribe(({ connectionId, userId, isEnabled }) => {
      console.log('🔊 Audio toggled:', { connectionId, userId, isEnabled });
      this.ngZone.run(() => {
        // Find participant by connectionId OR userId
        let participant = this.participants.find(p => p.connectionId === connectionId);

        if (!participant) {
          participant = this.participants.find(p => p.id === userId);
        }

        if (participant) {
          // CRITICAL: isEnabled = true means audio is ON, so isMuted = false
          participant.isMuted = !isEnabled;

          // Force change detection
          this.participants = [...this.participants];

          console.log(`✅ Updated ${participant.name} mute status:`,
            'isMuted:', participant.isMuted,
            'from isEnabled:', isEnabled);
        } else {
          console.log('Participant not found for audio toggle:', connectionId, userId);
        }
      });
    });

    this.signalRService.videoToggled$.pipe(takeUntil(this.destroy$)).subscribe(({ connectionId, userId, isEnabled }) => {
      console.log('📹 Video toggled:', { connectionId, userId, isEnabled });
      this.ngZone.run(() => {
        // Find participant by connectionId OR userId
        let participant = this.participants.find(p => p.connectionId === connectionId);

        if (!participant) {
          participant = this.participants.find(p => p.id === userId);
        }

        if (participant) {
          // CRITICAL: isEnabled = true means video is ON, so isVideoOff = false
          participant.isVideoOff = !isEnabled;

          // Force change detection
          this.participants = [...this.participants];

          console.log(`✅ Updated ${participant.name} video status:`,
            'isVideoOff:', participant.isVideoOff,
            'from isEnabled:', isEnabled);
        } else {
          console.log('Participant not found for video toggle:', connectionId, userId);
        }
      });
    });

    // Screen sharing
    this.signalRService.screenShareStarted$.pipe(takeUntil(this.destroy$)).subscribe(({ connectionId, userId }) => {
      console.log('🖥️ Screen share started by:', userId);
    });

    this.signalRService.screenShareStopped$.pipe(takeUntil(this.destroy$)).subscribe(({ connectionId, userId }) => {
      console.log('🖥️ Screen share stopped by:', userId);
    });

    // Chat messages
    this.signalRService.meetingMessageReceived$.pipe(takeUntil(this.destroy$)).subscribe((data: any) => {
      console.log('💬 Chat message received:', data);
      this.ngZone.run(() => {
        // Skip messages from self
        if (data.userId === this.oisMeetUserId) {
          console.log('Skipping own message');
          return;
        }

        const messageId = this.getChatMessageId(data);
        if (this.processedMessageIds.has(messageId)) {
          return;
        }
        this.processedMessageIds.add(messageId);

        // Add message to chat (only for other users)
        this.chatMessages.push({
          id: messageId,
          sender: data.userName,
          senderId: data.userId,
          message: data.message,
          timestamp: new Date(data.timestamp),
          isMe: false
        });
        this.scrollChatToBottom();

        // NOTIFICATION: Show in-app notification if chat is not open
        if (!this.showChat) {
          this.snackBar.open(`${data.userName}: ${data.message.substring(0, 30)}${data.message.length > 30 ? '...' : ''}`, 'View', {
            duration: 4000,
            verticalPosition: 'top',
            panelClass: ['chat-notification']
          }).onAction().subscribe(() => {
            this.showChat = true;
            this.showParticipants = false;
          });

          // BACKGROUND NOTIFICATION
          this.showBrowserNotification(data.userName, data.message);
        }
      });
    });

    // Meeting ended
    this.signalRService.meetingEnded$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      console.log('🏁 Meeting ended by host');
      this.ngZone.run(() => {
        this.snackBar.open('Meeting ended by host', 'Close', { duration: 5000 });
        // setTimeout(() => this.router.navigate(['/chat']), 3000);
        if (this.meetingEndedCloseTimeout) {
          clearTimeout(this.meetingEndedCloseTimeout);
        }
        this.meetingEndedCloseTimeout = setTimeout(() => {
          this.meetingEndedCloseTimeout = null;
          this.closeMeetingWindow();
        }, 3000);
      });
    });

    // Transcription & MoM broadcasts (generated by host; visible to all)
    this.signalRService.transcriptionAvailable$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt: any) => {
        this.ngZone.run(() => {
          const t = (evt?.transcription ?? evt?.Transcription) as TranscriptionResponse | undefined;
          if (!t) {
            return;
          }

          if (t.filename) {
            this.transcriptionFileName = t.filename;
          }

          if (Array.isArray(t.result)) {
            this.transcriptionLoading = false;
            this.transcriptionError = null;
            this.transcriptionSegments = t.result;
          }
        });
      });

    this.signalRService.momAvailable$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt: any) => {
        this.ngZone.run(() => {
          const mom = evt?.mom ?? evt?.Mom;
          if (!mom) {
            return;
          }
          this.momApiResponse = mom;
        });
      });

    // ── Live Transcription SignalR events ──────────────────────────────────────

    // Another participant started live transcription → become a subscriber
    this.signalRService.liveTranscriptionStarted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (evt: any) => {
        await this.ngZone.run(async () => {
          // Only react if WE are not the host (host already started locally)
          if (!this.liveTranscriptionService.isSessionHost) {
            this.isLiveTranscriptionOn = true;
            this.liveTranscriptionIsHost = false;
            this.showLiveTranscriptionPanel = true;
            this.liveTranscriptionError = null;

            // ── Every non-host participant starts their OWN mic capture ───────
            await this.startOwnLiveTranscription(false);

            this.snackBar.open(
              `${evt.fromUserName || 'A participant'} started live transcription`,
              'Close',
              { duration: 3000, verticalPosition: 'bottom' }
            );
          }
        });
      });


    // Host stopped → if we're a subscriber, mark as stopped
    this.signalRService.liveTranscriptionStopped$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.ngZone.run(() => {
          if (!this.liveTranscriptionIsHost) {
            // Viewers: session ended → stop own capture and close panel
            this.isLiveTranscriptionOn = false;
            this.showLiveTranscriptionPanel = false;
            this.liveTranscriptionService.stop();
            this.snackBar.open('Live transcription ended', 'Close',
              { duration: 2500, verticalPosition: 'bottom' });
          }
        });
      });

    // Receive a live transcription segment broadcast by the host machine
    this.signalRService.liveTranscriptionSegment$
      .pipe(takeUntil(this.destroy$))
      .subscribe((evt: any) => {
        this.ngZone.run(() => {
          // Every participant receives OTHER participants' segments here.
          // Own segments are displayed locally without a round-trip.
          if (Array.isArray(evt?.segments)) {
            (evt.segments as any[]).forEach((seg: any) =>
              this.liveTranscriptionService.receiveRemoteSegment(seg)
            );
          }
        });
      });
    // ──────────────────────────────────────────────────────────────────────────
  }

  private addParticipant(participant: MeetingParticipant) {
    // Prevent adding current user
    if (participant.userId === this.oisMeetUserId || participant.connectionId === this.connectionId) {
      console.log('Skipping self from addParticipant');
      return;
    }

    // Check if participant already exists
    const existingParticipant = this.participants.find(
      p => p.id === participant.userId
    );

    if (!existingParticipant) {
      const newParticipant = {
        connectionId: participant.connectionId,
        id: participant.userId,
        name: participant.userName,
        isMuted: !participant.isAudioEnabled,  // CRITICAL: Convert isAudioEnabled to isMuted
        isVideoOff: !participant.isVideoEnabled, // CRITICAL: Convert isVideoEnabled to isVideoOff
        isScreenSharing: participant.isScreenSharing,
        isHost: participant.userId === this.meetingDetails?.hostId,
        isSpeaking: false,
        avatarColor: this.getRandomColor(participant.userId)
      };

      this.participants = [...this.participants, newParticipant];
      this.registerParticipantConnection(newParticipant, participant.connectionId);
      this.cdr.markForCheck();
      console.log('✅ Added participant:', newParticipant.name,
        'Muted:', newParticipant.isMuted,
        'VideoOff:', newParticipant.isVideoOff,
        'Host:', newParticipant.isHost);

      // Flush any LiveKit tracks that arrived before this participant was registered.
      this._flushPendingLivekitTracks(participant.userId, newParticipant);
    } else {
      // Update existing participant's media states
      this.registerParticipantConnection(existingParticipant, participant.connectionId);
      existingParticipant.isMuted = !participant.isAudioEnabled;
      existingParticipant.isVideoOff = !participant.isVideoEnabled;
      existingParticipant.isHost = participant.userId === this.meetingDetails?.hostId;

      // Force change detection
      this.participants = [...this.participants];

      console.log('🔄 Updated participant:', existingParticipant.name,
        'Muted:', existingParticipant.isMuted,
        'VideoOff:', existingParticipant.isVideoOff,
        'Host:', existingParticipant.isHost);
    }
  }

  /** Apply any LiveKit tracks that arrived before the participant object was created. */
  private _flushPendingLivekitTracks(userId: string, participant: any): void {
    const pendingVideo = this.pendingLivekitVideoTracks.get(userId);
    if (pendingVideo) {
      this.pendingLivekitVideoTracks.delete(userId);
      console.log('Flushing buffered LiveKit video track for:', participant.name);
      this._applyLivekitVideoToParticipant(participant, pendingVideo.mediaStreamTrack);
    }

    const pendingAudio = this.pendingLivekitAudioTracks.get(userId);
    if (pendingAudio) {
      this.pendingLivekitAudioTracks.delete(userId);
      console.log('Flushing buffered LiveKit audio track for:', participant.name);
      // Re-register the recording stream now that the participant exists.
      const stream = this.remoteAudioStreams.get(userId);
      if (stream) {
        this.audioRecorderService.addRemoteStream(userId, stream);
      }
    }
  }

  removeParticipant(connectionId: string) {
    this.participantByConnectionId.delete(connectionId);
    this.stopSpeakingDetection(connectionId);
    this.participants = this.participants.filter(
      p => p.connectionId !== connectionId && p.id !== connectionId
    );
    this.cdr.markForCheck();
    console.log('Participants after removal:', this.participants.length);
  }

  private createPeer(targetConnectionId: string, targetName: string, initiator: boolean) {
    if (this.livekitActive || (this.livekitEnabled && this.livekitInitializing)) {
      return;
    }
    if (this.peers.has(targetConnectionId)) {
      console.log('Peer already exists for:', targetName);
      return;
    }

    if (!this.mediaStream) {
      console.log('No media stream available, waiting...');
      // Wait for media stream and try again
      setTimeout(() => {
        if (this.mediaStream) {
          this.createPeer(targetConnectionId, targetName, initiator);
        }
      }, 1000);
      return;
    }

    console.log(`Creating ${initiator ? 'initiator' : 'receiver'} peer for:`, targetName);

    try {
      const iceServers = (environment as any)?.webrtcIceServers ?? [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ];
      const trickle = (environment as any)?.webrtcTrickleIce ?? true;

      const peer = new SimplePeer({
        initiator: initiator,
        trickle,
        stream: this.mediaStream,
        config: {
          iceServers
        }
      });

      peer.on('signal', (signal: any) => {
        // With trickle enabled, `signal` can be offer/answer OR ICE candidate.
        if (!signal) {
          return;
        }

        if (signal.type === 'offer') {
          console.log('Peer offer generated for:', targetName);
          this.signalRService.sendOffer(this.meetingId, targetConnectionId, signal);
          return;
        }

        if (signal.type === 'answer') {
          console.log('Peer answer generated for:', targetName);
          this.signalRService.sendAnswer(this.meetingId, targetConnectionId, signal);
          return;
        }

        // Candidate or other signal data
        this.signalRService.sendIceCandidate(this.meetingId, targetConnectionId, signal);
      });

      peer.on('stream', (stream: MediaStream) => {
        console.log('Received stream from:', targetName);
        this.addRemoteVideo(targetConnectionId, stream, targetName);
      });

      peer.on('error', (err: Error) => {
        console.error('Peer error for', targetName, ':', err);

        // If ICE fails, clean up and try a single restart for initiators.
        const message = (err as any)?.message ? String((err as any).message) : '';
        const isConnectionFailed = message.toLowerCase().includes('connection failed');

        this.cleanupPeer(targetConnectionId, false);

        if (initiator && isConnectionFailed) {
          this.schedulePeerRestart(targetConnectionId, targetName);
        }
      });

      peer.on('connect', () => {
        console.log('Peer connected to:', targetName);
      });

      peer.on('close', () => {
        console.log('Peer closed for:', targetName);
        this.cleanupPeer(targetConnectionId, false);
      });

      this.peers.set(targetConnectionId, peer);
      console.log('Peer created and stored for:', targetName);

      // Apply any queued offer/answer/candidates that arrived early.
      this.flushPendingSignals(targetConnectionId);

    } catch (error) {
      console.error('Error creating peer:', error);
    }
  }

  private handleOffer(fromConnectionId: string, offer: any) {
    // If LiveKit is active (or we're attempting it), keep signals queued so we can fall back to mesh if needed.
    if (this.livekitActive || (this.livekitEnabled && this.livekitInitializing)) {
      this.queueSignal(fromConnectionId, offer);
      return;
    }
    console.log('Handling offer from:', fromConnectionId);

    // Queue offer in case peer creation is delayed.
    this.queueSignal(fromConnectionId, offer);

    // Check if we already have this participant
    let participant = this.participants.find(p => p.connectionId === fromConnectionId);

    if (participant) {
      console.log('Found participant immediately:', participant.name);

      if (!this.peers.has(fromConnectionId)) {
        console.log('Creating receiver peer for:', participant.name);
        this.createPeer(fromConnectionId, participant.name, false);
      }

      // Offer will be flushed from the queue once peer exists.
      this.schedulePendingSignalFlush(fromConnectionId);

    } else {
      console.log('Participant not found yet, creating peer with connectionId fallback');
      if (!this.peers.has(fromConnectionId)) {
        this.createPeer(fromConnectionId, `User-${fromConnectionId.substring(0, 5)}`, false);
      }
      this.schedulePendingSignalFlush(fromConnectionId);
    }
  }

  private handleAnswer(fromConnectionId: string, answer: any) {
    if (this.livekitActive || (this.livekitEnabled && this.livekitInitializing)) {
      this.queueSignal(fromConnectionId, answer);
      return;
    }
    console.log('Handling answer from:', fromConnectionId);
    this.queueSignal(fromConnectionId, answer);
    this.flushPendingSignals(fromConnectionId);
  }

  private handleIceCandidate(fromConnectionId: string, candidate: any) {
    if (this.livekitActive || (this.livekitEnabled && this.livekitInitializing)) {
      this.queueSignal(fromConnectionId, candidate);
      return;
    }
    console.log('Handling ICE candidate from:', fromConnectionId);
    this.queueSignal(fromConnectionId, candidate);
    this.flushPendingSignals(fromConnectionId);
  }

  private removePeer(connectionId: string) {
    if (this.livekitActive) {
      return;
    }
    console.log('Removing peer:', connectionId);
    this.cleanupPeer(connectionId, true);
  }

  private addRemoteVideo(connectionId: string, stream: MediaStream, userName: string) {
    // Prevent echo: do not create a remote audio element for your own stream
    if (connectionId === this.connectionId || userName === this.userFullName) {
      console.log('Skipping remote audio for self to prevent echo:', userName);
      return;
    }

    console.log('Adding remote media stream for:', userName);

    // Track remote audio streams for recording
    this.remoteAudioStreams.set(connectionId, stream);

    // If a recording is already in progress, dynamically add this stream to the mixer
    this.audioRecorderService.addRemoteStream(connectionId, stream);

    this.ngZone.run(() => {
      // Find the participant and attach the stream for the video grid
      const participant = this.participants.find(p => p.connectionId === connectionId);
      if (participant) {
        participant.stream = stream;
        // Trigger change detection by spreading the array
        this.participants = [...this.participants];
        console.log('Successfully attached stream to participant:', userName);

        // Start speaking detection for this participant
        this.setupSpeakingDetection(connectionId, stream);
      } else {
        console.warn('Participant not found for stream attachment:', userName, connectionId);
      }

      // Keep hidden audio element for reliable audio playback (especially if video is off)
      let audioElement = document.getElementById(`remote-audio-${connectionId}`) as HTMLAudioElement | null;

      if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.id = `remote-audio-${connectionId}`;
        audioElement.autoplay = true;
        audioElement.controls = false;
        audioElement.setAttribute('playsinline', 'true');
        audioElement.setAttribute('webkit-playsinline', 'true');
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);
        console.log('Remote audio element created for:', userName);
      }

      audioElement.srcObject = stream;
      audioElement.muted = false;
      audioElement.volume = 1.0;
      audioElement.onloadedmetadata = () => {
        audioElement?.play().catch(err => {
          console.warn('Error playing remote audio stream:', err);
        });
      };

      // Attempt immediate play
      audioElement.play().catch(err => {
        console.warn('Immediate play failed, waiting for metadata:', err);
      });
    });
  }

  private removeRemoteVideo(connectionId: string) {
    console.log('Removing remote media stream for connection:', connectionId);

    // Remove from tracked remote streams
    this.remoteAudioStreams.delete(connectionId);

    // If recording, remove this stream from the mixer
    this.audioRecorderService.removeRemoteStream(connectionId);

    const videoElement = this.remoteVideoElements.get(connectionId);
    if (videoElement) {
      try {
        (videoElement as HTMLVideoElement).srcObject = null;
      } catch { }
      this.remoteVideoElements.delete(connectionId);
    }

    // Remove any remote <audio> element created for this connection.
    const audioElement = document.getElementById(`remote-audio-${connectionId}`) as HTMLAudioElement | null;
    if (audioElement) {
      try {
        audioElement.pause();
        (audioElement as any).srcObject = null;
      } catch { }
      audioElement.remove();
    }
  }

  private cleanupPeer(connectionId: string, destroy: boolean): void {
    const pendingSignalFlush = this.pendingSignalFlushTimeouts.get(connectionId);
    if (pendingSignalFlush) {
      clearTimeout(pendingSignalFlush);
      this.pendingSignalFlushTimeouts.delete(connectionId);
    }

    const peer = this.peers.get(connectionId);
    if (peer) {
      try {
        if (destroy && !peer.destroyed) {
          peer.destroy();
        }
      } catch (e) {
        console.warn('Error destroying peer:', e);
      }
      this.peers.delete(connectionId);
    }

    this.pendingSignals.delete(connectionId);
    this.peerRestartAttempts.delete(connectionId);
    this.removeRemoteVideo(connectionId);
  }

  private queueSignal(connectionId: string, signal: any): void {
    if (!connectionId) {
      return;
    }
    const queue = this.pendingSignals.get(connectionId) ?? [];
    queue.push(signal);
    // prevent unbounded growth
    if (queue.length > 25) {
      queue.splice(0, queue.length - 25);
    }
    this.pendingSignals.set(connectionId, queue);
  }

  private flushPendingSignals(connectionId: string): void {
    const peer = this.peers.get(connectionId);
    if (!peer || peer.destroyed) {
      return;
    }

    const queue = this.pendingSignals.get(connectionId);
    if (!queue || queue.length === 0) {
      return;
    }

    // We'll attempt to apply all queued signals; if one fails, re-queue remaining.
    this.pendingSignals.delete(connectionId);

    while (queue.length > 0) {
      const sig = queue.shift();
      try {
        peer.signal(sig);
      } catch (e) {
        console.warn('Failed to apply queued signal; will retry later:', e);
        // Put remaining signals back
        const remaining = [sig, ...queue];
        this.pendingSignals.set(connectionId, remaining);
        break;
      }
    }
  }

  private shouldInitiatePeer(targetConnectionId: string): boolean {
    // Deterministic initiator selection avoids glare (both sides sending offers).
    if (!this.connectionId || !targetConnectionId) {
      return false;
    }
    return String(this.connectionId) < String(targetConnectionId);
  }

  private scheduleConnectToKnownParticipants(): void {
    if (this.livekitActive || (this.livekitEnabled && this.livekitInitializing)) {
      return;
    }
    if (this.connectPeersTimeout) {
      clearTimeout(this.connectPeersTimeout);
    }

    this.connectPeersTimeout = setTimeout(() => {
      this.connectPeersTimeout = null;
      this.connectToKnownParticipants();
    }, 300);
  }

  private connectToKnownParticipants(): void {
    if (this.livekitActive || (this.livekitEnabled && this.livekitInitializing)) {
      return;
    }
    if (!this.mediaStream || !this.connectionId) {
      return;
    }

    for (const participant of this.participants) {
      if (!participant?.connectionId) {
        continue;
      }
      if (participant.connectionId === this.connectionId) {
        continue;
      }
      if (this.peers.has(participant.connectionId)) {
        continue;
      }

      if (this.shouldInitiatePeer(participant.connectionId)) {
        this.createPeer(participant.connectionId, participant.name, true);
      }
    }
  }


  toggleVoiceMode() {
    this.isVoiceMode = true;
    this.cdr.markForCheck();
  }

  toggleVideoMode() {
    this.isVoiceMode = false;
    this.cdr.markForCheck();
  }

  /** Switch to video call mode: exit voice-only and enable camera if off */
  async switchToVideoCall() {
    this.isVoiceMode = false;
    this.cdr.markForCheck();
    if (this.isVideoOff) {
      await this.toggleVideo();
    }
  }

  toggleParticipants() {
    this.showParticipants = !this.showParticipants;
    if (this.showParticipants) {
      this.showChat = false;
      this.showAddParticipantPanel = false;
      this.showLiveTranscriptionPanel = false;
    }
    this.showVolumeControl = false;
    this.cdr.markForCheck();
  }

  toggleChat() {
    this.showChat = !this.showChat;
    if (this.showChat) {
      this.showParticipants = false;
      this.showAddParticipantPanel = false;
      this.showLiveTranscriptionPanel = false;
    }
    this.showVolumeControl = false;
    this.cdr.markForCheck();
  }

  toggleLiveTranscriptionPanel() {
    this.showLiveTranscriptionPanel = !this.showLiveTranscriptionPanel;
    if (this.showLiveTranscriptionPanel) {
      this.showChat = false;
      this.showParticipants = false;
      this.showAddParticipantPanel = false;
    }
    this.cdr.markForCheck();
  }

  /** Called by the CC dock button — starts/stops transcription and manages panel */
  async toggleLiveTranscriptionFromButton(): Promise<void> {
    if (!this.isLiveTranscriptionOn) {
      // Show the panel immediately so the user sees feedback; then start
      this.showLiveTranscriptionPanel = true;
      this.showChat = false;
      this.showParticipants = false;
      this.showAddParticipantPanel = false;
      this.cdr.markForCheck();
      await this.toggleLiveTranscription();
    } else {
      await this.toggleLiveTranscription();
      this.cdr.markForCheck();
    }
  }

  // ── Screen share helpers ─────────────────────────────────────────────────
  get localStream(): MediaStream | null {
    return this.mediaStream;
  }

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  // Ctrl/Cmd + Shift + F → toggle full screen
  // Ctrl/Cmd + Shift + X → toggle focus mode
  // Ctrl/Cmd + Shift + S → stop sharing
  @HostListener('document:keydown', ['$event'])
  onKeyboardShortcut(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey || event.metaKey;
    if (!ctrl || !event.shiftKey) { return; }

    switch (event.code) {
      case 'KeyF':
        if (this.isScreenSharing || this.isRemoteScreenSharing) {
          event.preventDefault();
          this.toggleSsFullScreen();
        }
        break;
      case 'KeyX':
        if (this.isScreenSharing || this.isRemoteScreenSharing) {
          event.preventDefault();
          this.toggleSsFocusMode();
        }
        break;
      case 'KeyS':
        if (this.isScreenSharing) {
          event.preventDefault();
          this.toggleScreenShare();
        }
        break;
    }
  }

  // ── Full-Screen ───────────────────────────────────────────────────────────
  // Electron's renderer blocks requestFullscreen() in many configurations.
  // Strategy: ALWAYS toggle the CSS state first (.ss-fullscreen applies
  // position:fixed; inset:0; z-index:9999) so the button works regardless.
  // Then attempt the native Fullscreen API as a bonus — if it succeeds, great;
  // if it throws, the CSS overlay is already in effect.
  toggleSsFullScreen(): void {
    const isCurrentlyFull = this.ssStateService.state.isFullScreen;

    if (isCurrentlyFull) {
      // ── EXIT: remove CSS class first, then try native exit ──────────────
      this.ssStateService.patch({ isFullScreen: false });
      this.cdr.markForCheck();

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
    } else {
      // ── ENTER: apply CSS class first, then try native API ───────────────
      this.ssStateService.patch({ isFullScreen: true });
      this.cdr.markForCheck();

      const el = document.querySelector('.screen-share-stage') as HTMLElement | null;
      if (el && el.requestFullscreen) {
        // Fire-and-forget; don't await — don't let a rejected promise revert state
        el.requestFullscreen().catch((err) => {
          console.info('[FullScreen] Native API unavailable (Electron), using CSS overlay:', err?.message ?? err);
          // CSS overlay is already active — no rollback needed
        });
      }
    }
  }

  // Sync state if the OS/browser exits native fullscreen (e.g. user presses Escape
  // in a real browser). In Electron this event usually never fires.
  @HostListener('document:fullscreenchange')
  onFullScreenChange(): void {
    // Only update state if native fullscreen is actually being used
    // (i.e. we have a fullscreenElement). Don't override CSS-only mode.
    if (document.fullscreenElement) {
      this.ssStateService.patch({ isFullScreen: true });
    } else if (!document.fullscreenElement && this.ssStateService.state.isFullScreen) {
      // The browser exited native fullscreen (e.g. Escape in browser) — mirror it
      this.ssStateService.patch({ isFullScreen: false });
    }
    this.cdr.markForCheck();
  }

  // Escape key: exit CSS full-screen (works in Electron where native API is unavailable)
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.ssStateService.state.isFullScreen) {
      this.ssStateService.patch({ isFullScreen: false });
      this.cdr.markForCheck();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
    }
  }

  // ── Focus Mode ────────────────────────────────────────────────────────────
  toggleSsFocusMode(): void {
    this.ssStateService.toggleFocusMode();
    this.cdr.markForCheck();
  }

  // ── Pin / Spotlight ───────────────────────────────────────────────────────
  toggleSsPinned(): void {
    this.ssStateService.togglePinned();
    this.cdr.markForCheck();
  }

  // ── Aspect Ratio / Scale Mode ─────────────────────────────────────────────
  cycleSsScaleMode(): void {
    const modes: Array<ScreenShareState['scaleMode']> = ['fit', 'fill', 'original'];
    const cur = this.ssStateService.state.scaleMode;
    const next = modes[(modes.indexOf(cur) + 1) % modes.length];
    this.ssStateService.setScaleMode(next);
    this.cdr.markForCheck();
  }

  setSsScaleMode(mode: ScreenShareState['scaleMode']): void {
    this.ssStateService.setScaleMode(mode);
    this.cdr.markForCheck();
  }

  // ── Presenter Controls Auto-hide ─────────────────────────────────────────
  // Run mouse-move detection outside Angular to avoid triggering CD on every
  // mouse event; only re-enter when the timer fires.
  onSsMouseMove(): void {
    // Show controls immediately (already inside Angular from the template event)
    this.ssStateService.showPresenterControls();
    this.cdr.markForCheck();

    if (this.ssControlsHideTimer) {
      clearTimeout(this.ssControlsHideTimer);
    }
    // Hide after 3 s of inactivity – run timer outside zone to avoid CD ticks
    this.ngZone.runOutsideAngular(() => {
      this.ssControlsHideTimer = setTimeout(() => {
        this.ngZone.run(() => {
          this.ssStateService.hidePresenterControls();
          this.cdr.markForCheck();
        });
      }, 3000);
    });
  }

  // ── Multi-Display / Window Source Picker ─────────────────────────────────
  // Re-starts the screen share with a freshly chosen source from the OS picker.
  async openSsSourcePicker(): Promise<void> {
    if (!this.isScreenSharing) { return; }

    const oisMeet = (window as any).oisMeet;
    if (!oisMeet || typeof oisMeet.getDesktopSources !== 'function') {
      // Browser: re-trigger getDisplayMedia which shows the built-in picker
      await this.stopScreenSharing();
      await this.toggleScreenShare();
      return;
    }

    // Electron: fetch all screen + window sources and let the user pick
    // For now we cycle to the next available screen source (a full picker
    // dialog can be built as a future enhancement using these thumbnails).
    const sources: Array<{ id: string; name: string; thumbnail: string }> =
      await oisMeet.getDesktopSources({ types: ['screen', 'window'] });

    if (!sources || sources.length <= 1) {
      this.snackBar.open('No other sources available', 'Close', { duration: 2000 });
      return;
    }

    // Stop the current share and immediately restart with the next source
    const oldStream = this.screenStream;
    const currentId = (oldStream?.getVideoTracks()[0] as any)?.getSettings?.()?.deviceId ?? '';
    const next = sources.find(s => s.id !== currentId) ?? sources[0];

    try {
      const newStream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: next.id,
            minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080
          }
        }
      });

      this.screenStream = newStream;
      if (this.screenShareVideo) {
        this.screenShareVideo.nativeElement.srcObject = newStream;
      }

      // Replace video track in all peers
      const newTrack = newStream.getVideoTracks()[0];
      this.peers.forEach(peer => {
        try {
          const pc: RTCPeerConnection = (peer as any)._pc;
          const sender = pc?.getSenders().find(s => s.track?.kind === 'video');
          sender?.replaceTrack(newTrack);
        } catch { }
      });

      // Stop old tracks
      oldStream?.getTracks().forEach(t => t.stop());
      this.snackBar.open(`Switched to: ${next.name}`, 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Source picker switch failed:', err);
    }
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  /**
   * Start a new recording.
   * @param mode 'video' captures camera/screen + mic; 'audio' captures mic only.
   */
  async startRecording(mode: RecordingMode = 'video'): Promise<void> {
    if (!this.recorderService.isIdle) { return; }

    const streams: MediaStream[] = [];

    // Always include the local mic+camera stream
    if (this.mediaStream) {
      streams.push(this.mediaStream);
    }

    // If screen sharing is active, add the screen stream (gives best composite)
    if (this.isScreenSharing && this.screenStream) {
      streams.push(this.screenStream);
    }

    if (streams.length === 0) {
      this.snackBar.open('No media stream available to record.', 'Close', { duration: 3000 });
      return;
    }

    try {
      await this.recorderService.start(streams, mode);
      // Subscribe to state changes so the template (timer/size) re-renders
      this.recorderService.state$
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.cdr.markForCheck());

      this.snackBar.open(
        `${mode === 'audio' ? '🎙️ Audio' : '🎥 Video'} recording started`,
        'OK', { duration: 2500 }
      );
    } catch (err) {
      console.error('Recording start failed:', err);
      this.snackBar.open('Could not start recording. Check permissions.', 'Close', { duration: 4000 });
    }
  }

  /** Pause if recording, resume if paused. */
  toggleRecordingPause(): void {
    if (this.recorderService.isRecording) {
      this.recorderService.pause();
    } else if (this.recorderService.isPaused) {
      this.recorderService.resume();
    }
    this.cdr.markForCheck();
  }

  /** Stop recording and trigger auto-download of the .webm file. */
  stopRecording(): void {
    this.recorderService.stop();
    this.snackBar.open('Recording saved — check your Downloads folder.', '✔', { duration: 4000 });
    this.cdr.markForCheck();
  }

  /** Discard the current recording without saving. */
  cancelRecording(): void {
    this.recorderService.cancel();
    this.snackBar.open('Recording discarded.', 'Close', { duration: 2000 });
    this.cdr.markForCheck();
  }

  // ── Volume ────────────────────────────────────────────────────────────────

  toggleVolumeControl(event?: MouseEvent): void {
    event?.stopPropagation();
    this.showVolumeControl = !this.showVolumeControl;
    this.cdr.markForCheck();
  }

  setVolume(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.volume = val;
    // Apply to all remote audio elements
    document.querySelectorAll<HTMLAudioElement>('audio').forEach(a => a.volume = val);
    document.querySelectorAll<HTMLVideoElement>('video:not([muted])').forEach(v => v.volume = val);
    this.cdr.markForCheck();
  }

  // ── Local mute of remote participant ─────────────────────────────────────
  isLocallyMuted(participantId: string): boolean {
    return this.localMutedParticipants.has(participantId);
  }

  toggleRemoteLocalMute(p: Participant): void {
    const id = p.id;
    if (this.localMutedParticipants.has(id)) {
      this.localMutedParticipants.delete(id);
      // Unmute their audio track
      const stream = this.remoteAudioStreams.get(p.connectionId);
      if (stream) stream.getAudioTracks().forEach(t => t.enabled = true);
    } else {
      this.localMutedParticipants.add(id);
      // Mute their audio track locally
      const stream = this.remoteAudioStreams.get(p.connectionId);
      if (stream) stream.getAudioTracks().forEach(t => t.enabled = false);
    }
    this.cdr.markForCheck();
  }

  // ── Close volume popup on outside click ──────────────────────────────────
  onMeetingClick(): void {
    if (this.showVolumeControl) {
      this.showVolumeControl = false;
      this.cdr.markForCheck();
    }
  }

  openAddParticipantPanel() {
    this.showAddParticipantPanel = true;
    this.showChat = false;
    this.showParticipants = false;
    this.loadOisMeetUsers();
    this.cdr.markForCheck();
  }

  closeAddParticipantPanel() {
    this.showAddParticipantPanel = false;
    this.cdr.markForCheck();
  }

  private schedulePeerRestart(connectionId: string, targetName: string): void {
    const attempts = this.peerRestartAttempts.get(connectionId) ?? 0;
    if (attempts >= this.maxPeerRestartAttempts) {
      return;
    }
    this.peerRestartAttempts.set(connectionId, attempts + 1);

    // Only restart if participant still exists.
    const participant = this.participants.find(p => p.connectionId === connectionId);
    if (!participant) {
      return;
    }

    setTimeout(() => {
      if (!this.peers.has(connectionId) && this.mediaStream) {
        console.log('Retrying peer connection for:', targetName);
        this.createPeer(connectionId, targetName, true);
      }
    }, 1500);
  }

  async toggleMute() {
    const wasMuted = this.isMuted;
    this.isMuted = !this.isMuted;
    this.cdr.markForCheck();

    if (this.mediaStream) {
      const audioTracks = this.mediaStream.getAudioTracks();

      if (audioTracks.length === 0 && !this.isMuted) {
        // Defensive: if we somehow lost the track, re-acquire mic once.
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
          const newTrack = stream.getAudioTracks()[0];
          if (newTrack) {
            this.mediaStream.addTrack(newTrack);
            newTrack.enabled = true;
          }

          if (this.localVideo) {
            this.localVideo.nativeElement.muted = true;
            this.localVideo.nativeElement.volume = 0;
            this.localVideo.nativeElement.srcObject = this.mediaStream;
          }
        } catch (err) {
          console.error('Error accessing microphone:', err);
          this.isMuted = true;
          this.snackBar.open('Microphone access denied', 'Close', { duration: 3000 });
        }
      } else {
        // Normal case: just toggle the existing track(s).
        audioTracks.forEach(track => {
          track.enabled = !this.isMuted;
        });
      }
    }

    // LiveKit: use mute/unmute (not unpublish) to avoid stopping the underlying mic track.
    if (this.livekitActive) {
      try {
        const localAudioTrack = this.mediaStream?.getAudioTracks()?.[0] ?? null;
        await this.livekitService.setMicrophoneMuted(this.isMuted, localAudioTrack);
      } catch (e) {
        console.error('LiveKit mic mute/unmute failed:', e);
      }
    }

    await this.signalRService.toggleAudio(this.meetingId, !this.isMuted);
  }

  async toggleVideo() {
    console.log('Toggling video, current:', this.isVideoOff);
    this.isVideoOff = !this.isVideoOff;
    this.cdr.markForCheck();

    if (this.mediaStream) {
      const videoTracks = this.mediaStream.getVideoTracks();

      if (videoTracks.length > 0) {
        // Existing track – just enable/disable
        videoTracks.forEach(track => { track.enabled = !this.isVideoOff; });
        console.log('Video tracks enabled:', !this.isVideoOff);
      } else if (!this.isVideoOff) {
        // No video track yet – acquire camera and push into all active peers
        try {
          const settings = this.settingsService.currentSettings;
          const videoConstraints: any = { width: { ideal: 1280 }, height: { ideal: 720 } };

          if (settings.preferredVideoInputId && settings.preferredVideoInputId !== 'default') {
            videoConstraints.deviceId = { exact: settings.preferredVideoInputId };
          }

          const newStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false
          });
          const videoTrack = newStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = true;
            this.mediaStream.addTrack(videoTrack);

            // Push the new video track into every existing RTCPeerConnection so
            // remote participants can see our camera without a full renegotiation.
            this.peers.forEach((peer) => {
              try {
                const pc: RTCPeerConnection = (peer as any)._pc;
                if (!pc) return;
                const senders = pc.getSenders();
                const videoSender = senders.find((s) => s.track?.kind === 'video');
                if (videoSender) {
                  videoSender.replaceTrack(videoTrack).catch((e: any) =>
                    console.warn('replaceTrack failed:', e));
                } else {
                  pc.addTrack(videoTrack, this.mediaStream!);
                }
              } catch (e) {
                console.warn('Failed to update video track in peer:', e);
              }
            });
          }

          if (this.localVideo) {
            this.localVideo.nativeElement.muted = true;
            this.localVideo.nativeElement.volume = 0;
            this.localVideo.nativeElement.srcObject = this.mediaStream;
          }
          this.cdr.markForCheck();
        } catch (err) {
          console.error('Error starting camera:', err);
          this.isVideoOff = true;
          this.cdr.markForCheck();
          this.snackBar.open('Could not start camera', 'Close', { duration: 3000 });
        }
      }
    }

    await this.signalRService.toggleVideo(this.meetingId, !this.isVideoOff);
    console.log('Video toggle sent to server:', !this.isVideoOff);

    // ── LiveKit: publish / unpublish the local camera track ──────────────────
    if (this.livekitActive) {
      if (this.isVideoOff) {
        // Camera turned off — unpublish from LiveKit so remote participants stop receiving
        await this.livekitService.unpublishCameraTracks().catch(e =>
          console.error('Failed to unpublish camera from LiveKit:', e));
      } else {
        // Camera turned on — publish the live video track
        const videoTrack = this.mediaStream?.getVideoTracks()
          .find(t => t.readyState === 'live') ?? null;
        if (videoTrack) {
          await this.livekitService.publishCameraTrack(videoTrack).catch(e =>
            console.error('Failed to publish camera to LiveKit:', e));
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    this.refreshTooltips();
  }

  async toggleScreenShare() {
    if (!this.isScreenSharing) {
      // ── Acquire the screen stream (Electron 29-compatible) ───────────────────
      // Electron 29 does not support setDisplayMediaRequestHandler, so
      // getDisplayMedia() throws "DOMException: Not supported".
      // Instead:  ask the main process for a desktopCapturer sourceId via IPC,
      // then call getUserMedia with chromeMediaSource:'desktop'.
      // When running in a plain browser (no window.oisMeet) we fall back to
      // the standard getDisplayMedia() path.
      let screenStream: MediaStream;
      try {
        const oisMeet = (window as any).oisMeet;
        if (oisMeet && typeof oisMeet.getDesktopSources === 'function') {
          // ── Electron path ──────────────────────────────────────────────────
          console.log('Starting screen share (Electron desktopCapturer path)');
          const sources: Array<{ id: string; name: string; thumbnail: string }> =
            await oisMeet.getDesktopSources({ types: ['screen'] });

          if (!sources || sources.length === 0) {
            throw new Error('No desktop sources available');
          }

          // Pick the primary screen (first source whose name includes 'Screen' or
          // just the first one if naming differs by OS/locale).
          const primary = sources.find(s => /screen\s*1?$/i.test(s.name) || /entire/i.test(s.name))
            ?? sources[0];

          screenStream = await (navigator.mediaDevices as any).getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: primary.id,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
              }
            }
          });
        } else {
          // ── Browser fallback ───────────────────────────────────────────────
          console.log('Starting screen share (browser getDisplayMedia path)');
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
          });
        }
      } catch (error) {
        console.error('Error sharing screen:', error);
        this.isScreenSharing = false;
        this.screenShareOwnerName = 'Your Screen';
        this.cdr.markForCheck();
        this.snackBar.open('Could not start screen share', 'Close', { duration: 3000 });
        this.refreshTooltips();
        return;
      }

      this.screenStream = screenStream;

      // ── LiveKit path ─────────────────────────────────────────────────────────
      if (this.livekitActive) {
        const screenTrack = this.screenStream.getVideoTracks()[0];
        this.localLivekitScreenShareTrackSid =
          await this.livekitService.publishScreenShareTrack(screenTrack).catch(e => {
            console.error('LiveKit screen share publish failed:', e);
            return null;
          });
      }

      this.isScreenSharing = true;
      this.screenShareOwnerName = 'Your Screen';
      this.ssStateService.patch({ isSharing: true, showControls: true });
      this.cdr.detectChanges(); // render screen-share-stage so #screenShareVideo is in DOM
      if (this.screenShareVideo) {
        this.screenShareVideo.nativeElement.srcObject = this.screenStream;
      }

      // ── Mesh WebRTC: swap camera track for screen track ──────────────────────
      if (!this.livekitActive) {
        const existingCameraTrack = this.mediaStream?.getVideoTracks()[0] ?? null;
        this.preservedCameraTrack = existingCameraTrack;
        if (existingCameraTrack) {
          this.mediaStream?.removeTrack(existingCameraTrack);
        }
        const screenTrack = this.screenStream.getVideoTracks()[0];
        if (screenTrack) {
          screenTrack.enabled = true;
          this.mediaStream?.addTrack(screenTrack);
        }
      }

      await this.signalRService.startScreenShare(this.meetingId);
      console.log('Screen share started');

      // Stop sharing when the user clicks "Stop sharing" in the OS bar
      const firstVideoTrack = this.screenStream.getVideoTracks()[0];
      if (firstVideoTrack) {
        firstVideoTrack.onended = () => {
          console.log('Screen share ended by user via OS stop button');
          this.stopScreenSharing();
        };
      }
    } else {
      await this.stopScreenSharing();
    }
    this.refreshTooltips();
  }

  private async stopScreenSharing() {
    console.log('Stopping screen share');

    // Reset centralized state and exit full-screen if active
    this.ssStateService.reset();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
    if (this.ssControlsHideTimer) {
      clearTimeout(this.ssControlsHideTimer);
      this.ssControlsHideTimer = null;
    }

    if (this.livekitActive) {
      this.isScreenSharing = false;

      const trackSid = this.localLivekitScreenShareTrackSid;
      this.localLivekitScreenShareTrackSid = null;
      await this.signalRService.stopScreenShare(this.meetingId);

      if (trackSid) {
        await this.livekitService.unpublishTrack(trackSid);
      }

      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
      }
      if (this.screenShareVideo) {
        this.screenShareVideo.nativeElement.srcObject = null;
      }
      return;
    }

    this.isScreenSharing = false;
    await this.signalRService.stopScreenShare(this.meetingId);

    if (this.mediaStream) {
      const activeVideoTrack = this.mediaStream.getVideoTracks()[0];
      if (activeVideoTrack) {
        this.mediaStream.removeTrack(activeVideoTrack);
      }

      const restoredCameraTrack = this.preservedCameraTrack;
      this.preservedCameraTrack = null;

      if (restoredCameraTrack && restoredCameraTrack.readyState === 'live') {
        restoredCameraTrack.enabled = !this.isVideoOff;
        this.mediaStream.addTrack(restoredCameraTrack);
      } else if (!this.isVideoOff) {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const videoTrack = newStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = true;
            this.mediaStream.addTrack(videoTrack);
          }
        } catch (err) {
          console.error('Error restarting camera:', err);
          this.isVideoOff = true;
          this.snackBar.open('Camera could not be restored after screen share', 'Close', { duration: 3000 });
        }
      }

      if (this.localVideo) {
        this.localVideo.nativeElement.srcObject = this.mediaStream;
      }
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    if (this.screenShareVideo) {
      this.screenShareVideo.nativeElement.srcObject = null;
    }
  }

  setSidebarTab(tab: 'chat' | 'transcription'): void {
    this.activeSidebarTab = tab;

    if (tab === 'chat') {
      this.scrollChatToBottom();
    }
  }

  async sendMessage() {
    if (!this.newMessage.trim()) return;

    console.log('Sending message:', this.newMessage);

    // Generate a unique ID for this message
    const messageId = Date.now().toString() + '-' + Math.random().toString(36).substring(2);

    // Add to processed IDs to prevent duplication when broadcast returns
    this.processedMessageIds.add(messageId);

    // Add to UI immediately
    this.chatMessages.push({
      id: messageId,
      sender: this.userFullName,
      senderId: this.oisMeetUserId,
      message: this.newMessage,
      timestamp: new Date(),
      isMe: true
    });
    this.scrollChatToBottom();

    // Send via SignalR with the message ID
    await this.signalRService.sendMeetingMessage(this.meetingId, this.newMessage, messageId);

    // Clear input
    this.newMessage = '';
  }

  closeMeetingWindow() {
    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron && typeof electronApi.closeMeetingWindow === 'function') {
      electronApi.closeMeetingWindow({ force: true });
    } else {
      this.router.navigate(['/chat']);
    }
  }

  leaveMeeting() {
    console.log('Leaving meeting');
    this.openConfirmDialog({
      title: 'Leave Meeting',
      message: 'Are you sure you want to leave the meeting?',
      confirmText: 'Leave',
      isDestructive: true,
      onConfirm: () => {
        if (!this.isHost) {
          this.meetingService.leaveMeeting(this.meetingId, this.oisMeetUserId).subscribe();
        }
        this.signalRService.leaveMeeting(this.meetingId, this.oisMeetUserId);
        this.closeMeetingWindow();
      }
    });
  }

  endMeeting() {
    console.log('Ending meeting');
    if (!this.isHost) return;
    this.openConfirmDialog({
      title: 'End Meeting',
      message: 'Are you sure you want to end the meeting for everyone?',
      confirmText: 'End',
      isDestructive: true,
      onConfirm: () => {
        this.meetingService.endMeeting(this.meetingId, this.oisMeetUserId).subscribe({
          next: () => {
            this.signalRService.endMeeting(this.meetingId, this.oisMeetUserId);
            this.closeMeetingWindow();
          }
        });
      }
    });
  }

  openConfirmDialog(config: { title: string, message: string, confirmText?: string, cancelText?: string, isDestructive?: boolean, onConfirm: () => void, onCancel?: () => void }) {
    this.dialogState = {
      isOpen: true,
      title: config.title,
      message: config.message,
      confirmText: config.confirmText || 'Confirm',
      cancelText: config.cancelText || 'Cancel',
      isDestructive: config.isDestructive || false,
      onConfirm: () => {
        this.closeDialog();
        if (config.onConfirm) config.onConfirm();
      },
      onCancel: () => {
        this.closeDialog();
        if (config.onCancel) config.onCancel();
      }
    };
    this.cdr.detectChanges();
  }

  closeDialog() {
    this.dialogState.isOpen = false;
    this.cdr.detectChanges();
  }

  muteParticipant(participantId: string) {
    console.log('Mute participant:', participantId);
    // Implement if needed
  }


  copyMeetingId() {
    this.clipboard.copy(this.meetingId);
    this.snackBar.open('Meeting ID copied!', 'OK', { duration: 2000 });
  }

  copyMeetingCode(event: Event): void {
    event.preventDefault();
    this.clipboard.copy(this.meetingId);
    this.snackBar.open('Meeting code copied!', 'Close', { duration: 2000 });
  }

  copyMeetingLink(event?: Event) {
    if (event) event.preventDefault();
    this.clipboard.copy(window.location.href);
    this.snackBar.open('Meeting link copied!', 'Close', { duration: 2000 });
  }

  shareToTeams(event: Event) {
    event.preventDefault();
    const teamsUrl = `https://teams.microsoft.com/l/meeting/new?subject=${encodeURIComponent(this.meetingTopic)}&body=${encodeURIComponent(`Join meeting: ${window.location.href}`)}`;
    window.open(teamsUrl, '_blank');
  }

  shareToMail(event: Event) {
    event.preventDefault();
    const subject = encodeURIComponent(`Join OIS Meet: ${this.meetingTopic}`);
    const body = encodeURIComponent(`Meeting Code: ${this.meetingId}\n\nJoin here: ${window.location.href}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  private scrollChatToBottom() {
    if (this.pendingChatScrollFrame !== null) {
      return;
    }

    this.pendingChatScrollFrame = requestAnimationFrame(() => {
      this.pendingChatScrollFrame = null;
      if (this.chatMessagesContainer) {
        this.chatMessagesContainer.nativeElement.scrollTop =
          this.chatMessagesContainer.nativeElement.scrollHeight;
      }
    });
  }

  private initializeTooltips(): void {
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipTriggerList.forEach((el: Element) => {
      const existing = bootstrap.Tooltip.getInstance(el);
      if (existing) existing.dispose();

      const tooltip = new bootstrap.Tooltip(el, {
        placement: 'top',
        trigger: 'hover',
        container: 'body'
      });
      this.tooltips.push(tooltip);
    });
  }

  private refreshTooltips(): void {
    this.tooltips.forEach(t => t.dispose());
    this.tooltips = [];
    if (this.pendingTooltipRefreshTimeout) {
      clearTimeout(this.pendingTooltipRefreshTimeout);
    }

    this.pendingTooltipRefreshTimeout = setTimeout(() => {
      this.pendingTooltipRefreshTimeout = null;
      this.initializeTooltips();
    }, 100);
  }

  getInitials(name: string | null | undefined): string {
    return this.commonService.getInitials(name);
  }


  startTimer(): void {
    this.meetingDuration = 0;
    this.updateFormattedDuration();
    this.timerInterval = setInterval(() => {
      this.meetingDuration++;
      this.updateFormattedDuration();
    }, 1000);
  }

  stopTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  updateFormattedDuration(): void {
    const hours = Math.floor(this.meetingDuration / 3600);
    const minutes = Math.floor((this.meetingDuration % 3600) / 60);
    const seconds = this.meetingDuration % 60;

    if (hours > 0) {
      this.formattedDuration = `${this.padZero(hours)}:${this.padZero(minutes)}:${this.padZero(seconds)}`;
    } else {
      this.formattedDuration = `${this.padZero(minutes)}:${this.padZero(seconds)}`;
    }
  }

  padZero(num: number): string {
    return num < 10 ? '0' + num : num.toString();
  }

  getRandomColor(seed: string): string {
    const colors = [
      '#E3F2FD', // Light Blue
      '#F3E5F5', // Light Purple
      '#E8F5E9', // Light Green
      '#FFF3E0', // Light Orange
      '#FCE4EC', // Light Pink
      '#E0F2F1', // Light Teal
      '#F9FBE7', // Light Lime
      '#FFFDE7'  // Light Yellow
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  LIVE TRANSCRIPTION METHODS
  // ════════════════════════════════════════════════════════════════════════════
  async toggleLiveTranscription(): Promise<void> {

    if (!this.isLiveTranscriptionOn) {
      // ── No session running → start as host ───────────────────────────────
      if (!this.mediaStream) {
        this.snackBar.open('Microphone not available', 'Close', { duration: 3000 });
        return;
      }

      this.isLiveTranscriptionOn = true;
      this.liveTranscriptionIsHost = true;
      this.showLiveTranscriptionPanel = true;
      this.liveTranscriptionError = null;

      // Start own mic capture first
      await this.startOwnLiveTranscription(true);

      // Notify all other participants → they will each start their own capture
      await this.signalRService.notifyLiveTranscriptionStarted(this.meetingId);

    } else if (this.liveTranscriptionIsHost) {
      // ── HOST: stop the session for everyone ──────────────────────────────
      this.isLiveTranscriptionOn = false;
      this.liveTranscriptionIsHost = false;
      this.showLiveTranscriptionPanel = false;
      this.liveTranscriptionService.stop();
      await this.signalRService.notifyLiveTranscriptionStopped(this.meetingId);

    }
  }


  private async startOwnLiveTranscription(isHost: boolean): Promise<void> {
    if (!this.mediaStream) return;

    const aiBase: string = ((environment as any).aiApiBaseUrl || 'http://192.168.1.47:8001')
      .toString().trim().replace(/\/+$/, '');
    const wsUrl = aiBase.replace(/^http/, 'ws') + '/ws/transcribe';

    // Build a dedicated mic-only stream for transcription so we don't affect
    // the main media stream's enabled state. If all audio tracks are currently
    // disabled (muted), re-enable them inside the capture stream — Web Audio
    // captures at the hardware level regardless, but enabled=false on the
    // MediaStreamTrack causes silence in some Chromium/Electron builds.
    const audioTracks = this.mediaStream.getAudioTracks();
    let transcriptionStream: MediaStream;
    if (audioTracks.length > 0) {
      // Clone each track so toggling enabled on it doesn't affect the WebRTC stream
      const clonedTracks = audioTracks.map(t => {
        const clone = t.clone();
        clone.enabled = true; // ensure the clone sends real audio to the AudioContext
        return clone;
      });
      transcriptionStream = new MediaStream(clonedTracks);
    } else {
      // No mic track — try acquiring one just for transcription
      try {
        transcriptionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        this.snackBar.open('Microphone not available for transcription', 'Close', { duration: 3000 });
        return;
      }
    }

    const bridge: ISignalRBridge = {
      broadcastLiveTranscriptionSegments: (mid, segs) =>
        this.signalRService.broadcastLiveTranscriptionSegments(mid, segs),
      notifyLiveTranscriptionStarted: (mid) =>
        this.signalRService.notifyLiveTranscriptionStarted(mid),
      notifyLiveTranscriptionStopped: (mid) =>
        this.signalRService.notifyLiveTranscriptionStopped(mid),
    };

    await this.liveTranscriptionService.start(
      transcriptionStream, // dedicated clone — enabled regardless of mute state
      wsUrl,
      this.userFullName,
      this.meetingId,
      bridge,
      isHost
    );
  }

  clearLiveTranscription(): void {
    this.liveTranscriptionService.clearSegments();
  }
  trackLiveSegment(_index: number, seg: LiveTranscriptionSegment): string {
    return seg.id;
  }
  private scrollLiveTranscriptionToBottom(): void {
    if (this.pendingLiveTranscriptionScrollFrame !== null) {
      return;
    }

    this.pendingLiveTranscriptionScrollFrame = requestAnimationFrame(() => {
      this.pendingLiveTranscriptionScrollFrame = null;
      const el = this.liveTranscriptionScroll?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  trackById(_index: number, p: Participant): string {
    return p.id;
  }

  // --- UI Layout Helpers ---
  getGridLayout(): string {
    const total = this.participants.length + 1;
    if (this.isScreenSharing || this.isRemoteScreenSharing) return 'layout-screen-share';
    if (total === 1) return 'layout-1';
    if (total === 2) return 'layout-2';
    if (total <= 4) return 'layout-3-4';
    if (total <= 6) return 'layout-5-6';
    return 'layout-multi';
  }


  // --- Notifications ---
  private async showBrowserNotification(sender: string, message: string) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      new Notification(`New message from ${sender}`, {
        body: message,
        icon: 'assets/icon.png' // Adjust path as needed
      });
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.showBrowserNotification(sender, message);
      }
    }
  }

  // --- Actions ---
  openInviteDialog(): void {
    this.showInvitePopover = !this.showInvitePopover;

    if (this.showInvitePopover && this.oisMeetUsers.length === 0) {
      this.loadOisMeetUsers();
    }
  }

  loadOisMeetUsers(): void {
    const clientId = this.sessionService.getClientId();
    const companyId = this.sessionService.getCompanyId();
    const appId = this.sessionService.getMeetAppId() || (environment as any).appId || 'OISMEET';

    if (!clientId || !companyId) return;

    this.userService.getOisMeetUsers(
      clientId,
      companyId.toString(),
      appId
    ).subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          if (res.success && res.data) {
            // Normalize field names from the API so the template can always use
            // u.fullName, u.email, u.oisMeetUserId and u.avatarUrl uniformly.
            const normalized = (res.data as any[]).map((u: any) => ({
              ...u,
              oisMeetUserId: u.oisMeetUserId || u.userId || u.id || '',
              fullName: u.fullName || u.userName || u.name || u.displayName || 'Unknown',
              email: u.email || u.emailAddress || u.userEmail || '',
              avatarUrl: u.avatarUrl || u.avatar || u.profileImage || null,
            }));
            this.oisMeetUsers = normalized.filter((u: any) => u.oisMeetUserId !== this.oisMeetUserId);
            this.filteredInviteUsers = [...this.oisMeetUsers];
          }
          this.cdr.markForCheck();
        });
      },
      error: (err: any) => {
        console.error('Failed to load users for invitation:', err);
        this.ngZone.run(() => { this.cdr.markForCheck(); });
      }
    });
  }

  filterInviteUsers(): void {
    if (!this.inviteSearchQuery.trim()) {
      this.filteredInviteUsers = [...this.oisMeetUsers];
    } else {
      const q = this.inviteSearchQuery.toLowerCase();
      this.filteredInviteUsers = this.oisMeetUsers.filter(u =>
        u.fullName.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
      );
    }
    this.cdr.markForCheck();
  }

  get filteredParticipants(): Participant[] {
    if (!this.participantSearchQuery.trim()) return this.participants;
    const q = this.participantSearchQuery.toLowerCase();
    return this.participants.filter(p => p.name.toLowerCase().includes(q));
  }

  matchesSelfSearch(): boolean {
    if (!this.participantSearchQuery.trim()) return true;
    return this.userFullName.toLowerCase().includes(this.participantSearchQuery.toLowerCase());
  }

  filterParticipantsList(): void {
    this.cdr.markForCheck();
  }

  inviteUser(user: any): void {
    const uid = user.oisMeetUserId;
    if (this.invitingUserIds.has(uid)) return;
    this.invitingUserIds = new Set([...this.invitingUserIds, uid]);
    this.cdr.markForCheck();

    const finalize = (msg: string, success = true) => {
      this.ngZone.run(() => {
        this.invitingUserIds.delete(uid);
        this.invitingUserIds = new Set(this.invitingUserIds);
        if (success) {
          this.invitedUserIds = new Set([...this.invitedUserIds, uid]);
          setTimeout(() => {
            this.invitedUserIds.delete(uid);
            this.invitedUserIds = new Set(this.invitedUserIds);
            this.cdr.markForCheck();
          }, 5000);
        }
        this.snackBar.open(msg, 'OK', { duration: 2500 });
        this.cdr.markForCheck();
      });
    };

    // Use CallService to "call" the participant into the meeting
    this.callService.startCall(user.oisMeetUserId, user.fullName, this.userFullName, 'Video', this.meetingId)
      .then(() => finalize(`Calling ${user.fullName}…`, true))
      .catch(err => {
        console.error('Call failed, falling back to meeting invite:', err);
        // Fallback: send a meeting invite notification
        this.signalRService.inviteToMeeting(user.oisMeetUserId, this.meetingId, this.userFullName)
          .then(() => finalize(`Invitation sent to ${user.fullName}`, true))
          .catch(e => {
            console.error('Invite fallback failed:', e);
            finalize(`Could not reach ${user.fullName}`, false);
          });
      });
  }

  private setupSpeakingDetection(connectionId: string, stream: MediaStream, isLocal: boolean = false) {
    try {
      this.stopSpeakingDetection(connectionId);

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      source.connect(analyzer);
      analyzer.fftSize = 256;
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      const handle = { audioContext, frameId: null as number | null };
      this.speakingDetectionHandles.set(connectionId, handle);

      const checkSpeaking = () => {
        if (audioContext.state === 'closed') return;

        analyzer.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const isSpeaking = average > 25; // Adjusted threshold

        if (isLocal) {
          if (this.isSpeaking !== isSpeaking) {
            this.isSpeaking = isSpeaking;
            this.cdr.markForCheck();
          }
        } else {
          const participant = this.participantByConnectionId.get(connectionId);
          if (participant && participant.isSpeaking !== isSpeaking) {
            participant.isSpeaking = isSpeaking;
            this.cdr.markForCheck();
          }
        }

        handle.frameId = requestAnimationFrame(checkSpeaking);
      };

      checkSpeaking();
    } catch (e) {
      console.warn('Speaking detection failed:', e);
    }
  }

  /**
   * Builds a noise-suppression DSP chain around the microphone audio track.
   *
   * Chain:  MediaStreamSource
   *           → BiquadFilter (highpass @ 100 Hz  — removes low-freq rumble/AC hum)
   *           → BiquadFilter (lowpass  @ 8 kHz   — removes high-freq hiss above voice range)
   *           → DynamicsCompressor                — tames sudden ambient bursts
   *           → GainNode (unity gain)             — output stage
   *           → MediaStreamDestination            — back to a MediaStream
   *
   * The raw video tracks are NOT touched; only the audio track is replaced.
   * Returns the processed MediaStream and the AudioContext so they can be
   * stored and cleaned up on component destruction.
   */
  private buildNoiseSuppressedStream(
    rawStream: MediaStream
  ): { processedStream: MediaStream | null; audioContext: AudioContext | null } {
    const audioTracks = rawStream.getAudioTracks();
    if (!audioTracks.length) {
      return { processedStream: null, audioContext: null };
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)() as AudioContext;

      // ── Source node ──────────────────────────────────────────────────────────
      const source = audioContext.createMediaStreamSource(rawStream);

      // ── High-pass filter: cut sub-100 Hz rumble, fan noise, AC hum ──────────
      const highpass = audioContext.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 100;   // Hz — below human voice fundamental
      highpass.Q.value = 0.7;

      // ── Low-pass filter: cut ultra-high hiss above intelligible voice range ──
      const lowpass = audioContext.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 8000;  // Hz — keeps full voice clarity
      lowpass.Q.value = 0.7;

      // ── Dynamics compressor: prevents loud bursts / transient clipping ───────
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -40;   // dBFS — start compressing here
      compressor.knee.value = 10;   // soft knee width in dB
      compressor.ratio.value = 6;    // 6:1 ratio — moderate compression
      compressor.attack.value = 0.003; // 3 ms — fast attack to catch bursts
      compressor.release.value = 0.25;  // 250 ms — natural release

      // ── Output gain (unity) ───────────────────────────────────────────────────
      const outputGain = audioContext.createGain();
      outputGain.gain.value = 1.0;

      // ── Destination → new MediaStream carrying only the processed audio ───────
      const destination = audioContext.createMediaStreamDestination();

      // Wire up the chain
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(outputGain);
      outputGain.connect(destination);

      console.log('🎙️ Noise suppression pipeline active');
      return { processedStream: destination.stream, audioContext };
    } catch (err) {
      console.warn('Failed to build noise suppression pipeline, falling back to raw stream:', err);
      return { processedStream: null, audioContext: null };
    }
  }

  private performComponentCleanup(leaveMeeting: boolean): void {
    this.stopTimer();

    // Stop any active recording so MediaRecorder/timer don't outlive the component
    if (!this.recorderService.isIdle) {
      this.recorderService.cancel();
    }

    if (this.connectPeersTimeout) {
      clearTimeout(this.connectPeersTimeout);
      this.connectPeersTimeout = null;
    }

    this.pendingSignalFlushTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.pendingSignalFlushTimeouts.clear();

    if (this.pendingTooltipInitTimeout) {
      clearTimeout(this.pendingTooltipInitTimeout);
      this.pendingTooltipInitTimeout = null;
    }
    if (this.pendingTooltipRefreshTimeout) {
      clearTimeout(this.pendingTooltipRefreshTimeout);
      this.pendingTooltipRefreshTimeout = null;
    }
    if (this.meetingEndedCloseTimeout) {
      clearTimeout(this.meetingEndedCloseTimeout);
      this.meetingEndedCloseTimeout = null;
    }
    if (this.pendingChatScrollFrame !== null) {
      cancelAnimationFrame(this.pendingChatScrollFrame);
      this.pendingChatScrollFrame = null;
    }
    if (this.pendingLiveTranscriptionScrollFrame !== null) {
      cancelAnimationFrame(this.pendingLiveTranscriptionScrollFrame);
      this.pendingLiveTranscriptionScrollFrame = null;
    }

    this.tooltips.forEach(t => t.dispose());
    this.tooltips = [];

    Array.from(this.speakingDetectionHandles.keys()).forEach((connectionId) => this.stopSpeakingDetection(connectionId));

    // ── Tear down noise suppression pipeline ─────────────────────────────────
    if (this.noiseSuppressionContext) {
      try { this.noiseSuppressionContext.close(); } catch { }
      this.noiseSuppressionContext = null;
    }
    if (this.processedMicStream) {
      this.processedMicStream.getTracks().forEach(t => t.stop());
      this.processedMicStream = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    this.preservedCameraTrack = null;

    this.peers.forEach(peer => {
      try {
        peer.destroy();
      } catch {
        // ignore teardown errors during shutdown
      }
    });
    this.peers.clear();

    this.remoteVideoElements.forEach(video => video.remove());
    this.remoteVideoElements.clear();
    this.remoteAudioStreams.clear();
    this.participantByConnectionId.clear();

    if (leaveMeeting && this.meetingId && this.oisMeetUserId) {
      this.signalRService.leaveMeeting(this.meetingId, this.oisMeetUserId);
    }

    this.livekitService.disconnect();
    if (this.liveTranscriptionIsHost && this.isLiveTranscriptionOn) {
      this.signalRService.notifyLiveTranscriptionStopped(this.meetingId).catch(() => { });
    }
    this.liveTranscriptionService.stop();
    this.audioRecorderService.dispose();
    this.signalRService.stopConnection();
  }

  private registerParticipantConnection(participant: Participant, connectionId: string): void {
    if (participant.connectionId && participant.connectionId !== connectionId) {
      this.participantByConnectionId.delete(participant.connectionId);
      this.stopSpeakingDetection(participant.connectionId);
    }

    participant.connectionId = connectionId;
    if (connectionId) {
      this.participantByConnectionId.set(connectionId, participant);
    }
  }

  private getChatMessageId(data: any): string {
    if (data?.id) {
      return String(data.id);
    }

    return [
      data?.userId ?? 'unknown',
      data?.timestamp ?? '',
      data?.message ?? ''
    ].join('::');
  }

  private schedulePendingSignalFlush(connectionId: string): void {
    const existingTimeout = this.pendingSignalFlushTimeouts.get(connectionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      this.pendingSignalFlushTimeouts.delete(connectionId);
      this.flushPendingSignals(connectionId);
    }, 50);

    this.pendingSignalFlushTimeouts.set(connectionId, timeoutId);
  }

  private stopSpeakingDetection(connectionId: string): void {
    const handle = this.speakingDetectionHandles.get(connectionId);
    if (!handle) {
      return;
    }

    if (handle.frameId !== null) {
      cancelAnimationFrame(handle.frameId);
    }
    if (handle.audioContext.state !== 'closed') {
      handle.audioContext.close().catch(() => { });
    }
    this.speakingDetectionHandles.delete(connectionId);
  }
}

interface Participant {
  connectionId: string;
  id: string;
  name: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isHost: boolean;
  isSpeaking: boolean;
  avatarColor: string;
  stream?: MediaStream; // Added for video binding
}

interface ChatMessage {
  id: string;
  sender: string;
  senderId: string;
  message: string;
  timestamp: Date;
  isMe: boolean;
}
