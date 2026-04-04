import { createFeature, createReducer, on } from '@ngrx/store';
import { MessagesActions } from './messages.actions';

export interface MessagesState {
  byConversation: Record<string, any[]>;
  activeConversationId: string | null;
  loading: boolean;
  sending: boolean;
  error: string | null;
  hasMore: Record<string, boolean>;
  replyTo: any | null;
}

const initialState: MessagesState = {
  byConversation: {},
  activeConversationId: null,
  loading: false,
  sending: false,
  error: null,
  hasMore: {},
  replyTo: null
};

const reducer = createReducer(
  initialState,
  on(MessagesActions.selectConversation, (state, { conversationId }) => ({
    ...state,
    activeConversationId: conversationId,
    error: null,
    replyTo: null
  })),
  on(MessagesActions.loadConversationMessages, (state, { conversationId }) => ({
    ...state,
    activeConversationId: conversationId,
    loading: true,
    error: null,
  })),
  on(MessagesActions.loadConversationMessagesSuccess, (state, { conversationId, messages, hasMore }) => {
    const current = state.byConversation[conversationId] ?? [];
    const all = [...current, ...messages];
    
    // Ensure uniqueness by ID
    const unique = all.filter((msg, index, self) =>
      index === self.findIndex((m) => 
        String(m?.id ?? m?.Id ?? '') === String(msg?.id ?? msg?.Id ?? '')
      )
    );

    // Sort by time
    unique.sort((a, b) => {
      const ta = new Date(a.sentAt || a.SentAt || 0).getTime();
      const tb = new Date(b.sentAt || b.SentAt || 0).getTime();
      return ta - tb;
    });

    return {
      ...state,
      loading: false,
      byConversation: {
        ...state.byConversation,
        [conversationId]: unique,
      },
      hasMore: {
        ...state.hasMore,
        [conversationId]: hasMore
      }
    };
  }),
  on(MessagesActions.loadConversationMessagesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  on(MessagesActions.sendMessage, (state) => ({ ...state, sending: true })),
  on(MessagesActions.sendMessageSuccess, (state) => ({ ...state, sending: false })),
  on(MessagesActions.sendMessageFailure, (state, { error }) => ({ ...state, sending: false, error })),

  on(MessagesActions.messageReceived, (state, { message }) => {
    const conversationId = String(message?.conversationId ?? '');
    if (!conversationId) return state;

    const current = state.byConversation[conversationId] ?? [];
    // Ensure uniqueness by ID
    const msgId = String(message?.id ?? message?.Id);
    const exists = current.some(m => String(m?.id ?? m?.Id) === msgId);
    
    return {
      ...state,
      byConversation: {
        ...state.byConversation,
        [conversationId]: exists
          ? current.map(m => String(m?.id ?? m?.Id) === msgId ? message : m)
          : [...current, message],
      },
    };
  }),

  on(MessagesActions.messageUpdated, (state, { message }) => {
    const conversationId = String(message?.conversationId ?? '');
    if (!conversationId) return state;

    const current = state.byConversation[conversationId] ?? [];
    const msgId = String(message?.id ?? message?.Id);
    return {
      ...state,
      byConversation: {
        ...state.byConversation,
        [conversationId]: current.map(m => String(m?.id ?? m?.Id) === msgId ? message : m),
      },
    };
  }),

  on(MessagesActions.messageDeleted, (state, { messageId }) => {
     return {
      ...state,
      byConversation: Object.fromEntries(
        Object.entries(state.byConversation).map(([cid, msgs]) => [
          cid,
          msgs.map(m => String(m?.id ?? m?.Id) === String(messageId) 
            ? { ...m, isDeleted: true, content: 'This message was deleted', formattedContent: null } 
            : m
          )
        ])
      )
    };
  }),

  on(MessagesActions.clearConversation, (state, { conversationId }) => ({
    ...state,
    byConversation: { ...state.byConversation, [conversationId]: [] },
  })),

  on(MessagesActions.reactionAdded, (state, { messageId, emoji, userId, userName }) => {
    return {
      ...state,
      byConversation: Object.fromEntries(
        Object.entries(state.byConversation).map(([cid, msgs]) => [
          cid,
          msgs.map((m: any) => {
            if (String(m?.id ?? m?.Id) !== String(messageId)) return m;
            const reactions = [...(m.reactions || [])];
            if (!reactions.some((r: any) => r.userId === userId && r.emoji === emoji)) {
              reactions.push({ userId, userName, emoji });
            }
            return { ...m, reactions };
          })
        ])
      )
    };
  }),

  on(MessagesActions.reactionRemoved, (state, { messageId, emoji, userId }) => {
    return {
      ...state,
      byConversation: Object.fromEntries(
        Object.entries(state.byConversation).map(([cid, msgs]) => [
          cid,
          msgs.map((m: any) => {
            if (String(m?.id ?? m?.Id) !== String(messageId)) return m;
            const reactions = (m.reactions || []).filter((r: any) => !(r.userId === userId && r.emoji === emoji));
            return { ...m, reactions };
          })
        ])
      )
    };
  }),

  on(MessagesActions.reset, () => initialState)
);

export const messagesFeature = createFeature({
  name: 'messages',
  reducer,
});
