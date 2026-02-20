import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

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
      isMuted: true,
      isVideoOff: false,
      isHost: false,
      isSpeaking: false,
      avatarColor: '#e91e63'
    },
    {
      id: '3',
      name: 'Emma Watson',
      isMuted: false,
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    // private webrtcService: WebRTCService,
    // private meetingService: MeetingService
  ) { }

  ngOnInit() {
    this.meetingId =
      this.route.snapshot.paramMap.get('meetingId') ||
      this.generateMeetingId();

    this.isHost =
      this.route.snapshot.queryParamMap.get('host') === 'true';

    const micParam = this.route.snapshot.queryParamMap.get('mic');
    const camParam = this.route.snapshot.queryParamMap.get('cam');

    // IMPORTANT:
    // micParam = true → mic should be ON → isMuted = false
    // micParam = false → mic should be OFF → isMuted = true

    this.isMuted = micParam === 'false';
    this.isVideoOff = camParam === 'false';

    // Now initialize media AFTER setting flags
    this.initializeLocalMedia();

    this.subscriptions.push(
      this.route.queryParams.subscribe(params => {
        if (params['topic']) {
          this.meetingTopic = params['topic'];
        }
      })
    );
  }




  ngAfterViewInit() {
    // Set up local video after view init
    if (this.localVideo && this.mediaStream) {
      this.localVideo.nativeElement.srcObject = this.mediaStream;
    }
  }

  ngOnDestroy() {
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
    if (count <= 2) return 1;
    if (count <= 4) return 2;
    if (count <= 9) return 3;
    return 4;
  }

  // Add this method to calculate empty tiles for grid layout
  getEmptyTileCount(): number {
    const totalSlots = Math.pow(this.getParticipantGridColumns(), 2);
    const filledSlots = this.participants.length + (this.isScreenSharing ? 1 : 0);
    return Math.max(0, totalSlots - filledSlots);
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
