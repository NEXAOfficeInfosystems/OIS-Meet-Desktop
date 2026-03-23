import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
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
import { LiveTranscriptionService, LiveTranscriptionSegment, LiveTranscriptionStatus } from '../../core/services/live-transcription.service';

@Component({
  selector: 'app-meeting',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSnackBarModule],
  templateUrl: './meeting.component.html',
  styleUrls: ['./meeting.component.scss']
})
export class MeetingComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('screenShareVideo') screenShareVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideosContainer') remoteVideosContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('chatMessagesContainer') chatMessagesContainer!: ElementRef<HTMLDivElement>;

  // Meeting Info
  meetingId: string = '';
  meetingTopic: string = 'OIS Meet';
  meetingDetails: any = null;
  isHost: boolean = false;

  // UI States
  isMuted: boolean = true;
  isVideoOff: boolean = false;
  isScreenSharing: boolean = false;
  isRemoteScreenSharing: boolean = false;
  screenShareOwnerName: string = 'Your Screen';
  isRecording: boolean = false;
  showParticipants: boolean = false;
  showChat: boolean = false;
  isLoading: boolean = true;

  private readonly livekitEnabled: boolean = !!(environment as any)?.livekitEnabled;
  private livekitInitializing: boolean = false;
  private livekitActive: boolean = false;
  private livekitSubscriptionsInitialized: boolean = false;
  private localLivekitScreenShareTrackSid: string | null = null;
  private remoteLivekitScreenShareTrackSid: string | null = null;
  private livekitAudioTrackSidToIdentity: Map<string, string> = new Map();

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

  // ── Live Transcription ────────────────────────────────────────────
    isLiveTranscriptionOn: boolean = false;
    liveTranscriptionStatus: LiveTranscriptionStatus = 'idle';
    liveTranscriptionSegments: LiveTranscriptionSegment[] = [];
    liveTranscriptionError: string | null = null;
    showLiveTranscriptionPanel: boolean = false;
  // ───────────────────────────────────────────────────────────────────────

  // User Info
  userFullName: string;
  oisMeetUserId: string = '';
  private connectionId: string | null = null;

  private processedMessageIds: Set<string> = new Set();
  private processedTranscriptionFiles: Set<string> = new Set();

  private destroy$ = new Subject<void>();

  private readonly maxPeerRestartAttempts = 1;

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
                  .catch(() => {});
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
                    this.signalRService.publishMom(this.meetingId, momResponse as any).catch(() => {});
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

    // ── Live Transcription subscriptions (NEW) ──────────────────────────────
    this.liveTranscriptionService.segments$
      .pipe(takeUntil(this.destroy$))
      .subscribe((segments) => {
        this.ngZone.run(() => {
          this.liveTranscriptionSegments = segments;
          // Auto-scroll is handled by the template's (cdkScrollable) or a simple
          // setTimeout in the method below.
          this.scrollLiveTranscriptionToBottom();
        });
      });

    this.liveTranscriptionService.status$
      .pipe(takeUntil(this.destroy$))
      .subscribe((status) => {
        this.ngZone.run(() => {
          this.liveTranscriptionStatus = status;
          if (status === 'error') {
            this.liveTranscriptionError = 'Connection to transcription server lost. Retrying…';
          } else if (status === 'connected') {
            this.liveTranscriptionError = null;
          }
        });
      });

    this.liveTranscriptionService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        this.ngZone.run(() => {
          this.liveTranscriptionError = msg;
        });
      });
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
      this.router.navigate(['/chat']);
      return;
    }

    // Start SignalR connection
    console.log('Starting SignalR connection...');
    await this.signalRService.startConnection(this.oisMeetUserId);

    // IMPORTANT: register SignalR listeners BEFORE any join/participant activity
    // so we don't miss the initial CurrentParticipants/UserJoined events
    this.setupSignalRListeners();

    // If SignalR reconnects, groups are lost; we must re-join and rebuild peers.
    this.signalRService.reconnected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.ngZone.run(() => {
          this.handleSignalRReconnected();
        });
      });

    // Load meeting details
    await this.loadMeetingDetails();

    // Load existing participants via REST API
    await this.loadExistingParticipants();

    // Initialize media and join the meeting
    await this.initializeMedia();

    // If LiveKit is enabled, connect to the SFU for scalable audio/screen share.
    await this.initializeLivekit();

    // After we have our own connectionId, connect to any already-known participants.
    if (!this.livekitActive) {
      this.scheduleConnectToKnownParticipants();
    }

    this.startTimer();
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

        // FIX: Map API response correctly to MeetingParticipant format
        const participants: MeetingParticipant[] = response.data.map((p: any) => ({
          connectionId: p.id,
          userId: p.userId,
          userName: p.userName,
          // FIX: API uses isMuted (true = muted), SignalR uses isAudioEnabled (true = unmuted)
          isAudioEnabled: !p.isMuted,  // Convert API isMuted to isAudioEnabled
          isVideoEnabled: !p.isVideoOff, // Convert API isVideoOff to isVideoEnabled
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

        // Add only filtered participants to the list
        this.ngZone.run(() => {
          this.participants = []; // Clear existing
          filteredParticipants.forEach(p => {
            this.addParticipant(p);
          });
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
    setTimeout(() => this.initializeTooltips(), 500);
  }

  ngOnDestroy() {
    console.log('Destroying meeting component');
    this.destroy$.next();
    this.destroy$.complete();

    this.stopTimer();
    this.tooltips.forEach(t => t.dispose());

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
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

      // Publish microphone using our existing audio track (so UI mute toggles still work).
      const localAudioTrack = this.mediaStream?.getAudioTracks()?.[0] ?? null;
      if (localAudioTrack) {
        // IMPORTANT: enforce initial mute state for LiveKit.
        await this.livekitService.setMicrophoneMuted(this.isMuted, localAudioTrack);
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

  private attachRemoteScreenShare(ownerName: string, trackSid: string, mediaStreamTrack: MediaStreamTrack): void {
    // If we are locally sharing, prefer showing our own preview.
    if (this.isScreenSharing) {
      return;
    }

    this.isRemoteScreenSharing = true;
    this.screenShareOwnerName = ownerName || 'Screen';
    this.remoteLivekitScreenShareTrackSid = trackSid;

    const stream = new MediaStream([mediaStreamTrack]);
    if (this.screenShareVideo) {
      this.screenShareVideo.nativeElement.srcObject = stream;
    }
  }

  private detachRemoteScreenShare(trackSid: string): void {
    if (!this.remoteLivekitScreenShareTrackSid || this.remoteLivekitScreenShareTrackSid !== trackSid) {
      return;
    }

    this.remoteLivekitScreenShareTrackSid = null;
    this.isRemoteScreenSharing = false;
    this.screenShareOwnerName = 'Your Screen';

    if (this.screenShareVideo) {
      this.screenShareVideo.nativeElement.srcObject = null;
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
        this.meetingTopic = this.meetingDetails?.topic || 'OIS Meet';
      }
    } catch (error) {
      console.error('Error loading meeting:', error);
      this.snackBar.open('Error loading meeting details', 'Close', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  private async initializeMedia() {
    try {
      // Always obtain an audio track once, then control mute via track.enabled.
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      console.log('Got initial audio stream');

      const startWithAudio = !this.isMuted; // derived from query params
      const audioTracks = this.mediaStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = startWithAudio;
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
        startWithAudio, // isAudioEnabled
        false           // isVideoEnabled
      );
      this.connectionId = this.signalRService.getConnectionId();
    } catch (err) {
      console.error('Error initializing media:', err);
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
    console.log('Setting up SignalR listeners');

    // Handle current participants list (sent immediately after joining)
    this.signalRService.currentParticipants$.subscribe((participants: MeetingParticipant[]) => {
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
            existingParticipant.connectionId = p.connectionId;
            existingParticipant.isMuted = !p.isAudioEnabled;
            existingParticipant.isVideoOff = !p.isVideoEnabled;
            existingParticipant.isScreenSharing = p.isScreenSharing;

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
    this.signalRService.participantJoined$.subscribe((participant: MeetingParticipant) => {
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
          existingParticipant.connectionId = participant.connectionId;
          existingParticipant.isMuted = !participant.isAudioEnabled;
          existingParticipant.isVideoOff = !participant.isVideoEnabled;

          // Force change detection
          this.participants = [...this.participants];

          console.log('🔄 Updated existing participant:', existingParticipant.name,
            'Muted:', existingParticipant.isMuted,
            'VideoOff:', existingParticipant.isVideoOff);
        }
      });
    });

    // Handle participant leaving
    this.signalRService.participantLeft$.subscribe(({ connectionId, userId }) => {
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
    });

    this.signalRService.participantDisconnected$.subscribe(({ connectionId, userId }) => {
      console.log('🔌 Participant disconnected:', connectionId);
      this.ngZone.run(() => {
        this.removeParticipant(connectionId);
        if (!this.livekitActive) {
          this.removePeer(connectionId);
        }
      });
    });

    // WebRTC signaling
    this.signalRService.receiveOffer$.subscribe(({ fromConnectionId, offer }) => {
      console.log('📞 Received offer from:', fromConnectionId);
      this.ngZone.run(() => {
        this.handleOffer(fromConnectionId, offer);
      });
    });

    this.signalRService.receiveAnswer$.subscribe(({ fromConnectionId, answer }) => {
      console.log('📞 Received answer from:', fromConnectionId);
      this.ngZone.run(() => {
        this.handleAnswer(fromConnectionId, answer);
      });
    });

    this.signalRService.receiveIceCandidate$.subscribe(({ fromConnectionId, candidate }) => {
      console.log('🧊 Received ICE candidate from:', fromConnectionId);
      this.ngZone.run(() => {
        this.handleIceCandidate(fromConnectionId, candidate);
      });
    });

    // Media toggles
    this.signalRService.audioToggled$.subscribe(({ connectionId, userId, isEnabled }) => {
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

    this.signalRService.videoToggled$.subscribe(({ connectionId, userId, isEnabled }) => {
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
    this.signalRService.screenShareStarted$.subscribe(({ connectionId, userId }) => {
      console.log('🖥️ Screen share started by:', userId);
    });

    this.signalRService.screenShareStopped$.subscribe(({ connectionId, userId }) => {
      console.log('🖥️ Screen share stopped by:', userId);
    });

    // Chat messages
    this.signalRService.meetingMessageReceived$.subscribe((data: any) => {
      console.log('💬 Chat message received:', data);
      this.ngZone.run(() => {
        // Skip messages from self
        if (data.userId === this.oisMeetUserId) {
          console.log('Skipping own message');
          return;
        }

        // Add message to chat (only for other users)
        this.chatMessages.push({
          id: data.id || Date.now().toString(),
          sender: data.userName,
          senderId: data.userId,
          message: data.message,
          timestamp: new Date(data.timestamp),
          isMe: false
        });
        this.scrollChatToBottom();
      });
    });

    // Meeting ended
    this.signalRService.meetingEnded$.subscribe(() => {
      console.log('🏁 Meeting ended by host');
      this.ngZone.run(() => {
        this.snackBar.open('Meeting ended by host', 'Close', { duration: 5000 });
        setTimeout(() => this.router.navigate(['/chat']), 3000);
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
      console.log('✅ Added participant:', newParticipant.name,
        'Muted:', newParticipant.isMuted,
        'VideoOff:', newParticipant.isVideoOff,
        'Host:', newParticipant.isHost);
    } else {
      // Update existing participant's media states
      existingParticipant.isMuted = !participant.isAudioEnabled;
      existingParticipant.isVideoOff = !participant.isVideoEnabled;
      existingParticipant.connectionId = participant.connectionId;
      existingParticipant.isHost = participant.userId === this.meetingDetails?.hostId;

      // Force change detection
      this.participants = [...this.participants];

      console.log('🔄 Updated participant:', existingParticipant.name,
        'Muted:', existingParticipant.isMuted,
        'VideoOff:', existingParticipant.isVideoOff,
        'Host:', existingParticipant.isHost);
    }
  }

  removeParticipant(connectionId: string) {
    this.participants = this.participants.filter(p => p.connectionId !== connectionId);
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
      setTimeout(() => this.flushPendingSignals(fromConnectionId), 50);

    } else {
      console.log('Participant not found yet, checking participants list:',
        this.participants.map(p => ({ id: p.connectionId, name: p.name })));

      // The participant list should arrive very soon
      // Check every 200ms for up to 3 seconds
      let attempts = 0;
      const maxAttempts = 15; // 3 seconds total

      const checkInterval = setInterval(() => {
        attempts++;
        participant = this.participants.find(p => p.connectionId === fromConnectionId);

        if (participant) {
          clearInterval(checkInterval);
          console.log(`Found participant after ${attempts * 200}ms:`, participant.name);

          if (!this.peers.has(fromConnectionId)) {
            this.createPeer(fromConnectionId, participant.name, false);
          }

          setTimeout(() => this.flushPendingSignals(fromConnectionId), 50);

        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.log('Timed out waiting for participant, creating peer with connectionId');

          // Create peer with connectionId as name as last resort
          if (!this.peers.has(fromConnectionId)) {
            this.createPeer(fromConnectionId, `User-${fromConnectionId.substring(0, 5)}`, false);
          }

          setTimeout(() => this.flushPendingSignals(fromConnectionId), 50);
        }
      }, 200);
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
      // For now we focus on AUDIO only: create (or reuse) a hidden <audio> element per connection.
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
      audioElement.play().catch(err => {
        console.warn('Error playing remote audio stream:', err);
      });

      console.log('Remote audio stream set and playing for:', userName);
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

    if (this.mediaStream) {
      const videoTracks = this.mediaStream.getVideoTracks();

      if (videoTracks.length > 0) {
        // If we have video tracks, just enable/disable them
        videoTracks.forEach(track => track.enabled = !this.isVideoOff);
        console.log('Video tracks enabled:', !this.isVideoOff);
      } else if (!this.isVideoOff) {
        // If turning video on but no video tracks, need to get camera
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const videoTrack = newStream.getVideoTracks()[0];
          this.mediaStream.addTrack(videoTrack);

          if (this.localVideo) {
            this.localVideo.nativeElement.muted = true;
            this.localVideo.nativeElement.volume = 0;
            this.localVideo.nativeElement.srcObject = this.mediaStream;
          }
        } catch (err) {
          console.error('Error starting camera:', err);
          this.isVideoOff = true; // Revert if failed
          this.snackBar.open('Could not start camera', 'Close', { duration: 3000 });
        }
      }
    }

    await this.signalRService.toggleVideo(this.meetingId, !this.isVideoOff);
    console.log('Video toggle sent to server:', !this.isVideoOff);
    this.refreshTooltips();
  }

  async toggleScreenShare() {
    if (this.livekitActive) {
      if (!this.isScreenSharing) {
        try {
          console.log('Starting screen share (LiveKit)');
          this.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
          });

          const screenTrack = this.screenStream.getVideoTracks()[0];
          this.localLivekitScreenShareTrackSid = await this.livekitService.publishScreenShareTrack(screenTrack);

          this.isScreenSharing = true;
          this.screenShareOwnerName = 'Your Screen';
          if (this.screenShareVideo) {
            this.screenShareVideo.nativeElement.srcObject = this.screenStream;
          }

          await this.signalRService.startScreenShare(this.meetingId);

          screenTrack.onended = () => {
            console.log('Screen share ended by user');
            this.stopScreenSharing();
          };
        } catch (error) {
          console.error('Error sharing screen (LiveKit):', error);
        }
      } else {
        await this.stopScreenSharing();
      }
      this.refreshTooltips();
      return;
    }

    if (!this.isScreenSharing) {
      try {
        console.log('Starting screen share');
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        this.isScreenSharing = true;
        if (this.screenShareVideo) {
          this.screenShareVideo.nativeElement.srcObject = this.screenStream;
        }

        const videoTrack = this.mediaStream?.getVideoTracks()[0];
        if (videoTrack) this.mediaStream?.removeTrack(videoTrack);

        const screenTrack = this.screenStream.getVideoTracks()[0];
        this.mediaStream?.addTrack(screenTrack);

        await this.signalRService.startScreenShare(this.meetingId);
        console.log('Screen share started');

        this.screenStream.getVideoTracks()[0].onended = () => {
          console.log('Screen share ended by user');
          this.stopScreenSharing();
        };
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      await this.stopScreenSharing();
    }
    this.refreshTooltips();
  }

  private async stopScreenSharing() {
    console.log('Stopping screen share');

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
      const screenTrack = this.mediaStream.getVideoTracks()[0];
      if (screenTrack) this.mediaStream.removeTrack(screenTrack);

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const videoTrack = newStream.getVideoTracks()[0];
        this.mediaStream.addTrack(videoTrack);
      } catch (err) {
        console.error('Error restarting camera:', err);
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

  async toggleRecording() {
    if (!this.isRecording) {
      await this.startMeetingRecording();
    } else {
      await this.stopMeetingRecording();
    }
    this.refreshTooltips();
  }

  setSidebarTab(tab: 'chat' | 'transcription'): void {
    this.activeSidebarTab = tab;

    if (tab === 'chat') {
      this.scrollChatToBottom();
    }
  }

  private async startMeetingRecording() {
    if (!this.mediaStream) {
      this.snackBar.open('No audio stream available', 'Close', { duration: 3000 });
      return;
    }

    const audioTracks = this.mediaStream.getAudioTracks();
    const hasLocalAudio = audioTracks.length > 0;
    const hasRemoteAudio = this.remoteAudioStreams.size > 0;

    if (!hasLocalAudio && !hasRemoteAudio) {
      this.snackBar.open('No audio sources available for recording', 'Close', { duration: 3000 });
      return;
    }

    console.log(`🎙️ Starting recording with local audio: ${hasLocalAudio}, remote streams: ${this.remoteAudioStreams.size}`);

    const started = await this.audioRecorderService.startRecordingFromMeeting(this.mediaStream);

    // Fallback: also add any already-tracked remote streams (covers edge cases where
    // DOM audio elements aren't found yet even though streams are present).
    if (started && this.remoteAudioStreams.size > 0) {
      this.remoteAudioStreams.forEach((stream, id) => {
        this.audioRecorderService.addRemoteStream(id, stream);
      });
    }

    if (started) {
      this.isRecording = true;
      this.snackBar.open('Recording started', 'Close', { duration: 2000 });
      console.log('🎙️ Meeting recording started');
    } else {
      this.snackBar.open('Failed to start recording', 'Close', { duration: 3000 });
    }
  }

  private async stopMeetingRecording() {
    // Requirement: after stopping recording, open the sidebar and select Transcription tab
    this.showChat = true;
    this.activeSidebarTab = 'transcription';
    this.transcriptionLoading = true;
    this.transcriptionError = null;
    this.transcriptionSegments = [];

    const audioBlob = await this.audioRecorderService.stopRecording();

    if (audioBlob) {
      this.isRecording = false;
      this.snackBar.open('Recording stopped. Saving...', 'Close', { duration: 2000 });

      const result = await this.audioRecorderService.saveRecordingAsWav(audioBlob, this.meetingId);

      if (result.success) {
        if (result.filePath) {
          this.snackBar.open(`Recording saved: ${result.filePath}`, 'Close', { duration: 5000 });
        } else {
          this.snackBar.open('Recording saved successfully', 'Close', { duration: 3000 });
        }
        console.log('🎙️ Meeting recording saved:', result.filePath);
      } else if (!result.canceled) {
        this.snackBar.open(`Failed to save recording: ${result.error}`, 'Close', { duration: 5000 });
      }
    } else {
      this.isRecording = false;
      this.transcriptionLoading = false;
      this.snackBar.open('No recording data available', 'Close', { duration: 3000 });
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

  leaveMeeting() {
    console.log('Leaving meeting');
    if (confirm('Are you sure you want to leave the meeting?')) {
      if (!this.isHost) {
        this.meetingService.leaveMeeting(this.meetingId, this.oisMeetUserId).subscribe();
      }
      this.signalRService.leaveMeeting(this.meetingId, this.oisMeetUserId);
      this.router.navigate(['/chat']);
    }
  }

  endMeeting() {
    console.log('Ending meeting');
    if (this.isHost && confirm('End meeting for everyone?')) {
      this.meetingService.endMeeting(this.meetingId, this.oisMeetUserId).subscribe({
        next: () => {
          this.signalRService.endMeeting(this.meetingId, this.oisMeetUserId);
          this.router.navigate(['/chat']);
        }
      });
    }
  }

  muteParticipant(participantId: string) {
    console.log('Mute participant:', participantId);
    // Implement if needed
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
    setTimeout(() => {
      if (this.chatMessagesContainer) {
        this.chatMessagesContainer.nativeElement.scrollTop =
          this.chatMessagesContainer.nativeElement.scrollHeight;
      }
    }, 100);
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
    setTimeout(() => this.initializeTooltips(), 100);
  }

  getParticipantGridColumns(): number {
    const count = this.participants.length + 1;
    if (this.isScreenSharing) return 1;
    if (count <= 2) return 1;
    if (count <= 4) return 2;
    if (count <= 9) return 3;
    return 4;
  }

  getInitials(name: string): string {
    if (!name) return '';
    const words = name.trim().split(' ');
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  }

  getEmptyTileCount(): number {
    if (this.isScreenSharing) return 0;
    const columns = this.getParticipantGridColumns();
    const totalSlots = columns * columns;
    const filledSlots = this.participants.length + 1;
    return Math.max(0, totalSlots - filledSlots);
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

  private getRandomColor(str: string): string {
    const colors = ['#1a73e8', '#e91e63', '#4caf50', '#ff9800', '#9c27b0', '#00bcd4', '#f44336', '#3f51b5'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  trackLiveSegment(_index: number, seg: LiveTranscriptionSegment): string {
    return seg.id;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  LIVE TRANSCRIPTION METHODS
  // ════════════════════════════════════════════════════════════════════════════
  async toggleLiveTranscription(): Promise<void> {
    if (this.isLiveTranscriptionOn) {
      // ── Turn OFF ──
      this.isLiveTranscriptionOn = false;
      this.liveTranscriptionService.stop();
      this.liveTranscriptionError = null;
    } else {
      // ── Turn ON ──
      if (!this.mediaStream) {
        this.snackBar.open('Microphone not available for live transcription', 'Close', { duration: 3000 });
        return;
      }
      // const aiBase: string = ((environment as any).aiApiBaseUrl || 'http://192.168.1.47:8001')
      const aiBase: string = ('http://192.168.1.47:8001')
        .toString()
        .trim()
        .replace(/\/+$/, '');
      const wsUrl = aiBase.replace(/^http/, 'ws') + '/ws/transcribe';

      this.isLiveTranscriptionOn = true;
      this.showLiveTranscriptionPanel = true;
      this.liveTranscriptionError = null;

      await this.liveTranscriptionService.start(this.mediaStream, wsUrl);
    }
  }

  clearLiveTranscription(): void {
    this.liveTranscriptionService.clearSegments();
  }

  private scrollLiveTranscriptionToBottom(): void {
    setTimeout(() => {
      const el = document.getElementById('live-transcription-scroll');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 60);
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
}

interface ChatMessage {
  id: string;
  sender: string;
  senderId: string;
  message: string;
  timestamp: Date;
  isMe: boolean;
}
