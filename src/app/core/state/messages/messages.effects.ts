import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { ChatSignalrService } from '../../services/chat-signalr.service';
import { MessagesActions } from './messages.actions';

@Injectable()
export class MessagesEffects {
  private readonly actions$ = inject(Actions);
  private readonly chatService = inject(ChatService);
  private readonly signalr = inject(ChatSignalrService);

  loadConversationMessages$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MessagesActions.loadConversationMessages),
      switchMap(({ conversationId }) =>
        this.chatService.getMessages(conversationId).pipe(
          map((response: any) => MessagesActions.loadConversationMessagesSuccess({
            conversationId,
            messages: response?.data ?? []
          })),
          catchError((err) => of(MessagesActions.loadConversationMessagesFailure({
            conversationId,
            error: err?.message || 'Failed to load messages'
          })))
        )
      )
    )
  );

  messageReceived$ = createEffect(() =>
    this.signalr.messageReceived$.pipe(
      filter(Boolean),
      map((message: any) => MessagesActions.messageReceived({ message }))
    )
  );

  messageDeleted$ = createEffect(() =>
    this.signalr.messageDeleted$.pipe(
      filter(Boolean),
      map((messageId: string) => MessagesActions.messageDeleted({ messageId }))
    )
  );
}
