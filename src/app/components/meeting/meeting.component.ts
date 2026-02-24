import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription, interval, forkJoin, Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import * as bootstrap from 'bootstrap';
import { Clipboard } from '@angular/cdk/clipboard';

// Services
import { SessionService } from '../../core/services/session.service';
import { MeetingService, MeetingResponse, ParticipantResponse } from '../../core/services/meeting.service';
import { SignalRService } from '../../core/services/signalr.service';

@Component({
  selector: 'app-meeting',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatSnackBarModule],
  templateUrl: './meeting.component.html',
  styleUrls: ['./meeting.component.scss']
})
export class MeetingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('screenShareVideo') screenShareVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('chatMessagesContainer') chatMessagesContainer!: ElementRef;

  // Meeting Info
  meetingId: string = '';
  meetingTopic: string = 'OIS Meet';
  meetingDetails: MeetingResponse | null = null;
  isHost: boolean = false;

  // UI States
  isMuted: boolean = false;
  isVideoOff: boolean = false;
  isScreenSharing: boolean = false;
  isRecording: boolean = false;
  showParticipants: boolean = false;
  showChat: boolean = false;
  showSettings: boolean = false;
  isLoading: boolean = true;

  private tooltips: bootstrap.Tooltip[] = [];

  // Timer
  meetingDuration: number = 0;
  private timerInterval: any;
  formattedDuration: string = '00:00';

  // Participants
  participants: Participant[] = [];
  private participantsMap = new Map<string, Participant>();

  // Chat Messages
  chatMessages: ChatMessage[] = [];
  newMessage: string = '';
  private messageId = 0;

  // Grid Layout
  gridLayout: 'grid' | 'speaker' = 'grid';

  // Subscriptions
  private subscriptions: Subscription[] = [];
  private mediaStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private destroy$ = new Subject<void>();

  // User Info
  userFullName: string;
  userId: string;
  private pollingSubscription: Subscription | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private sessionService: SessionService,
    private clipboard: Clipboard,
    private meetingService: MeetingService,
    private signalRService: SignalRService
  ) {
    this.userFullName = this.sessionService.getFullName() || 'User';
    this.userId = this.sessionService.getOISMeetUserId() || '';
  }

  ngOnInit() {
    this.meetingId = this.route.snapshot.paramMap.get('meetingId') || '';
    this.isHost = this.route.snapshot.queryParamMap.get('host') === 'true';

    const micParam = this.route.snapshot.queryParamMap.get('mic');
    const camParam = this.route.snapshot.queryParamMap.get('cam');

    this.isMuted = micParam === 'false';
    this.isVideoOff = camParam === 'false';

    if (!this.meetingId) {
      this.snackBar.open('Invalid meeting ID', 'Close', { duration: 3000 });
      this.router.navigate(['/chat']);
      return;
    }

    // Load meeting details
    this.loadMeetingDetails();

    // Initialize media
    this.initializeLocalMedia();

    // Start the timer
    this.startTimer();

    // Setup SignalR for real-time updates
    this.setupSignalR();

    // Start polling for participants (fallback if SignalR not available)
    this.startPolling();

    this.subscriptions.push(
      this.route.queryParams.subscribe(params => {
        if (params['topic']) {
          this.meetingTopic = params['topic'];
        }
      })
    );
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initializeTooltips();
    });
  }

  ngOnDestroy() {
    this.stopTimer();
    this.stopPolling();

    this.tooltips.forEach(t => t.dispose());
    this.tooltips = [];

    // Leave meeting if not host, or end if host
    if (this.isHost) {
      this.endMeetingForAll();
    } else {
      this.leaveMeetingForSelf();
    }

    // Clean up media streams
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
    }

    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* ===================== MEETING API METHODS ===================== */

  private loadMeetingDetails() {
    this.isLoading = true;

    this.meetingService.getMeeting(this.meetingId).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.meetingDetails = response.data;
          this.meetingTopic = this.meetingDetails?.topic || 'OIS Meet';

          // Load participants
          this.loadParticipants();
        } else {
          this.snackBar.open('Meeting not found', 'Close', { duration: 3000 });
          setTimeout(() => this.router.navigate(['/chat']), 2000);
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading meeting:', error);
        this.snackBar.open('Error loading meeting details', 'Close', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  private loadParticipants() {
  this.meetingService.getMeetingParticipants(this.meetingId).subscribe({
    next: (response: any) => {
      if (response.success) {
        this.updateParticipantsList(response.data);
      }
    },
    error: (error) => console.error('Error loading participants:', error)
  });
}

  private updateParticipantsList(participants: ParticipantResponse[]) {
    this.participants = participants.map(p => ({
      id: p.userId,
      name: p.userName,
      isMuted: p.isMuted,
      isVideoOff: p.isVideoOff,
      isHost: p.userId === this.meetingDetails?.hostId,
      isSpeaking: false,
      avatarColor: this.getRandomColor(p.userId)
    }));

    // Update map for quick lookup
    this.participantsMap.clear();
    this.participants.forEach(p => this.participantsMap.set(p.id, p));
  }

  private leaveMeetingForSelf() {
    console.log('Leaving meeting for self',this.userId);
    if (!this.userId || !this.meetingId) return;

    this.meetingService.leaveMeeting(this.meetingId, this.userId).subscribe({
      next: () => console.log('Left meeting successfully'),
      error: (error) => console.error('Error leaving meeting:', error)
    });
  }

  private endMeetingForAll() {
    console.log('Ending meeting for all participants',this.userId);
    if (!this.userId || !this.meetingId) return;

    this.meetingService.endMeeting(this.meetingId, this.userId).subscribe({
      next: () => console.log('Meeting ended successfully'),
      error: (error) => console.error('Error ending meeting:', error)
    });
  }

  /* ===================== SIGNALR SETUP ===================== */

  private setupSignalR() {
    // Start SignalR connection
    this.signalRService.startConnection(this.userId);

    // Listen for new participants
    this.signalRService.participantJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe((participant: any) => {
        this.handleParticipantJoined(participant);
      });

    // Listen for participants leaving
    this.signalRService.participantLeft$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        this.handleParticipantLeft(data.userId);
      });

    // Listen for participant status changes
    this.signalRService.participantStatusChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        this.handleParticipantStatusChange(data);
      });

    // Listen for chat messages
    this.signalRService.meetingMessageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message: any) => {
        this.handleNewMessage(message);
      });

    // Listen for screen sharing
    this.signalRService.screenSharingChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
        if (data.userId !== this.userId) {
          // Handle remote screen sharing
          console.log('Remote user sharing screen:', data);
        }
      });

    // Join meeting room
    setTimeout(() => {
      this.signalRService.joinMeeting(this.meetingId);
    }, 1000);
  }

  private handleParticipantJoined(participant: any) {
    if (!this.participantsMap.has(participant.userId)) {
      const newParticipant: Participant = {
        id: participant.userId,
        name: participant.userName,
        isMuted: false,
        isVideoOff: false,
        isHost: participant.userId === this.meetingDetails?.hostId,
        isSpeaking: false,
        avatarColor: this.getRandomColor(participant.userId)
      };

      this.participants.push(newParticipant);
      this.participantsMap.set(participant.userId, newParticipant);

      this.snackBar.open(`${participant.userName} joined`, 'Close', { duration: 2000 });
    }
  }

  private handleParticipantLeft(userId: string) {
    const participant = this.participantsMap.get(userId);
    if (participant) {
      this.participants = this.participants.filter(p => p.id !== userId);
      this.participantsMap.delete(userId);

      this.snackBar.open(`${participant.name} left`, 'Close', { duration: 2000 });
    }
  }

  private handleParticipantStatusChange(data: any) {
    const participant = this.participantsMap.get(data.userId);
    if (participant) {
      if (data.isMuted !== undefined) participant.isMuted = data.isMuted;
      if (data.isVideoOff !== undefined) participant.isVideoOff = data.isVideoOff;
    }
  }

  private handleNewMessage(message: any) {
    const chatMessage: ChatMessage = {
      id: (++this.messageId).toString(),
      sender: message.userName,
      senderId: message.userId,
      message: message.content,
      timestamp: new Date(),
      isMe: message.userId === this.userId
    };

    this.chatMessages.push(chatMessage);
    this.scrollChatToBottom();
  }

  /* ===================== POLLING (FALLBACK) ===================== */

  private startPolling() {
    this.pollingSubscription = interval(5000).subscribe(() => {
      if (this.meetingId) {
        this.loadParticipants();
      }
    });
  }

  private stopPolling() {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
  }

  /* ===================== MEDIA CONTROLS ===================== */

  private async initializeLocalMedia() {
    try {
      if (this.isVideoOff && this.isMuted) {
        console.log('No media requested');
        return;
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: !this.isVideoOff,
        audio: !this.isMuted
      });

      if (this.localVideo) {
        this.localVideo.nativeElement.srcObject = this.mediaStream;
      }

      // Update status on server
      this.updateParticipantStatus();
    } catch (error) {
      console.error('Error accessing media devices:', error);
      this.snackBar.open('Could not access camera or microphone', 'Close', {
        duration: 3000
      });
    }
  }

  async toggleMute() {
    this.isMuted = !this.isMuted;

    try {
      if (this.mediaStream) {
        const audioTracks = this.mediaStream.getAudioTracks();
        audioTracks.forEach(track => track.enabled = !this.isMuted);
      }

      // Update status on server
      this.updateParticipantStatus({ isMuted: this.isMuted });

      // Send via SignalR
      this.signalRService.updateParticipantStatus(this.meetingId, {
        isMuted: this.isMuted
      });

    } catch (error) {
      console.error('Error toggling mute:', error);
    }
    this.refreshTooltips();
  }

  async toggleVideo() {
    this.isVideoOff = !this.isVideoOff;

    try {
      if (this.mediaStream) {
        const videoTracks = this.mediaStream.getVideoTracks();
        videoTracks.forEach(track => track.enabled = !this.isVideoOff);
      }

      // If both off, stop stream
      if (this.isVideoOff && this.isMuted && this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
        if (this.localVideo) {
          this.localVideo.nativeElement.srcObject = null;
        }
      } else if (!this.mediaStream) {
        // Recreate stream if needed
        await this.initializeLocalMedia();
      }

      // Update status on server
      this.updateParticipantStatus({ isVideoOff: this.isVideoOff });

      // Send via SignalR
      this.signalRService.updateParticipantStatus(this.meetingId, {
        isVideoOff: this.isVideoOff
      });

    } catch (error) {
      console.error('Error toggling video:', error);
    }
    this.refreshTooltips();
  }

  private updateParticipantStatus(updates?: any) {
    if (!this.userId || !this.meetingId) return;

    const data = {
      isMuted: this.isMuted,
      isVideoOff: this.isVideoOff,
      ...updates
    };

    this.meetingService.updateParticipantStatus(this.meetingId, this.userId, data)
      .subscribe({
        error: (error) => console.error('Error updating status:', error)
      });
  }

  async toggleScreenShare() {
    if (!this.isScreenSharing) {
      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        this.isScreenSharing = true;
        if (this.screenShareVideo) {
          this.screenShareVideo.nativeElement.srcObject = this.screenStream;
        }

        // Notify others via SignalR
        this.signalRService.screenSharingStarted(this.meetingId);

        // Stop screen sharing when user clicks "Stop sharing"
        this.screenStream.getVideoTracks()[0].onended = () => {
          this.stopScreenSharing();
        };
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      this.stopScreenSharing();
    }
    this.refreshTooltips();
  }

  private stopScreenSharing() {
    this.isScreenSharing = false;
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    if (this.screenShareVideo) {
      this.screenShareVideo.nativeElement.srcObject = null;
    }

    // Notify others via SignalR
    this.signalRService.screenSharingStopped(this.meetingId);
  }

  toggleRecording() {
    this.isRecording = !this.isRecording;
    this.refreshTooltips();
    // Implement recording logic if needed
  }

  /* ===================== MEETING ACTIONS ===================== */

