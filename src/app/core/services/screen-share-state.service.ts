import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ScreenShareState {
  isSharing:    boolean;
  isFullScreen: boolean;
  isFocusMode:  boolean;
  isPinned:     boolean;
  scaleMode:    'fit' | 'fill' | 'original';
  showControls: boolean; // presenter overlay visibility
}

const INITIAL: ScreenShareState = {
  isSharing:    false,
  isFullScreen: false,
  isFocusMode:  false,
  isPinned:     false,
  scaleMode:    'fit',
  showControls: true,
};

@Injectable({ providedIn: 'root' })
export class ScreenShareStateService {
  private _state$ = new BehaviorSubject<ScreenShareState>({ ...INITIAL });

  /** Observable stream of the full state object. */
  readonly state$ = this._state$.asObservable();

  /** Synchronous snapshot – use in template expressions via the component property. */
  get state(): ScreenShareState {
    return this._state$.value;
  }

  patch(partial: Partial<ScreenShareState>): void {
    this._state$.next({ ...this._state$.value, ...partial });
  }

  reset(): void {
    this._state$.next({ ...INITIAL });
  }

  toggleFocusMode(): void {
    this.patch({ isFocusMode: !this.state.isFocusMode });
  }

  togglePinned(): void {
    this.patch({ isPinned: !this.state.isPinned });
  }

  setScaleMode(mode: ScreenShareState['scaleMode']): void {
    this.patch({ scaleMode: mode });
  }

  /** Called when the user hovers over the screen-share stage. */
  showPresenterControls(): void {
    this.patch({ showControls: true });
  }

  hidePresenterControls(): void {
    this.patch({ showControls: false });
  }
}
