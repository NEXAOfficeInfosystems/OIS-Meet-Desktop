import { inject, Injectable } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { filter, map } from 'rxjs';
import { ChatSignalrService } from '../../services/chat-signalr.service';
import { CollaborationRealtimeService } from '../../services/collaboration-realtime.service';
import { PresenceActions } from './presence.actions';

@Injectable()
export class PresenceEffects {
  private readonly chatSignalr = inject(ChatSignalrService);
  private readonly realtime = inject(CollaborationRealtimeService);

  syncOnlineUsers$ = createEffect(() =>
    this.chatSignalr.activeUsersList$.pipe(
      map((userIds: string[]) => PresenceActions.syncOnlineUsers({ onlineUserIds: userIds ?? [] }))
    )
  );

  userOnline$ = createEffect(() =>
    this.chatSignalr.userOnline$.pipe(
      filter(Boolean),
      map((userId: string) => PresenceActions.userStatusChanged({ userId, status: 'online' }))
    )
  );

  userOffline$ = createEffect(() =>
    this.chatSignalr.userOffline$.pipe(
      filter(Boolean),
      map((userId: string) => PresenceActions.userStatusChanged({ userId, status: 'offline' }))
    )
  );

  userStatusChanged$ = createEffect(() =>
    this.realtime.userStatusChanged$.pipe(
      filter(Boolean),
      map(({ userId, status }) => PresenceActions.userStatusChanged({ userId, status }))
    )
  );
}