leaveMeeting() {
  if (confirm('Are you sure you want to leave the meeting?')) {
    const userId = this.sessionService.getOISMeetUserId();

    this.meetingService.leaveMeeting(this.meetingId, userId).subscribe({
      next: (response) => {
        if (response.success) {
          this.signalRService.leaveMeeting(this.meetingId);
          this.router.navigate(['/chat']);
        }
      },
      error: (error) => {
        console.error('Error leaving meeting:', error);
        this.router.navigate(['/chat']);
      }
    });
  }
}

endMeeting() {
  if (this.isHost && confirm('End meeting for everyone?')) {
    const userId = this.sessionService.getOISMeetUserId();

    this.meetingService.endMeeting(this.meetingId, userId).subscribe({
      next: (response) => {
        if (response.success) {
          this.signalRService.endMeeting(this.meetingId);
          this.router.navigate(['/chat']);
        }
      },
      error: (error) => {
        console.error('Error ending meeting:', error);
        this.router.navigate(['/chat']);
      }
    });
  }
}

  /* ===================== PARTICIPANT MANAGEMENT ===================== */

  muteParticipant(participantId: string) {
    if (!this.isHost) return;

    // Send mute command via SignalR
    this.signalRService.muteParticipant(this.meetingId, participantId);

    this.snackBar.open('Participant muted', 'Close', { duration: 2000 });
  }

  removeParticipant(participantId: string) {
    if (!this.isHost) return;

    if (confirm('Remove this participant from the meeting?')) {
      // Send remove command via SignalR
      this.signalRService.removeParticipant(this.meetingId, participantId);

      // Remove from local list
      this.participants = this.participants.filter(p => p.id !== participantId);
      this.participantsMap.delete(participantId);
    }
  }

  /* ===================== CHAT FUNCTIONS ===================== */

  sendMessage() {
    if (!this.newMessage.trim()) return;

    // Send via SignalR
    this.signalRService.sendMeetingMessage(this.meetingId, {
      content: this.newMessage,
      userName: this.userFullName,
      userId: this.userId
    });

    // Add to local list
    const message: ChatMessage = {
      id: (++this.messageId).toString(),
      sender: this.userFullName,
      senderId: this.userId,
      message: this.newMessage,
      timestamp: new Date(),
      isMe: true
    };

    this.chatMessages.push(message);
    this.newMessage = '';
    this.scrollChatToBottom();
  }

  private scrollChatToBottom() {
    setTimeout(() => {
      if (this.chatMessagesContainer) {
        const element = this.chatMessagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 100);
  }

  /* ===================== INVITE & SHARE ===================== */

  copyMeetingCode(event: Event): void {
    event.preventDefault();
    this.clipboard.copy(this.meetingId);

    this.snackBar.open('Meeting code copied to clipboard!', 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  copyMeetingLink(event: Event): void {
    event.preventDefault();
    const url = window.location.href;
    this.clipboard.copy(url);
    this.snackBar.open('Meeting link copied!', 'Close', {
      duration: 2000
    });
  }

  shareToTeams(event: Event): void {
    event.preventDefault();

    const meetingSubject = encodeURIComponent(this.meetingTopic || 'OIS Meet');
    const meetingBody = encodeURIComponent(
      `Join OIS Meet meeting\n\n` +
      `Meeting Code: ${this.meetingId}\n` +
      `Meeting Link: ${window.location.href}\n\n` +
      `Click the link to join the meeting.`
    );

    const teamsDeepLink = `https://teams.microsoft.com/l/meeting/new?subject=${meetingSubject}&body=${meetingBody}`;
    window.open(teamsDeepLink, '_blank');

    this.snackBar.open('Opening Microsoft Teams...', 'Close', {
      duration: 2000
    });
  }

  shareToMail(event: Event): void {
    event.preventDefault();

    const subject = encodeURIComponent(`Join OIS Meet: ${this.meetingTopic || 'Meeting'}`);
    const body = encodeURIComponent(
      `You're invited to join an OIS Meet meeting.\n\n` +
      `Meeting Code: ${this.meetingId}\n` +
      `Meeting Link: ${window.location.href}\n\n` +
      `Join using the link above or enter the meeting code in OIS Meet app.`
    );

    window.location.href = `mailto:?subject=${subject}&body=${body}`;

    this.snackBar.open('Email client opened!', 'Close', {
      duration: 2000
    });
  }

  /* ===================== UTILITY FUNCTIONS ===================== */

  private initializeTooltips(): void {
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');

    tooltipTriggerList.forEach((el: Element) => {
      const existing = bootstrap.Tooltip.getInstance(el);
      if (existing) existing.dispose();

      const tooltip = new bootstrap.Tooltip(el, {
        placement: 'top',
        trigger: 'hover',
        container: 'body',
        animation: true,
        delay: { show: 200, hide: 100 },
        html: false
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
    const count = this.participants.length;
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
    const rows = columns;
    const totalSlots = columns * rows;
    const filledSlots = this.participants.length;
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
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
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
}

// Interfaces
interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
  isVideoOff: boolean;
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
