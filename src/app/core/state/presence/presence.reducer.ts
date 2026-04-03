import { createFeature, createReducer, on } from '@ngrx/store';
import { PresenceActions } from './presence.actions';

export interface PresenceState {
  onlineUserIds: string[];
  statuses: Record<string, string>;
}

const initialState: PresenceState = {
  onlineUserIds: [],
  statuses: {},
};

const reducer = createReducer(
  initialState,
  on(PresenceActions.syncOnlineUsers, (state, { onlineUserIds }) => ({
    ...state,
    onlineUserIds: [...new Set(onlineUserIds)],
  })),
  on(PresenceActions.userStatusChanged, (state, { userId, status }) => ({
    ...state,
    statuses: {
      ...state.statuses,
      [userId]: status,
    },
    onlineUserIds: status === 'online'
      ? [...new Set([...state.onlineUserIds, userId])]
      : state.onlineUserIds.filter(id => id !== userId),
  })),
  on(PresenceActions.reset, () => initialState)
);

export const presenceFeature = createFeature({
  name: 'presence',
  reducer,
});
