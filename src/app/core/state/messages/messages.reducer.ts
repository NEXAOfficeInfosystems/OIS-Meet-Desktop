import { createFeature, createReducer, on } from '@ngrx/store';
import { MessagesActions } from './messages.actions';

export interface MessagesState {
  byConversation: Record<string, any[]>;
  activeConversationId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: MessagesState = {
  byConversation: {},
  activeConversationId: null,
  loading: false,
  error: null,
};

const reducer = createReducer(
  initialState,
  on(MessagesActions.selectConversation, (state, { conversationId }) => ({
    ...state,
    activeConversationId: conversationId,
    error: null,
  })),
  on(MessagesActions.loadConversationMessages, (state, { conversationId }) => ({
    ...state,
    activeConversationId: conversationId,
    loading: true,
    error: null,
  })),
  on(MessagesActions.loadConversationMessagesSuccess, (state, { conversationId, messages }) => ({
    ...state,
    loading: false,
    byConversation: {
      ...state.byConversation,
      [conversationId]: [...messages],
    },
  })),
  on(MessagesActions.loadConversationMessagesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(MessagesActions.messageReceived, (state, { message }) => {
    const conversationId = String(message?.conversationId ?? '');
    if (!conversationId) {
      return state;
    }

    const current = state.byConversation[conversationId] ?? [];
    const exists = current.some(item => String(item?.id ?? item?.Id) === String(message?.id ?? message?.Id));
    return {
      ...state,
      byConversation: {
        ...state.byConversation,
        [conversationId]: exists
          ? current.map(item => String(item?.id ?? item?.Id) === String(message?.id ?? message?.Id) ? message : item)
          : [...current, message],
      },
    };
  }),
  on(MessagesActions.messageUpdated, (state, { message }) => {
    const conversationId = String(message?.conversationId ?? '');
    if (!conversationId) {
      return state;
    }

    const current = state.byConversation[conversationId] ?? [];
    return {
      ...state,
      byConversation: {
        ...state.byConversation,
        [conversationId]: current.map(item => String(item?.id ?? item?.Id) === String(message?.id ?? message?.Id) ? message : item),
      },
    };
  }),
  on(MessagesActions.messageDeleted, (state, { messageId }) => ({
    ...state,
    byConversation: Object.fromEntries(
      Object.entries(state.byConversation).map(([conversationId, messages]) => [
        conversationId,
        messages.map(item =>
          String(item?.id ?? item?.Id) === String(messageId)
            ? { ...item, isDeleted: true, content: 'This message was deleted' }
            : item
        ),
      ])
    ),
  })),
  on(MessagesActions.clearConversation, (state, { conversationId }) => ({
    ...state,
    byConversation: {
      ...state.byConversation,
      [conversationId]: [],
    },
  })),
  on(MessagesActions.reset, () => initialState)
);

export const messagesFeature = createFeature({
  name: 'messages',
  reducer,
});
