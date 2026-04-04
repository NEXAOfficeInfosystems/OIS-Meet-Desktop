import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const session = inject(SessionService);
  
  const token = auth.getSSOToken();
  const userId = session.getUserId();

  let cloned = req;

  // Add Auth Header if token exists
  if (token) {
    cloned = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  // Also append userId as query param for controllers that fallback to it
  if (userId && !req.params.has('userId')) {
    cloned = cloned.clone({
      setParams: {
        userId: userId
      }
    });
  }

  return next(cloned);
};
