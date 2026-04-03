import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const PresenceActions = createActionGroup({
  source: 'Presence',
  events: {
    'Sync Online Users': props<{ onlineUserIds: string[] }>(),
    'User Status Changed': props<{ userId: string; status: string }>(),
    'Reset': emptyProps(),
  }
});
