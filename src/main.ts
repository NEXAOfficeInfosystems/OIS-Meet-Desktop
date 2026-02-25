declare global {
  interface Window {
    process?: any;
  }
}

if (typeof window !== 'undefined') {
  const w = window as any;
  if (!w.process) {
    w.process = {};
  }
  if (!w.process.env) {
    w.process.env = { NODE_ENV: 'production' };
  }
  if (typeof w.process.nextTick !== 'function') {
    w.process.nextTick = (cb: (...args: any[]) => void, ...args: any[]) => {
      Promise.resolve().then(() => cb(...args));
    };
  }
}

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
