import { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject } from 'rxjs';

import { MeetingComponent } from './meeting.component';

class MockSignalRService {
  reconnected$ = new Subject<void>();
  currentParticipants$ = new Subject<any[]>();
  participantJoined$ = new Subject<any>();
  participantLeft$ = new Subject<any>();
  participantDisconnected$ = new Subject<any>();
  receiveOffer$ = new Subject<any>();
  receiveAnswer$ = new Subject<any>();
  receiveIceCandidate$ = new Subject<any>();
  audioToggled$ = new Subject<any>();
  videoToggled$ = new Subject<any>();
  screenShareStarted$ = new Subject<any>();
  screenShareStopped$ = new Subject<any>();
  meetingMessageReceived$ = new Subject<any>();
  meetingEnded$ = new Subject<any>();
  transcriptionAvailable$ = new Subject<any>();
  momAvailable$ = new Subject<any>();
  liveTranscriptionStarted$ = new Subject<any>();
  liveTranscriptionStopped$ = new Subject<any>();
  liveTranscriptionSegment$ = new Subject<any>();

  startConnection = jasmine.createSpy('startConnection').and.resolveTo();
  joinMeeting = jasmine.createSpy('joinMeeting').and.resolveTo();
  leaveMeeting = jasmine.createSpy('leaveMeeting').and.resolveTo();
  endMeeting = jasmine.createSpy('endMeeting').and.resolveTo();
  toggleAudio = jasmine.createSpy('toggleAudio').and.resolveTo();
  toggleVideo = jasmine.createSpy('toggleVideo').and.resolveTo();
  startScreenShare = jasmine.createSpy('startScreenShare').and.resolveTo();
  stopScreenShare = jasmine.createSpy('stopScreenShare').and.resolveTo();
  sendOffer = jasmine.createSpy('sendOffer').and.resolveTo();
  sendAnswer = jasmine.createSpy('sendAnswer').and.resolveTo();
  sendIceCandidate = jasmine.createSpy('sendIceCandidate').and.resolveTo();
  sendMeetingMessage = jasmine.createSpy('sendMeetingMessage').and.resolveTo();
  notifyLiveTranscriptionStarted = jasmine.createSpy('notifyLiveTranscriptionStarted').and.resolveTo();
  notifyLiveTranscriptionStopped = jasmine.createSpy('notifyLiveTranscriptionStopped').and.resolveTo();
  publishTranscription = jasmine.createSpy('publishTranscription').and.resolveTo();
  publishMom = jasmine.createSpy('publishMom').and.resolveTo();
  stopConnection = jasmine.createSpy('stopConnection');
  getConnectionId = jasmine.createSpy('getConnectionId').and.returnValue('self-connection');
  inviteToMeeting = jasmine.createSpy('inviteToMeeting').and.resolveTo();
}

class MockAudioRecorderService {
  transcription$ = new Subject<any>();
  startRecordingFromMeeting = jasmine.createSpy('startRecordingFromMeeting').and.resolveTo(true);
  addRemoteStream = jasmine.createSpy('addRemoteStream');
  removeRemoteStream = jasmine.createSpy('removeRemoteStream');
  stopRecording = jasmine.createSpy('stopRecording').and.resolveTo(null);
  saveRecordingAsWav = jasmine.createSpy('saveRecordingAsWav').and.resolveTo({ success: true });
  dispose = jasmine.createSpy('dispose');
}

class MockLiveTranscriptionService {
  segments$ = new Subject<any[]>();
  status$ = new Subject<any>();
  error$ = new Subject<string | null>();
  isSessionHost = false;
  stop = jasmine.createSpy('stop');
  clearSegments = jasmine.createSpy('clearSegments');
  start = jasmine.createSpy('start').and.resolveTo();
  receiveRemoteSegment = jasmine.createSpy('receiveRemoteSegment');
}

