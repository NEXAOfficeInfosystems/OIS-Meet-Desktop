import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import * as bootstrap from 'bootstrap';
import { SessionService } from '../../core/services/session.service';
import { Clipboard } from '@angular/cdk/clipboard';
// Services (to be implemented)
// import { WebRTCService } from '../../core/services/webrtc.service';
// import { MeetingService } from '../../core/services/meeting.service';

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

  // Meeting Info
  meetingId: string = '';
  meetingTopic: string = 'OIS Meet';
  isHost: boolean = false;

  // UI States
  isMuted: boolean = false;
  isVideoOff: boolean = false;
  isScreenSharing: boolean = false;
  isRecording: boolean = false;
  showParticipants: boolean = false;
  showChat: boolean = false;
  showSettings: boolean = false;
  private tooltips: bootstrap.Tooltip[] = [];

  meetingDuration: number = 0;
  private timerInterval: any;
  formattedDuration: string = '00:00';

  // Participants
  participants: Participant[] = [
    {
      id: '1',
      name: 'You',
      isMuted: false,
      isVideoOff: false,
      isHost: true,
      isSpeaking: false,
      avatarColor: '#1a73e8'
    },
    {
      id: '2',
      name: 'John Smith',
      isMuted: false,
      isVideoOff: true,
      isHost: false,
      isSpeaking: false,
      avatarColor: '#e91e63'
    },
    {
      id: '3',
      name: 'Emma Watson',
      isMuted: true,
      isVideoOff: true,
      isHost: false,
      isSpeaking: false,
      avatarColor: '#4caf50'
    },
  ];

  // Chat Messages
  chatMessages: ChatMessage[] = [
    {
      id: '1',
      sender: 'John Smith',
      senderId: '2',
      message: 'Hello everyone!',
      timestamp: new Date(),
      isMe: false
    },
    {
      id: '2',
      sender: 'You',
      senderId: '1',
      message: 'Hi John, glad you could join!',
      timestamp: new Date(),
      isMe: true
    }
  ];
  newMessage: string = '';

  // Grid Layout
  gridLayout: 'grid' | 'speaker' = 'grid';

  private subscriptions: Subscription[] = [];
  private mediaStream: MediaStream | null = null;

  isMicOn = false;
  isCamOn = false;

  userFullName: any;
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private sessionService: SessionService,
        private clipboard: Clipboard,
    // private webrtcService: WebRTCService,
    // private meetingService: MeetingService
  ) {
    this.userFullName = this.sessionService.getFullName();
  }

    ngOnInit() {
    this.meetingId =
      this.route.snapshot.paramMap.get('meetingId') ||
      this.generateMeetingId();

    this.isHost =
      this.route.snapshot.queryParamMap.get('host') === 'true';

    const micParam = this.route.snapshot.queryParamMap.get('mic');
    const camParam = this.route.snapshot.queryParamMap.get('cam');

    this.isMuted = micParam === 'false';
    this.isVideoOff = camParam === 'false';

    // Initialize media
    this.initializeLocalMedia();

    // Start the timer
    this.startTimer();

    this.subscriptions.push(
      this.route.queryParams.subscribe(params => {
        if (params['topic']) {
          this.meetingTopic = params['topic'];
        }
      })
    );
  }




  ngAfterViewInit() {
    if (this.localVideo && this.mediaStream) {
      this.localVideo.nativeElement.srcObject = this.mediaStream;
    }

    setTimeout(() => {
      this.initializeTooltips();
    });
  }

