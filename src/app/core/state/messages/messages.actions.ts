import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const MessagesActions = createActionGroup({
  source: 'Messages',
  events: {
    'Load Conversation Messages': props<{ conversationId: string }>(),
    'Load Conversation Messages Success': props<{ conversationId: string; messages: any[] }>(),
    'Load Conversation Messages Failure': props<{ conversationId: string; error: string }>(),
    'Message Received': props<{ message: any }>(),
    'Message Updated': props<{ message: any }>(),
    'Message Deleted': props<{ messageId: string }>(),
    'Clear Conversation': props<{ conversationId: string }>(),
    'Select Conversation': props<{ conversationId: string }>(),
    'Reset': emptyProps(),
  }
});
