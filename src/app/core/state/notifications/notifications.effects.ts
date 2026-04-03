import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { CollaborationRealtimeService } from '../../services/collaboration-realtime.service';
import { CollaborationService } from '../../services/collaboration.service';
import { NotificationsActions } from './notifications.actions';

@Injectable()
export class NotificationsEffects {
  private readonly actions$ = inject(Actions);
  private readonly collaboration = inject(CollaborationService);
  private readonly realtime = inject(CollaborationRealtimeService);

  loadNotifications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(NotificationsActions.loadNotifications),
      switchMap(() =>
        this.collaboration.getNotifications().pipe(
          map(response => NotificationsActions.loadNotificationsSuccess({
            notifications: response?.data ?? [],
            unreadCount: response?.unreadCount ?? 0
          })),
          catchError((err) => of(NotificationsActions.loadNotificationsFailure({
            error: err?.message || 'Failed to load notifications'
          })))
        )
      )
    )
  );

  notificationReceived$ = createEffect(() =>
    this.realtime.notificationReceived$.pipe(
      filter(Boolean),
      map(notification => NotificationsActions.notificationReceived({ notification }))
    )
  );

  markRead$ = createEffect(() =>
    this.actions$.pipe(
      ofType(NotificationsActions.markAsRead),
      switchMap(({ notificationIds }) =>
        this.collaboration.markNotificationsRead(notificationIds).pipe(
          map(() => NotificationsActions.markAsReadSuccess({ notificationIds })),
          catchError(() => of(NotificationsActions.loadNotifications()))
        )
      )
    )
  );
}
