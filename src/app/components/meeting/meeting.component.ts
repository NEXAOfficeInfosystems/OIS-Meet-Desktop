import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';
import * as bootstrap from 'bootstrap';
import SimplePeer from 'simple-peer';

// Services
import { SessionService } from '../../core/services/session.service';
import { MeetingService } from '../../core/services/meeting.service';
import { SignalRService, MeetingParticipant } from '../../core/services/signalr.service';
import { StorageService } from '../../core/services/storage.service';

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
  isMuted: boolean = false;
  isVideoOff: boolean = false;
  isScreenSharing: boolean = false;
  isRecording: boolean = false;
  showParticipants: boolean = false;
  showChat: boolean = false;
  isLoading: boolean = true;

  private tooltips: bootstrap.Tooltip[] = [];

  // Timer
  meetingDuration: number = 0;
  private timerInterval: any;
  formattedDuration: string = '00:00';

  // Participants
  participants: Participant[] = [];
  private peers: Map<string, any> = new Map();
  private remoteVideoElements: Map<string, HTMLVideoElement> = new Map();

  // Chat Messages
  chatMessages: ChatMessage[] = [];
  newMessage: string = '';

  // Grid Layout
  gridLayout: 'grid' | 'speaker' = 'grid';

  private mediaStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  // User Info
  userFullName: string;
  oisMeetUserId: string = '';
  private connectionId: string | null = null;

  private processedMessageIds: Set<string> = new Set();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private sessionService: SessionService,
    private clipboard: Clipboard,
    private meetingService: MeetingService,
    private signalRService: SignalRService,
    private ngZone: NgZone
  ) {
    this.userFullName = this.sessionService.getFullName() || 'User';
    this.oisMeetUserId = this.sessionService.getOISMeetUserId() || '';
    // this.oisMeetUserId = this.storageService.getItem('oisMeetUserId') || this.oisMeetUserId;
  }

 async ngOnInit() {
  console.log('🎥 MeetingComponent initialized');

  this.meetingId = this.route.snapshot.paramMap.get('meetingId') || '';
  this.isHost = this.route.snapshot.queryParamMap.get('host') === 'true';

  // Get mic and cam settings from query params
  const micParam = this.route.snapshot.queryParamMap.get('mic');
  const camParam = this.route.snapshot.queryParamMap.get('cam');

  // Set initial media states
  this.isMuted = micParam === 'false';
  this.isVideoOff = camParam === 'false';
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

  // Load meeting details
  await this.loadMeetingDetails();

  // Load existing participants via REST API
  await this.loadExistingParticipants();

  // Initialize media and join the meeting
  await this.initializeMedia();

  this.startTimer();
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

    this.signalRService.stopConnection();
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
      // Get media states from query params (passed from dialog)
      const requestVideo = !this.isVideoOff; // This comes from cam param
      const requestAudio = !this.isMuted;    // This comes from mic param

      console.log('Initializing media with:', { requestVideo, requestAudio });

      if (!requestVideo && !requestAudio) {
        console.log('No media requested, joining without media');
        // Pass the media states to joinMeeting
        await this.signalRService.joinMeeting(
          this.meetingId,
          this.oisMeetUserId,
          this.userFullName,
          requestAudio,  // Pass audio state
          requestVideo   // Pass video state
        );
        this.connectionId = this.signalRService.getConnectionId();
        return;
      }

      // Request media based on settings
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: requestVideo,
        audio: requestAudio
      });

      if (this.localVideo && requestVideo) {
        this.localVideo.nativeElement.srcObject = this.mediaStream;
        console.log('Local video set');
      }

      console.log('Joining meeting via SignalR...');
      // Pass the media states to joinMeeting
      await this.signalRService.joinMeeting(
        this.meetingId,
        this.oisMeetUserId,
        this.userFullName,
        requestAudio,  // Pass audio state
        requestVideo   // Pass video state
      );
      this.connectionId = this.signalRService.getConnectionId();
      console.log('Joined meeting, connectionId:', this.connectionId);

    } catch (error) {
      console.error('Error accessing media devices:', error);
      this.snackBar.open('Could not access camera or microphone', 'Close', { duration: 3000 });

      console.log('Joining meeting without media...');
      // Pass the media states even on error (will be false)
      await this.signalRService.joinMeeting(
        this.meetingId,
        this.oisMeetUserId,
        this.userFullName,
        false,  // Audio off on error
        false   // Video off on error
      );
      this.connectionId = this.signalRService.getConnectionId();
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

      // Create peer for this new participant
      if (participant.connectionId !== this.connectionId && this.mediaStream) {
        console.log('Creating peer for new participant:', participant.userName);
        setTimeout(() => {
          this.createPeer(participant.connectionId, participant.userName, true);
        }, 1000);
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
      this.removePeer(connectionId);
    });
  });

  this.signalRService.participantDisconnected$.subscribe(({ connectionId, userId }) => {
    console.log('🔌 Participant disconnected:', connectionId);
    this.ngZone.run(() => {
      this.removeParticipant(connectionId);
      this.removePeer(connectionId);
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
    const peer = new SimplePeer({
      initiator: initiator,
      trickle: false,
      stream: this.mediaStream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peer.on('signal', (signal: any) => {
      console.log('Peer signal generated for:', targetName);
      if (initiator) {
        this.signalRService.sendOffer(this.meetingId, targetConnectionId, signal);
      } else {
        this.signalRService.sendAnswer(this.meetingId, targetConnectionId, signal);
      }
    });

    peer.on('stream', (stream: MediaStream) => {
      console.log('Received stream from:', targetName);
      this.addRemoteVideo(targetConnectionId, stream, targetName);
    });

    peer.on('error', (err: Error) => {
      console.error('Peer error for', targetName, ':', err);
    });

    peer.on('connect', () => {
      console.log('Peer connected to:', targetName);
    });

    peer.on('close', () => {
      console.log('Peer closed for:', targetName);
      this.removeRemoteVideo(targetConnectionId);
    });

    this.peers.set(targetConnectionId, peer);
    console.log('Peer created and stored for:', targetName);

  } catch (error) {
    console.error('Error creating peer:', error);
  }
}

private handleOffer(fromConnectionId: string, offer: any) {
  console.log('Handling offer from:', fromConnectionId);

  // Check if we already have this participant
  let participant = this.participants.find(p => p.connectionId === fromConnectionId);

  if (participant) {
    console.log('Found participant immediately:', participant.name);

    if (!this.peers.has(fromConnectionId)) {
      console.log('Creating receiver peer for:', participant.name);
      this.createPeer(fromConnectionId, participant.name, false);
    }

    setTimeout(() => {
      const peer = this.peers.get(fromConnectionId);
      if (peer) {
        console.log('Signaling offer to peer');
        peer.signal(offer);
      }
    }, 500);

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

        setTimeout(() => {
          const peer = this.peers.get(fromConnectionId);
          if (peer) {
            console.log('Signaling offer after participant found');
            peer.signal(offer);
          }
        }, 500);

      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.log('Timed out waiting for participant, creating peer with connectionId');

        // Create peer with connectionId as name as last resort
        if (!this.peers.has(fromConnectionId)) {
          this.createPeer(fromConnectionId, `User-${fromConnectionId.substring(0, 5)}`, false);
        }

        setTimeout(() => {
          const peer = this.peers.get(fromConnectionId);
          if (peer) {
            console.log('Signaling offer with fallback peer');
            peer.signal(offer);
          }
        }, 500);
      }
    }, 200);
  }
}

  private handleAnswer(fromConnectionId: string, answer: any) {
    console.log('Handling answer from:', fromConnectionId);
    const peer = this.peers.get(fromConnectionId);
    if (peer) {
      console.log('Signaling answer to peer');
      peer.signal(answer);
    }
  }

  private handleIceCandidate(fromConnectionId: string, candidate: any) {
    console.log('Handling ICE candidate from:', fromConnectionId);
    const peer = this.peers.get(fromConnectionId);
    if (peer) {
      peer.signal(candidate);
    }
  }

  private removePeer(connectionId: string) {
    console.log('Removing peer:', connectionId);
    const peer = this.peers.get(connectionId);
    if (peer) {
      peer.destroy();
      this.peers.delete(connectionId);
    }
  }

  private addRemoteVideo(connectionId: string, stream: MediaStream, userName: string) {
    console.log('Adding remote video for:', userName);

    this.ngZone.run(() => {
      let videoElement = this.remoteVideoElements.get(connectionId);

      if (!videoElement && this.remoteVideosContainer) {
        videoElement = document.createElement('video');
        videoElement.id = `remote-video-${connectionId}`;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.className = 'remote-video';

        const container = document.createElement('div');
        container.className = 'remote-video-container';
        container.appendChild(videoElement);

        const label = document.createElement('div');
        label.className = 'participant-name-label';
        label.innerText = userName;
        container.appendChild(label);

        this.remoteVideosContainer.nativeElement.appendChild(container);
        this.remoteVideoElements.set(connectionId, videoElement);
        console.log('Remote video element created for:', userName);
      }

      if (videoElement) {
        videoElement.srcObject = stream;
        console.log('Remote video stream set for:', userName);
      }
    });
  }

  private removeRemoteVideo(connectionId: string) {
    console.log('Removing remote video for connection:', connectionId);
    const videoElement = this.remoteVideoElements.get(connectionId);
    if (videoElement) {
      videoElement.parentElement?.remove();
      this.remoteVideoElements.delete(connectionId);
    }
  }

  async toggleMute() {
    console.log('Toggling mute, current:', this.isMuted);
    this.isMuted = !this.isMuted;

    if (this.mediaStream) {
      const audioTracks = this.mediaStream.getAudioTracks();
      audioTracks.forEach(track => track.enabled = !this.isMuted);
      console.log('Audio tracks enabled:', !this.isMuted);
    }

    await this.signalRService.toggleAudio(this.meetingId, !this.isMuted);
    console.log('Audio toggle sent to server:', !this.isMuted);
    this.refreshTooltips();
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

  toggleRecording() {
    this.isRecording = !this.isRecording;
    console.log('Recording toggled:', this.isRecording);
    this.refreshTooltips();
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
