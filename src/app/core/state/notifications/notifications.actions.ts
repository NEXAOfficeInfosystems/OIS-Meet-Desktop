import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const NotificationsActions = createActionGroup({
  source: 'Notifications',
  events: {
    'Load Notifications': emptyProps(),
    'Load Notifications Success': props<{ notifications: any[]; unreadCount: number }>(),
    'Load Notifications Failure': props<{ error: string }>(),
    'Notification Received': props<{ notification: any }>(),
    'Mark As Read': props<{ notificationIds: string[] }>(),
    'Mark As Read Success': props<{ notificationIds: string[] }>(),
    'Reset': emptyProps(),
  }
});
