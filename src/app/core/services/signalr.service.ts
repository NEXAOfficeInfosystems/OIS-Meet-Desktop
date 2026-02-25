import { Injectable, NgZone } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { Subject } from 'rxjs';
import { Message } from './chat.service';
import { SessionService } from './session.service';

export interface MeetingParticipant {
  connectionId: string;
  userId: string;
  userName: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SignalRService {
  private hubConnection!: signalR.HubConnection;
private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  // Chat Subjects
  private messageReceivedSubject = new Subject<Message>();
  private userTypingSubject = new Subject<{ userId: string; isTyping: boolean }>();
  private messageStatusSubject = new Subject<{ messageId: string; status: string; userId: string }>();
  private userOnlineSubject = new Subject<string>();
  private userOfflineSubject = new Subject<string>();
  private messageDeletedSubject = new Subject<string>();
  private newConversationSubject = new Subject<any>();

  // Meeting Subjects
  private currentParticipantsSubject = new Subject<MeetingParticipant[]>();
  private participantJoinedSubject = new Subject<MeetingParticipant>();
  private participantLeftSubject = new Subject<{ connectionId: string; userId: string }>();
  private participantDisconnectedSubject = new Subject<{ connectionId: string; userId: string }>();
  private receiveOfferSubject = new Subject<{ fromConnectionId: string; offer: any }>();
  private receiveAnswerSubject = new Subject<{ fromConnectionId: string; answer: any }>();
  private receiveIceCandidateSubject = new Subject<{ fromConnectionId: string; candidate: any }>();
  private audioToggledSubject = new Subject<{ connectionId: string; userId: string; isEnabled: boolean }>();
  private videoToggledSubject = new Subject<{ connectionId: string; userId: string; isEnabled: boolean }>();
  private screenShareStartedSubject = new Subject<{ connectionId: string; userId: string }>();
  private screenShareStoppedSubject = new Subject<{ connectionId: string; userId: string }>();
  private meetingMessageReceivedSubject = new Subject<any>();
  private meetingEndedSubject = new Subject<{ endedBy: string; timestamp: Date }>();

  // Chat Observables
  public messageReceived$ = this.messageReceivedSubject.asObservable();
  public userTyping$ = this.userTypingSubject.asObservable();
  public messageStatus$ = this.messageStatusSubject.asObservable();
  public userOnline$ = this.userOnlineSubject.asObservable();
  public userOffline$ = this.userOfflineSubject.asObservable();
  public messageDeleted$ = this.messageDeletedSubject.asObservable();
  public newConversation$ = this.newConversationSubject.asObservable();

  // Meeting Observables
  public currentParticipants$ = this.currentParticipantsSubject.asObservable();
  public participantJoined$ = this.participantJoinedSubject.asObservable();
  public participantLeft$ = this.participantLeftSubject.asObservable();
  public participantDisconnected$ = this.participantDisconnectedSubject.asObservable();
  public receiveOffer$ = this.receiveOfferSubject.asObservable();
  public receiveAnswer$ = this.receiveAnswerSubject.asObservable();
  public receiveIceCandidate$ = this.receiveIceCandidateSubject.asObservable();
  public audioToggled$ = this.audioToggledSubject.asObservable();
  public videoToggled$ = this.videoToggledSubject.asObservable();
  public screenShareStarted$ = this.screenShareStartedSubject.asObservable();
  public screenShareStopped$ = this.screenShareStoppedSubject.asObservable();
  public meetingMessageReceived$ = this.meetingMessageReceivedSubject.asObservable();
  public meetingEnded$ = this.meetingEndedSubject.asObservable();

  public userId: string = '';
  public userName: string = '';

  constructor(
    private ngZone: NgZone,
    private sessionService: SessionService
  ) {
    this.userId = this.sessionService.getOISMeetUserId() || this.sessionService.getUserId() || '';
    this.userName = this.sessionService.getFullName() || '';
  }

  public async startConnection(userId?: string): Promise<void> {
    // Check current state
    if (this.connectionState === 'connected' && this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      console.log('SignalR already connected');
      return;
    }

    if (this.connectionState === 'connecting') {
      console.log('SignalR connection already in progress');
      return;
    }

    this.connectionState = 'connecting';
    console.log('Starting SignalR connection...');

    const baseUrl = environment.apiBaseUrl.replace('/api', '');
    let url = `${baseUrl}/hubs/meeting`;

    // Clean up existing connection if any
    if (this.hubConnection) {
      try {
        await this.hubConnection.stop();
      } catch (e) {
        // Ignore
      }
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.registerOnServerEvents();

    try {
      await this.hubConnection.start();
      console.log('✅ SignalR Connected');
      this.connectionState = 'connected';
    } catch (err) {
      console.error('❌ Error starting SignalR: ', err);
      this.connectionState = 'disconnected';
      setTimeout(() => this.startConnection(userId), 5000);
    }

    this.hubConnection.onreconnected(() => {
      console.log('🔄 SignalR Reconnected');
      this.connectionState = 'connected';
    });

    this.hubConnection.onreconnecting(() => {
      console.log('⏳ SignalR Reconnecting...');
      this.connectionState = 'connecting';
    });

    this.hubConnection.onclose(() => {
      console.log('🔌 SignalR Closed');
      this.connectionState = 'disconnected';
      setTimeout(() => this.startConnection(userId), 5000);
    });
  }

  private registerOnServerEvents(): void {
    if (!this.hubConnection) return;

    // Chat Events
    this.hubConnection.on('ReceiveMessage', (message: Message) => {
      this.ngZone.run(() => this.messageReceivedSubject.next(message));
    });

    this.hubConnection.on('UserTyping', (data: { userId: string; isTyping: boolean }) => {
      this.ngZone.run(() => this.userTypingSubject.next(data));
    });

    this.hubConnection.on('MessageStatusUpdated', (data: any) => {
      this.ngZone.run(() => this.messageStatusSubject.next(data));
    });

    this.hubConnection.on('UserOnline', (userId: string) => {
      this.ngZone.run(() => this.userOnlineSubject.next(userId));
    });

    this.hubConnection.on('UserOffline', (userId: string) => {
      this.ngZone.run(() => this.userOfflineSubject.next(userId));
    });

    // Meeting Events
this.hubConnection.on('CurrentParticipants', (participants: any[]) => {
  console.log('📋 Current participants received:', participants);
  this.ngZone.run(() => {
    // Map the data to ensure it matches MeetingParticipant interface
    const mappedParticipants = participants.map(p => ({
      connectionId: p.connectionId,
      userId: p.userId,
      userName: p.userName,
      isAudioEnabled: p.isAudioEnabled,
      isVideoEnabled: p.isVideoEnabled,
      isScreenSharing: p.isScreenSharing
    }));
    this.currentParticipantsSubject.next(mappedParticipants);
  });
});

this.hubConnection.on('UserJoined', (data: any) => {
  console.log('👤 User joined:', data);
  this.ngZone.run(() => {
    const participant: MeetingParticipant = {
      connectionId: data.connectionId,
      userId: data.userId,
      userName: data.userName,
      isAudioEnabled: data.isAudioEnabled,
      isVideoEnabled: data.isVideoEnabled,
      isScreenSharing: data.isScreenSharing
    };
    this.participantJoinedSubject.next(participant);
  });
});

    this.hubConnection.on('UserLeft', (data: { connectionId: string; userId: string }) => {
    console.log('👋 User left:', data);
    this.ngZone.run(() => this.participantLeftSubject.next(data));
  });

  this.hubConnection.on('UserDisconnected', (data: { connectionId: string; userId: string }) => {
    console.log('🔌 User disconnected:', data);
    this.ngZone.run(() => this.participantDisconnectedSubject.next(data));
  });

  // WebRTC Signaling
  this.hubConnection.on('ReceiveOffer', (data: { fromConnectionId: string; offer: any }) => {
    console.log('📞 Received offer');
    this.ngZone.run(() => this.receiveOfferSubject.next(data));
  });

  this.hubConnection.on('ReceiveAnswer', (data: { fromConnectionId: string; answer: any }) => {
    console.log('📞 Received answer');
    this.ngZone.run(() => this.receiveAnswerSubject.next(data));
  });

  this.hubConnection.on('ReceiveIceCandidate', (data: { fromConnectionId: string; candidate: any }) => {
    console.log('🧊 Received ICE candidate');
    this.ngZone.run(() => this.receiveIceCandidateSubject.next(data));
  });

  // Media toggles
  this.hubConnection.on('AudioToggled', (data: { connectionId: string; userId: string; isEnabled: boolean }) => {
    console.log('🔊 Audio toggled:', data);
    this.ngZone.run(() => this.audioToggledSubject.next(data));
  });

  this.hubConnection.on('VideoToggled', (data: { connectionId: string; userId: string; isEnabled: boolean }) => {
    console.log('📹 Video toggled:', data);
    this.ngZone.run(() => this.videoToggledSubject.next(data));
  });

  this.hubConnection.on('ScreenShareStarted', (data: { connectionId: string; userId: string }) => {
    console.log('🖥️ Screen share started');
    this.ngZone.run(() => this.screenShareStartedSubject.next(data));
  });

  this.hubConnection.on('ScreenShareStopped', (data: { connectionId: string; userId: string }) => {
    console.log('🖥️ Screen share stopped');
    this.ngZone.run(() => this.screenShareStoppedSubject.next(data));
  });

  this.hubConnection.on('ChatMessageReceived', (data: any) => {
    console.log('💬 Chat message received');
    this.ngZone.run(() => this.meetingMessageReceivedSubject.next(data));
  });

  this.hubConnection.on('MeetingEnded', (data: { endedBy: string; timestamp: Date }) => {
    console.log('🏁 Meeting ended');
    this.ngZone.run(() => this.meetingEndedSubject.next(data));
  });
  }

  // Chat Methods
  public joinConversation(conversationId: string): void {
    this.hubConnection?.invoke('JoinConversation', conversationId)
      .catch(err => console.error('Error joining conversation: ', err));
  }

  public leaveConversation(conversationId: string): void {
    this.hubConnection?.invoke('LeaveConversation', conversationId)
      .catch(err => console.error('Error leaving conversation: ', err));
  }

  public sendTypingIndicator(conversationId: string, isTyping: boolean): void {
    this.hubConnection?.invoke('SendTypingIndicator', conversationId, isTyping)
      .catch(err => console.error('Error sending typing indicator: ', err));
  }

  public markMessagesAsRead(conversationId: string, messageIds: string[]): void {
    this.hubConnection?.invoke('MarkMessagesAsRead', conversationId, messageIds)
      .catch(err => console.error('Error marking messages as read: ', err));
  }

  // Meeting Methods
public async joinMeeting(meetingId: string, userId: string, userName: string): Promise<void> {
  if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
    try {
      console.log(`Invoking JoinMeeting: ${meetingId}, ${userId}, ${userName}`);
      await this.hubConnection.invoke('JoinMeeting', meetingId, userId, userName);
      console.log(`✅ Joined meeting: ${meetingId}`);
    } catch (err) {
      console.error('Error joining meeting:', err);
    }
  } else {
    console.error('Cannot join meeting - SignalR not connected. State:', this.hubConnection?.state);
  }
}

  public async leaveMeeting(meetingId: string, userId: string): Promise<void> {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.hubConnection.invoke('LeaveMeeting', meetingId, userId);
        console.log(`Left meeting: ${meetingId}`);
      } catch (err) {
        console.error('Error leaving meeting:', err);
      }
    }
  }

  public async endMeeting(meetingId: string, hostUserId: string): Promise<void> {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      try {
        await this.hubConnection.invoke('EndMeeting', meetingId, hostUserId);
        console.log(`Ended meeting: ${meetingId}`);
      } catch (err) {
        console.error('Error ending meeting:', err);
      }
    }
  }

  public async sendOffer(meetingId: string, targetConnectionId: string, offer: any): Promise<void> {
    await this.hubConnection?.invoke('SendOffer', meetingId, targetConnectionId, offer);
  }

  public async sendAnswer(meetingId: string, targetConnectionId: string, answer: any): Promise<void> {
    await this.hubConnection?.invoke('SendAnswer', meetingId, targetConnectionId, answer);
  }

  public async sendIceCandidate(meetingId: string, targetConnectionId: string, candidate: any): Promise<void> {
    await this.hubConnection?.invoke('SendIceCandidate', meetingId, targetConnectionId, candidate);
  }

  public async toggleAudio(meetingId: string, isEnabled: boolean): Promise<void> {
    await this.hubConnection?.invoke('ToggleAudio', meetingId, isEnabled);
  }

  public async toggleVideo(meetingId: string, isEnabled: boolean): Promise<void> {
    await this.hubConnection?.invoke('ToggleVideo', meetingId, isEnabled);
  }

  public async startScreenShare(meetingId: string): Promise<void> {
    await this.hubConnection?.invoke('StartScreenShare', meetingId);
  }

  public async stopScreenShare(meetingId: string): Promise<void> {
    await this.hubConnection?.invoke('StopScreenShare', meetingId);
  }

  public async sendMeetingMessage(meetingId: string, message: string): Promise<void> {
    await this.hubConnection?.invoke('SendChatMessage', meetingId, message);
  }

  public getConnectionId(): string | null {
    return this.hubConnection?.connectionId || null;
  }

  public stopConnection(): void {
    if (this.hubConnection) {
      this.hubConnection.stop()
        .then(() => console.log('SignalR Stopped'))
        .catch(err => console.error('Error stopping SignalR: ', err));
    }
  }
}
