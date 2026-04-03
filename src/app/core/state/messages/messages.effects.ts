import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, filter, map, of, switchMap, tap } from 'rxjs';
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
      switchMap(({ conversationId, page }) =>
        this.chatService.getMessages(conversationId, page || 1).pipe(
          map((response: any) => MessagesActions.loadConversationMessagesSuccess({
            conversationId,
            messages: response?.data ?? [],
            hasMore: (response?.data?.length || 0) === 50
          })),
          catchError((err) => of(MessagesActions.loadConversationMessagesFailure({
            conversationId,
            error: err?.message || 'Failed to load messages'
          })))
        )
      )
    )
  );

  sendMessage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MessagesActions.sendMessage),
      switchMap(({ conversationId, content, messageType, fileUrl, fileName, replyToMessageId, formattedContent }) =>
        this.chatService.sendMessageApi(conversationId, content, messageType || 'Text', fileUrl, fileName, replyToMessageId, formattedContent).pipe(
          map((response: any) => MessagesActions.sendMessageSuccess({
            message: response?.data
          })),
          catchError((err) => of(MessagesActions.sendMessageFailure({
            error: err?.message || 'Failed to send message'
          })))
        )
      )
    )
  );

  editMessage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MessagesActions.editMessage),
      switchMap(({ messageId, content, formattedContent }) =>
        this.chatService.editMessage(messageId, content, formattedContent).pipe(
          map((response: any) => MessagesActions.editMessageSuccess({
            message: response?.data
          }))
        )
      )
    )
  );

  deleteMessage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MessagesActions.deleteMessage),
      switchMap(({ messageId }) =>
        this.chatService.deleteMessage(messageId).pipe(
          map(() => MessagesActions.deleteMessageSuccess({ messageId }))
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
  
  messageUpdated$ = createEffect(() =>
    this.signalr.messageUpdated$?.pipe(
      filter(Boolean),
      map((message: any) => MessagesActions.messageUpdated({ message }))
    )
  );

  messageDeletedEvent$ = createEffect(() =>
    this.signalr.messageDeleted$.pipe(
      filter(Boolean),
      map((messageId: string) => MessagesActions.messageDeleted({ messageId }))
    )
  );
}
