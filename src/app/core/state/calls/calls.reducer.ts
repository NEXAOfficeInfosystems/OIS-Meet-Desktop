import { createFeature, createReducer, on } from '@ngrx/store';
import { CallsActions } from './calls.actions';

export interface CallsState {
  activeCall: any | null;
  loading: boolean;
  error: string | null;
  lastEvent: string | null;
}

const initialState: CallsState = {
  activeCall: null,
  loading: false,
  error: null,
  lastEvent: null,
};

const reducer = createReducer(
  initialState,
  on(CallsActions.loadCall, state => ({ ...state, loading: true, error: null })),
  on(CallsActions.loadCallSuccess, (state, { call }) => ({ ...state, loading: false, activeCall: call })),
  on(CallsActions.loadCallFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(CallsActions.callStarted, (state, { call }) => ({ ...state, activeCall: call, lastEvent: 'CallStarted' })),
  on(CallsActions.userJoinedCall, (state) => ({ ...state, lastEvent: 'UserJoinedCall' })),
  on(CallsActions.userLeftCall, (state) => ({ ...state, lastEvent: 'UserLeftCall' })),
  on(CallsActions.callEnded, (state) => ({ ...state, lastEvent: 'CallEnded', activeCall: null })),
  on(CallsActions.reset, () => initialState)
);

export const callsFeature = createFeature({
  name: 'calls',
  reducer,
});