private initializeTooltips(): void {
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');

  tooltipTriggerList.forEach((el: Element) => {
    // Dispose existing tooltip if already created
    const existing = bootstrap.Tooltip.getInstance(el);
    if (existing) {
      existing.dispose();
    }

    // Create new tooltip with options
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
    // First dispose all existing tooltips
    this.tooltips.forEach(t => t.dispose());
    this.tooltips = [];

    // Small delay to ensure DOM updates
    setTimeout(() => {
      this.initializeTooltips();
    });
  }


  ngOnDestroy() {
     this.stopTimer();
      this.tooltips.forEach(t => t.dispose());
  this.tooltips = [];

    // Clean up media streams
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private async initializeLocalMedia() {
    try {

      // If both are OFF → don't request anything
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

    } catch (error) {
      console.error('Error accessing media devices:', error);
      this.snackBar.open('Could not access camera or microphone', 'Close', {
        duration: 3000
      });
    }
  }




  generateMeetingId(): string {
    return 'OIS-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Meeting Controls
  async toggleMute() {
    this.isMuted = !this.isMuted;

    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
      }

      if (this.isVideoOff && this.isMuted) {
        this.mediaStream = null;
        if (this.localVideo) {
          this.localVideo.nativeElement.srcObject = null;
        }
        return;
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: !this.isVideoOff,
        audio: !this.isMuted
      });

      if (this.localVideo) {
        this.localVideo.nativeElement.srcObject = this.mediaStream;
      }

    } catch (error) {
      console.error('Error toggling mic:', error);
    }
    this.refreshTooltips();
  }


  async toggleVideo() {
    this.isVideoOff = !this.isVideoOff;

    try {
      // Stop existing stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
      }

      // If both off → no request
      if (this.isVideoOff && this.isMuted) {
        this.mediaStream = null;
        if (this.localVideo) {
          this.localVideo.nativeElement.srcObject = null;
        }
        return;
      }

      // Recreate stream properly
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: !this.isVideoOff,
        audio: !this.isMuted
      });

      if (this.localVideo) {
        this.localVideo.nativeElement.srcObject = this.mediaStream;
      }

    } catch (error) {
      console.error('Error toggling video:', error);
    }
     this.refreshTooltips();
  }



  async toggleScreenShare() {
    if (!this.isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });

        // Handle screen sharing stream
        this.isScreenSharing = true;
        if (this.screenShareVideo) {
          this.screenShareVideo.nativeElement.srcObject = screenStream;
        }

        // Stop screen sharing when user clicks "Stop sharing"
        screenStream.getVideoTracks()[0].onended = () => {
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
    if (this.screenShareVideo) {
      const stream = this.screenShareVideo.nativeElement.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      this.screenShareVideo.nativeElement.srcObject = null;
    }
  }

  toggleRecording() {
    this.isRecording = !this.isRecording;
     this.refreshTooltips();
    // Implement recording logic
  }

  leaveMeeting() {
    // Confirm before leaving
    if (confirm('Are you sure you want to leave the meeting?')) {
      this.router.navigate(['/chat']);
    }
  }

  endMeeting() {
    if (this.isHost && confirm('End meeting for everyone?')) {
      // End meeting logic
      this.router.navigate(['/chat']);
    }
  }

  // Participant Management
  muteParticipant(participantId: string) {
    // Implement mute for remote participant
  }

  removeParticipant(participantId: string) {
    // Implement remove participant (host only)
  }

  // Chat Functions
  sendMessage() {
    if (!this.newMessage.trim()) return;

    const message: ChatMessage = {
      id: Date.now().toString(),
      sender: 'You',
      senderId: '1',
      message: this.newMessage,
      timestamp: new Date(),
      isMe: true
    };

    this.chatMessages.push(message);
    this.newMessage = '';

    // Scroll to bottom (would need ViewChild for messages container)
  }

  // Layout Functions
  setGridLayout(layout: 'grid' | 'speaker') {
    this.gridLayout = layout;
  }

  copyMeetingLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    this.snackBar.open('Meeting link copied!', 'Close', {
      duration: 2000
    });
  }

  // Helper for participant grid