describe('MeetingComponent hot path protections', () => {
  let component: MeetingComponent;
  let signalRService: MockSignalRService;
  let audioRecorderService: MockAudioRecorderService;
  let liveTranscriptionService: MockLiveTranscriptionService;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  const createTrack = (kind: 'audio' | 'video', enabled = true): MediaStreamTrack =>
    ({ kind, enabled, readyState: 'live', stop: jasmine.createSpy('stop') } as unknown as MediaStreamTrack);

  const createStream = (audioTracks: MediaStreamTrack[] = [], videoTracks: MediaStreamTrack[] = []): MediaStream =>
    ({
      getAudioTracks: () => audioTracks,
      getVideoTracks: () => videoTracks,
      getTracks: () => [...audioTracks, ...videoTracks],
      addTrack: jasmine.createSpy('addTrack').and.callFake((track: MediaStreamTrack) => {
        if (track.kind === 'audio') {
          audioTracks.push(track);
        } else {
          videoTracks.push(track);
        }
      }),
      removeTrack: jasmine.createSpy('removeTrack').and.callFake((track: MediaStreamTrack) => {
        const target = track.kind === 'audio' ? audioTracks : videoTracks;
        const index = target.indexOf(track);
        if (index >= 0) {
          target.splice(index, 1);
        }
      })
    } as unknown as MediaStream);

  beforeEach(() => {
    signalRService = new MockSignalRService();
    audioRecorderService = new MockAudioRecorderService();
    liveTranscriptionService = new MockLiveTranscriptionService();
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    snackBar.open.and.returnValue({ onAction: () => of(void 0) } as any);

    component = new MeetingComponent(
      ({
        snapshot: {
          paramMap: { get: () => 'meeting-1' },
          queryParamMap: { get: () => null }
        }
      } as unknown) as ActivatedRoute,
      jasmine.createSpyObj<Router>('Router', ['navigate']),
      snackBar,
      {
        getFullName: () => 'Test User',
        getOISMeetUserId: () => 'self-user',
        getUserId: () => 'self-user',
        getClientId: () => 'client-1',
        getCompanyId: () => 'company-1',
        getMeetAppId: () => 'app-1'
      } as any,
      jasmine.createSpyObj<Clipboard>('Clipboard', ['copy']),
      {
        getMeetingParticipants: () => of({ success: true, data: [] }),
        getMeeting: () => of({ success: true, data: { topic: 'Demo Meeting', meetingId: 'meeting-1' } }),
        leaveMeeting: () => of({}),
        endMeeting: () => of({})
      } as any,
      signalRService as any,
      ({ run: (fn: Function) => fn() } as unknown) as NgZone,
      audioRecorderService as any,
      { generateMomFromTranscription: jasmine.createSpy('generateMomFromTranscription').and.resolveTo({}) } as any,
      { disconnect: jasmine.createSpy('disconnect') } as any,
      liveTranscriptionService as any,
      { currentSettings: {} } as any,
      { getOisMeetUsers: () => of({ success: true, data: [] }) } as any,
      ({ markForCheck: jasmine.createSpy('markForCheck') } as unknown) as ChangeDetectorRef,
      { startCall: jasmine.createSpy('startCall').and.resolveTo() } as any
    );

    component.meetingId = 'meeting-1';
    component.oisMeetUserId = 'self-user';
    component.userFullName = 'Test User';
    component.chatMessagesContainer = new ElementRef(document.createElement('div'));
    component.liveTranscriptionScroll = new ElementRef(document.createElement('div'));
    component.localVideo = new ElementRef(document.createElement('video'));
    component.screenShareVideo = new ElementRef(document.createElement('video'));
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('keeps SignalR listener registration idempotent', () => {
    (component as any).setupSignalRListeners();
    (component as any).setupSignalRListeners();

    signalRService.participantJoined$.next({
      connectionId: 'peer-1',
      userId: 'user-1',
      userName: 'User One',
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false
    });

    expect(component.participants.length).toBe(1);
  });

  it('processes each remote chat message only once', () => {
    (component as any).setupSignalRListeners();

    const payload = {
      id: 'msg-1',
      userId: 'user-2',
      userName: 'Remote User',
      message: 'hello',
      timestamp: new Date().toISOString()
    };

    signalRService.meetingMessageReceived$.next(payload);
    signalRService.meetingMessageReceived$.next(payload);

    expect(component.chatMessages.length).toBe(1);
    expect(component.chatMessages[0].id).toBe('msg-1');
  });

  it('toggles only the existing microphone track state', async () => {
    const audioTrack = createTrack('audio', false);
    const mediaStream = createStream([audioTrack], []);

    (component as any).mediaStream = mediaStream;
    component.isMuted = true;

    await component.toggleMute();
    await component.toggleMute();

    expect(audioTrack.enabled).toBeFalse();
    expect(signalRService.toggleAudio).toHaveBeenCalledTimes(2);
    expect((mediaStream.addTrack as jasmine.Spy)).not.toHaveBeenCalled();
  });

  it('does not recreate camera media when a video track already exists', async () => {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    const videoTrack = createTrack('video', true);
    (navigator.mediaDevices as any).getUserMedia = jasmine.createSpy('getUserMedia');

    try {
      (component as any).mediaStream = createStream([], [videoTrack]);
      component.isVideoOff = false;

      await component.toggleVideo();
      await component.toggleVideo();

      expect(videoTrack.enabled).toBeTrue();
      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    } finally {
      (navigator.mediaDevices as any).getUserMedia = originalGetUserMedia;
    }
  });

  it('restores the preserved camera track after screen share stops', async () => {
    const cameraTrack = createTrack('video', true);
    const screenTrack = createTrack('video', true);
    const screenStream = createStream([], [screenTrack]);
    const mediaStream = createStream([], [screenTrack]);

    (component as any).mediaStream = mediaStream;
    (component as any).screenStream = screenStream;
    (component as any).preservedCameraTrack = cameraTrack;
    component.isScreenSharing = true;
    component.isVideoOff = false;

    await (component as any).stopScreenSharing();

    expect((mediaStream.removeTrack as jasmine.Spy)).toHaveBeenCalledWith(screenTrack);
    expect((mediaStream.addTrack as jasmine.Spy)).toHaveBeenCalledWith(cameraTrack);
    expect(component.isScreenSharing).toBeFalse();
    expect(signalRService.stopScreenShare).toHaveBeenCalled();
  });

  it('reuses tracked remote streams when starting a meeting recording', async () => {
    const localAudioTrack = createTrack('audio', true);
    const localStream = createStream([localAudioTrack], []);
    const remoteStream = createStream([createTrack('audio', true)], []);

    (component as any).mediaStream = localStream;
    (component as any).remoteAudioStreams.set('peer-1', remoteStream);

    await (component as any).startMeetingRecording();

    expect(audioRecorderService.startRecordingFromMeeting)
      .toHaveBeenCalledWith(localStream, (component as any).remoteAudioStreams);
  });

  it('teardown is safe to call more than once and releases owned resources', () => {
    const audioTrack = createTrack('audio', true);
    const videoTrack = createTrack('video', true);
    const mediaStream = createStream([audioTrack], [videoTrack]);
    const peer = { destroyed: false, destroy: jasmine.createSpy('destroy') };

    (component as any).mediaStream = mediaStream;
    (component as any).screenStream = createStream([], [createTrack('video', true)]);
    (component as any).peers.set('peer-1', peer);
    (component as any).connectPeersTimeout = setTimeout(() => undefined, 1000);

    component.ngOnDestroy();
    component.ngOnDestroy();

    expect((audioTrack.stop as jasmine.Spy)).toHaveBeenCalled();
    expect((videoTrack.stop as jasmine.Spy)).toHaveBeenCalled();
    expect(peer.destroy).toHaveBeenCalled();
    expect(audioRecorderService.dispose).toHaveBeenCalled();
    expect(signalRService.stopConnection).toHaveBeenCalled();
  });
});
