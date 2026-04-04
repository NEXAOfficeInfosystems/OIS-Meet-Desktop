import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideStore, provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { environment } from '../environments/environment';

import { routes } from './app.routes';
import { messagesFeature } from './core/state/messages/messages.reducer';
import { notificationsFeature } from './core/state/notifications/notifications.reducer';
import { callsFeature } from './core/state/calls/calls.reducer';
import { presenceFeature } from './core/state/presence/presence.reducer';
import { MessagesEffects } from './core/state/messages/messages.effects';
import { NotificationsEffects } from './core/state/notifications/notifications.effects';
import { CallsEffects } from './core/state/calls/calls.effects';
import { PresenceEffects } from './core/state/presence/presence.effects';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  // withHashLocation() is required for the Electron EXE (file:// context).
  // Electron loads Angular via loadFile(index.html, { hash: '/meeting/...' }),
  // which puts the route in the URL fragment (#).  Without hash routing,
  // Angular's HTML5 router ignores the fragment and always lands on login.
  providers: [
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
    provideStore(),
    provideState(messagesFeature),
    provideState(notificationsFeature),
    provideState(callsFeature),
    provideState(presenceFeature),
    provideEffects(MessagesEffects, NotificationsEffects, CallsEffects, PresenceEffects),
    provideStoreDevtools({ maxAge: 25, logOnly: environment.production })
  ]
};

