import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';

export interface LivekitRemoteAudioEvent {
  identity: string;
  name: string;
  trackSid: string;
  mediaStreamTrack: MediaStreamTrack;
}

export interface LivekitScreenShareEvent {
  identity: string;
  name: string;
  trackSid: string;
  mediaStreamTrack: MediaStreamTrack;
}

@Injectable({
  providedIn: 'root'
})
export class LivekitService {
  private room: Room | null = null;

  private readonly connectedSubject = new BehaviorSubject<boolean>(false);
  public readonly connected$: Observable<boolean> = this.connectedSubject.asObservable();

  private readonly remoteAudioAddedSubject = new Subject<LivekitRemoteAudioEvent>();
  public readonly remoteAudioAdded$ = this.remoteAudioAddedSubject.asObservable();

  private readonly remoteAudioRemovedSubject = new Subject<{ trackSid: string }>();
  public readonly remoteAudioRemoved$ = this.remoteAudioRemovedSubject.asObservable();

  private readonly screenShareStartedSubject = new Subject<LivekitScreenShareEvent>();
  public readonly screenShareStarted$ = this.screenShareStartedSubject.asObservable();

  private readonly screenShareStoppedSubject = new Subject<{ trackSid: string }>();
  public readonly screenShareStopped$ = this.screenShareStoppedSubject.asObservable();

  public getRoom(): Room | null {
    return this.room;
  }

  public async connect(livekitUrl: string, token: string): Promise<void> {
    if (this.room) {
      await this.disconnect();
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        this.handleTrackSubscribed(track, publication, participant);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        this.handleTrackUnsubscribed(track, publication, participant);
      })
      .on(RoomEvent.Disconnected, () => {
        this.connectedSubject.next(false);
      });

    await room.connect(livekitUrl, token);

    this.room = room;
    this.connectedSubject.next(true);
  }

  public async disconnect(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.connectedSubject.next(false);

    if (room) {
      try {
        room.removeAllListeners();
      } catch {
        // ignore
      }

      try {
        await room.disconnect();
      } catch {
        // ignore
      }
    }
  }

  public async publishMicrophoneTrack(track: MediaStreamTrack): Promise<void> {
    const room = this.room;
    if (!room) {
      throw new Error('LiveKit room is not connected');
    }

    await room.localParticipant.publishTrack(track, {
      source: Track.Source.Microphone,
    });
  }

  /**
   * Mute/unmute microphone in a way that won't stop the underlying MediaStreamTrack.
   *
   * Why: unpublishing a mic track may stop/end the original track in some SDK versions,
   * which breaks subsequent unmute attempts.
   */
  public async setMicrophoneMuted(muted: boolean, localTrack: MediaStreamTrack | null): Promise<void> {
    const room = this.room;
    if (!room) {
      return;
    }

    const pubs = Array.from(room.localParticipant.audioTrackPublications.values()) as any[];
    const micPub = pubs.find((p) => p?.source === Track.Source.Microphone) ?? null;

    // If we are unmuting and nothing is published yet, publish once.
    if (!micPub) {
      if (!muted && localTrack) {
        await this.publishMicrophoneTrack(localTrack);
      }
      return;
    }

    try {
      if (muted) {
        // Prefer publication API if available
        if (typeof micPub.mute === 'function') {
          await micPub.mute();
          return;
        }
        if (micPub.track && typeof micPub.track.mute === 'function') {
          await micPub.track.mute();
          return;
        }
      } else {
        if (typeof micPub.unmute === 'function') {
          await micPub.unmute();
          return;
        }
        if (micPub.track && typeof micPub.track.unmute === 'function') {
          await micPub.track.unmute();
          return;
        }
      }
    } catch {
      // ignore; caller logs
    }
  }

  public async unpublishMicrophoneTracks(): Promise<void> {
    const room = this.room;
    if (!room) {
      return;
    }

    for (const pub of room.localParticipant.audioTrackPublications.values()) {
      try {
        if (pub.track) {
          room.localParticipant.unpublishTrack(pub.track);
        }
      } catch {
        // ignore
      }
    }
  }

  public async publishScreenShareTrack(track: MediaStreamTrack): Promise<string> {
    const room = this.room;
    if (!room) {
      throw new Error('LiveKit room is not connected');
    }

    const publication = await room.localParticipant.publishTrack(track, {
      source: Track.Source.ScreenShare,
      simulcast: true,
    });

    return publication.trackSid;
  }

  public async unpublishTrack(trackSid: string): Promise<void> {
    const room = this.room;
    if (!room) {
      return;
    }

    try {
      const pub = Array.from(room.localParticipant.trackPublications.values()).find((p) => p.trackSid === trackSid);
      if (pub?.track) {
        room.localParticipant.unpublishTrack(pub.track);
      }
    } catch {
      // ignore
    }
  }

  private handleTrackSubscribed(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant): void {
    const identity = participant.identity ?? '';
    const name = participant.name ?? identity;

    if (track.kind === Track.Kind.Audio && publication.source === Track.Source.Microphone) {
      this.remoteAudioAddedSubject.next({
        identity,
        name,
        trackSid: publication.trackSid,
        mediaStreamTrack: track.mediaStreamTrack,
      });
      return;
    }

    if (track.kind === Track.Kind.Video && publication.source === Track.Source.ScreenShare) {
      this.screenShareStartedSubject.next({
        identity,
        name,
        trackSid: publication.trackSid,
        mediaStreamTrack: track.mediaStreamTrack,
      });
      return;
    }
  }

  private handleTrackUnsubscribed(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant): void {
    if (track.kind === Track.Kind.Audio && publication.source === Track.Source.Microphone) {
      this.remoteAudioRemovedSubject.next({ trackSid: publication.trackSid });
      return;
    }

    if (track.kind === Track.Kind.Video && publication.source === Track.Source.ScreenShare) {
      this.screenShareStoppedSubject.next({ trackSid: publication.trackSid });
      return;
    }
  }
}
