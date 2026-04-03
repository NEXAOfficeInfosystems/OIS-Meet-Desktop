import { createFeature, createReducer, on } from '@ngrx/store';
import { NotificationsActions } from './notifications.actions';

export interface NotificationsState {
  items: any[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

const initialState: NotificationsState = {
  items: [],
  unreadCount: 0,
  loading: false,
  error: null,
};

const reducer = createReducer(
  initialState,
  on(NotificationsActions.loadNotifications, state => ({ ...state, loading: true, error: null })),
  on(NotificationsActions.loadNotificationsSuccess, (state, { notifications, unreadCount }) => ({
    ...state,
    loading: false,
    items: [...notifications],
    unreadCount,
  })),
  on(NotificationsActions.loadNotificationsFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(NotificationsActions.notificationReceived, (state, { notification }) => ({
    ...state,
    items: [notification, ...state.items],
    unreadCount: notification?.isRead ? state.unreadCount : state.unreadCount + 1,
  })),
  on(NotificationsActions.markAsReadSuccess, (state, { notificationIds }) => ({
    ...state,
    items: state.items.map(item => notificationIds.includes(String(item?.id ?? item?.Id)) ? { ...item, isRead: true } : item),
    unreadCount: Math.max(0, state.unreadCount - notificationIds.length),
  })),
  on(NotificationsActions.reset, () => initialState)
);

export const notificationsFeature = createFeature({
  name: 'notifications',
  reducer,
});
