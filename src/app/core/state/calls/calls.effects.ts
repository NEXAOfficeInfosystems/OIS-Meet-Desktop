import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { CollaborationRealtimeService } from '../../services/collaboration-realtime.service';
import { CollaborationService } from '../../services/collaboration.service';
import { CallsActions } from './calls.actions';

@Injectable()
export class CallsEffects {
  private readonly actions$ = inject(Actions);
  private readonly collaboration = inject(CollaborationService);
  private readonly realtime = inject(CollaborationRealtimeService);

  loadCall$ = createEffect(() =>
    this.actions$.pipe(
      ofType(CallsActions.loadCall),
      switchMap(({ callId }) =>
        this.collaboration.getCall(callId).pipe(
          map(response => CallsActions.loadCallSuccess({ call: response?.data ?? null })),
          catchError((err) => of(CallsActions.loadCallFailure({ error: err?.message || 'Failed to load call' })))
        )
      )
    )
  );

  callStarted$ = createEffect(() =>
    this.realtime.callStarted$.pipe(
      filter(Boolean),
      map(call => CallsActions.callStarted({ call }))
    )
  );

  userJoined$ = createEffect(() =>
    this.realtime.userJoinedCall$.pipe(
      filter(Boolean),
      map(({ callId, userId, userName }) => CallsActions.userJoinedCall({ callId, userId, userName }))
    )
  );

  userLeft$ = createEffect(() =>
    this.realtime.userLeftCall$.pipe(
      filter(Boolean),
      map(({ callId, userId, userName }) => CallsActions.userLeftCall({ callId, userId, userName }))
    )
  );

  callEnded$ = createEffect(() =>
    this.realtime.callEnded$.pipe(
      filter(Boolean),
      map(({ callId }) => CallsActions.callEnded({ callId }))
    )
  );
}
