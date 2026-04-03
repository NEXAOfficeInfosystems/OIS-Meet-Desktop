import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const CallsActions = createActionGroup({
  source: 'Calls',
  events: {
    'Load Call': props<{ callId: string }>(),
    'Load Call Success': props<{ call: any }>(),
    'Load Call Failure': props<{ error: string }>(),
    'Call Started': props<{ call: any }>(),
    'User Joined Call': props<{ callId: string; userId: string; userName?: string | null }>(),
    'User Left Call': props<{ callId: string; userId: string; userName?: string | null }>(),
    'Call Ended': props<{ callId: string }>(),
    'Invite Received': props<{ callId: string; userId?: string }>(),
    'Reset': emptyProps(),
  }
});
