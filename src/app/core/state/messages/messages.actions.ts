import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const MessagesActions = createActionGroup({
  source: 'Messages',
  events: {
    'Load Conversation Messages': props<{ conversationId: string; page?: number }>(),
    'Load Conversation Messages Success': props<{ conversationId: string; messages: any[]; hasMore: boolean }>(),
    'Load Conversation Messages Failure': props<{ conversationId: string; error: string }>(),
    
    'Send Message': props<{ conversationId: string; content: string; messageType?: string; fileUrl?: string; fileName?: string; replyToMessageId?: string; formattedContent?: string }>(),
    'Send Message Success': props<{ message: any }>(),
    'Send Message Failure': props<{ error: string }>(),
    
    'Edit Message': props<{ messageId: string; content: string; formattedContent?: string }>(),
    'Edit Message Success': props<{ message: any }>(),
    
    'Delete Message': props<{ messageId: string }>(),
    'Delete Message Success': props<{ messageId: string }>(),
    
    'Message Received': props<{ message: any }>(),
    'Message Updated': props<{ message: any }>(),
    'Message Deleted': props<{ messageId: string }>(),
    
    'Clear Conversation': props<{ conversationId: string }>(),
    'Select Conversation': props<{ conversationId: string }>(),
    'Add Reaction': props<{ messageId: string; emoji: string }>(),
    'Remove Reaction': props<{ messageId: string; emoji: string }>(),
    'Reaction Added': props<{ messageId: string; emoji: string; userId: string; userName: string }>(),
    'Reaction Removed': props<{ messageId: string; emoji: string; userId: string }>(),
    'Reset': emptyProps(),
  }
});
