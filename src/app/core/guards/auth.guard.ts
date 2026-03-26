import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ElectronAuthService } from '../services/electron-auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const electronAuth = inject(ElectronAuthService);

  // If running in Electron, ensure auth is restored (async) before
  // allowing navigation. `ensureAuth()` returns a Promise<boolean>.
  if ((window as any).oisMeet?.isElectron) {
    return electronAuth.ensureAuth().then(ok => ok ? true : router.parseUrl('/login'));
  }

  if (auth.isAuthenticated()) return true;

  return router.parseUrl('/login');
};