getParticipantGridColumns(): number {
  const count = this.participants.length;
  if (this.isScreenSharing) {
    return 1; // When screen sharing, grid is 1 column
  }
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

getInitials(name: string): string {
  if (!name) return '';

  const words = name.trim().split(' ');

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  return (
    words[0].charAt(0) +
    words[words.length - 1].charAt(0)
  ).toUpperCase();
}

getEmptyTileCount(): number {
  if (this.isScreenSharing) return 0; // No empty tiles when screen sharing

  const columns = this.getParticipantGridColumns();
  const rows = columns; // Square grid
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

  /**
   * Copy meeting code to clipboard
   */
  copyMeetingCode(event: Event): void {
    event.preventDefault();

    const meetingCode = this.meetingId;
    const meetingLink = window.location.href;

    // Copy both code and link
    // this.clipboard.copy(`Meeting Code: ${meetingCode}\nMeeting Link: ${meetingLink}`);
    this.clipboard.copy(`Meeting Code: ${meetingCode}`);

    this.snackBar.open('Meeting code copied to clipboard!', 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  /**
   * Share meeting details to Microsoft Teams
   */
  shareToTeams(event: Event): void {
    event.preventDefault();

    const meetingSubject = encodeURIComponent(this.meetingTopic || 'OIS Meet');
    const meetingBody = encodeURIComponent(
      `Join OIS Meet meeting\n\n` +
      `Meeting Code: ${this.meetingId}\n` +
      `Meeting Link: ${window.location.href}\n\n` +
      `Click the link to join the meeting.`
    );

    // Teams deep link
    const teamsDeepLink = `https://teams.microsoft.com/l/meeting/new?subject=${meetingSubject}&body=${meetingBody}`;

    // Try to open Teams desktop app first, fallback to web
    this.openTeamsApp(teamsDeepLink);
  }

  /**
   * Share meeting details via Email
   */
  shareToMail(event: Event): void {
    event.preventDefault();

    const subject = encodeURIComponent(`Join OIS Meet: ${this.meetingTopic || 'Meeting'}`);
    const body = encodeURIComponent(
      `You're invited to join an OIS Meet meeting.\n\n` +
      `Meeting Code: ${this.meetingId}\n` +
      `Meeting Link: ${window.location.href}\n\n` +
      `Join using the link above or enter the meeting code in OIS Meet app.`
    );

    // Open default mail client
    window.location.href = `mailto:?subject=${subject}&body=${body}`;

    this.snackBar.open('Email client opened!', 'Close', {
      duration: 2000
    });
  }

  /**
   * Open Teams app with meeting details
   */
  private openTeamsApp(deepLink: string): void {
    // Try to open desktop app first (Electron environment)
    // if (window.navigator && window.navigator.msLaunchUri) {
    //   // Windows 10+
    //   window.navigator.msLaunchUri(
    //     deepLink,
    //     () => {
    //       console.log('Teams desktop app opened');
    //     },
    //     () => {
    //       // Fallback to web
    //       window.open(deepLink, '_blank');
    //     }
    //   );
    // } else {
    //   // For other platforms, try custom protocol first
    //   const iframe = document.createElement('iframe');
    //   iframe.style.display = 'none';
    //   document.body.appendChild(iframe);

    //   try {
    //     // Try to open msteams protocol
    //     iframe.src = 'msteams:/';
    //     setTimeout(() => {
    //       document.body.removeChild(iframe);

    //       // After 500ms, if Teams didn't open, redirect to web version
    //       setTimeout(() => {
    //         window.open(deepLink, '_blank');
    //       }, 500);
    //     }, 0);
    //   } catch (e) {
    //     document.body.removeChild(iframe);
    //     window.open(deepLink, '_blank');
    //   }
    // }

    this.snackBar.open('Opening Microsoft Teams...', 'Close', {
      duration: 2000
    });
  }

  /**
   * Share to specific Teams channel/user (optional advanced feature)
   */
  shareToTeamsChannel(channelId?: string): void {
    // You can implement more advanced Teams integration here
    // For deep linking to specific channels or chats
    const baseUrl = 'https://teams.microsoft.com/l/chat/0/0?';
    const users = encodeURIComponent('user@example.com'); // Add user email
    const message = encodeURIComponent(`Join meeting: ${window.location.href}`);

    const teamsChatLink = `${baseUrl}users=${users}&message=${message}`;
    window.open(teamsChatLink, '_blank');
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
