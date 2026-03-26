import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  // withHashLocation() is required for the Electron EXE (file:// context).
  // Electron loads Angular via loadFile(index.html, { hash: '/meeting/...' }),
  // which puts the route in the URL fragment (#).  Without hash routing,
  // Angular's HTML5 router ignores the fragment and always lands on login.
  providers: [provideRouter(routes, withHashLocation()), provideHttpClient(), provideAnimations()]
};

