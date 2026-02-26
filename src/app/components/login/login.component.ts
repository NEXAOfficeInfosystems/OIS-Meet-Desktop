import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Observable, of, Subject } from 'rxjs';
import { catchError, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { SsoApiService } from '../../core/services/sso-api.service';
import { AuthService } from '../../core/services/auth.service';
import { StorageService } from '../../core/services/storage.service';
import { encryptValueSixteen } from '../../core/utils/encrypt';
import { CommonService } from '../../core/services/common.service';
import { SessionService } from '../../core/services/session.service';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit, OnDestroy {

  private readonly destroy$ = new Subject<void>();

  @ViewChild('emailInput') private emailInput?: ElementRef<HTMLInputElement>;
  @ViewChild('useridInput') private useridInput?: ElementRef<HTMLInputElement>;
  @ViewChild('mobileInput') private mobileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') private passwordInput?: ElementRef<HTMLInputElement>;
  @ViewChild('captchaInput') private captchaInput?: ElementRef<HTMLInputElement>;

  /* =======================
      FORM DATA
  ======================== */
  userID = '';
  password = '';
  enteredCode = '';
  selectedTab: 'email' | 'userid' | 'mobile' = 'email';

  /* =======================
      UI STATE
  ======================== */
  isPasswordVisible = false;
  isRememberMeChecked = false;
  showLoading = false;
  loadingMessage = 'Signing in...';
  formError: string | null = null;

  /* =======================
      CAPTCHA
  ======================== */
  captcha: any = null;

  constructor(
    private ssoApiService: SsoApiService,
    private authService: AuthService,
    private storageService: StorageService,
    private commonService: CommonService,
    private sessionService: SessionService,
    private userService: UserService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.getCaptcha();
    this.loadRememberedData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* =======================
      TAB CHANGE
  ======================== */
  showTab(tab: 'email' | 'userid' | 'mobile'): void {
    this.selectedTab = tab;
    this.userID = '';
    this.password = '';
    this.enteredCode = '';
    this.formError = null;
    this.getCaptcha();

    // Wait for the DOM to render the new tab, then focus.
    setTimeout(() => this.focusUserIdField(), 0);
  }

  /* =======================
      FORM SUBMIT
  ======================== */
  onSubmit(): void {
    this.formError = null;
    if (!this.validateInputs()) return;
    this.showLoading = true;
    this.loadingMessage = 'Validating CAPTCHA...';
    this.validateCaptchaAndLogin();
  }

  /* =======================
      VALIDATION
  ======================== */
  validateInputs(): boolean {
    const userId = (this.userID ?? '').toString().trim();
    const password = (this.password ?? '').toString().trim();

    if (!userId) {
      this.formError = this.getUserIdRequiredMessage();
      this.focusUserIdField();
      return false;
    }

    if (!password) {
      this.formError = 'Password is required.';
      this.focusPasswordField();
      return false;
    }

    this.userID = userId;
    this.password = password;

    if (this.selectedTab === 'email' && !this.isValidEmail(userId)) {
      this.formError = 'Please enter a valid email address.';
      this.focusUserIdField();
      return false;
    }

    if (this.selectedTab === 'mobile' && !this.isValidMobile(userId)) {
      this.formError = 'Please enter a valid mobile number (6–15 digits).';
      this.focusUserIdField();
      return false;
    }

    return true;
  }

  private getUserIdRequiredMessage(): string {
    switch (this.selectedTab) {
      case 'email':
        return 'Email is required.';
      case 'mobile':
        return 'Mobile number is required.';
      case 'userid':
      default:
        return 'User ID is required.';
    }
  }

  /* =======================
      CAPTCHA VALIDATION
  ======================== */
  validateCaptchaAndLogin(): void {

    if (!this.enteredCode.trim()) {
      this.formError = 'Please enter the CAPTCHA code.';
      this.focusCaptchaField();
      this.showLoading = false;
      return;
    }

    const payload = {
      id: this.captcha?.captchaId,
      captchaCode: this.enteredCode
    };

    this.ssoApiService.getCaptchaValidation(payload).subscribe({
      next: () => this.login(),
      error: () => {
        this.formError = 'Invalid CAPTCHA. Please try again.';
        this.resetCaptcha();
        this.showLoading = false;
      }
    });
  }

 /* =======================
      LOGIN
  ======================== */
  login(): void {
    this.showLoading = true;
    this.loadingMessage = 'Signing in...';
    this.saveRememberMe();

    const userId = (this.userID ?? '').toString();
    const password = (this.password ?? '').toString();

    const encryptedData = encryptValueSixteen(JSON.stringify({
      User_ID: userId,
      Pwd: password,
      calltype: 'loginaction',
      ApplicationName: 'GM'
    }));

    this.ssoApiService.authenticateUser(encryptedData).pipe(takeUntil(this.destroy$)).subscribe({
        next: (res) => {
          const result = res?.response?.table?.[0];
          if (result?.successflag === 1) {
            this.formError = null;
            this.authService.setSession(result.token, res?.encryptedJson);
            this.loadingMessage = 'Loading your workspace...';
            this.loadPostLoginData(result.token, res?.encryptedJson);
          } else {
            this.handleLoginError(result?.responsemessage || 'Invalid credentials. Please try again.');
            this.resetCaptcha();
          }
        },
        error: () => {
          this.handleLoginError('Login failed. Please try again.');
          this.resetCaptcha();
        }
      });
  }

  /* =======================
      POST LOGIN DATA
  ======================== */
private loadPostLoginData(token: string, userinfo: string): void {
  this.ssoApiService.getUserDetails(token, userinfo).pipe(
    takeUntil(this.destroy$),
    tap((user: any) => {
      this.storageService.setObject(
        'userDetails',
        this.storageService.pickUserDetailsForStorage(user)
      );
    }),
    switchMap((user: any) => {
      const userId = user?.Id;
      if (!userId) {
        throw new Error('UserId not found in GetUser response.');
      }
      return this.ssoApiService.getApplicationList(token, userinfo, userId)
        .pipe(
          switchMap((apps: any[]) => {
            const meetApp = apps.find(app =>
              app.Code === 'DMS' ||
              app.Code === 'OISVault' ||
              app.Code === 'Vault'
            );

            if (!meetApp?.ApplicationId) {
              throw new Error('Meet app not found in application list.');
            }

            this.storageService.setItem('meetAppId', meetApp.ApplicationId.toString());
            this.storageService.setItem('applicationName', meetApp.ApplicationName ?? '');

            return forkJoin({
              meetUrl: this.ssoApiService.getMeetUrl(token, userinfo, meetApp.ApplicationId),
              companyUrl: this.ssoApiService.getCompanyURL(token, userinfo, userId, meetApp.ApplicationId),
            });
          })
        );
    }),
    // ADD THIS: Sync users BEFORE navigation
    switchMap(({ meetUrl, companyUrl }) => {
      const appUrl: string | null = (meetUrl?.appURL ?? meetUrl?.AppURL ?? null);
      const companies = (companyUrl.data ?? []).map((x: any) => x.company);
      this.commonService.setCompanies(companies);

      if (appUrl) {
        this.storageService.setItem('applicationUrl', appUrl);
        const appToken = this.storageService.extractTokenFromAppUrl(appUrl);
        if (appToken) {
          this.storageService.setItem('applicationToken', appToken);
        }
      }

      const defaultCompany = this.commonService.pickDefaultCompanyForStorage(companyUrl);
      if (defaultCompany) {
        this.storageService.setObject('defaultCompany', defaultCompany);
      }

      // Sync users NOW before navigating
      this.loadingMessage = 'Syncing users...';
      // return this.syncUsersBeforeNavigation(token, userinfo).pipe(
      //   map(() => ({ meetUrl, companyUrl }))
      // );
      return this.syncUsersBeforeNavigation(token, userinfo).pipe(
        switchMap(() => {
          const clientId = this.sessionService.getClientId() ?? '';
          const companyId = this.sessionService.getCompanyId() ?? 0;

          return this.userService.getOisMeetUsers(clientId, companyId);
        }),
        tap((res: any) => {
          if (res?.success && res?.data?.length) {

            const loggedInSSOUserId = this.sessionService.getUserId() || '';

            const currentUser = res.data.find(
              (u: any) => u.ssoUserId === loggedInSSOUserId
            );

            if (currentUser) {
              this.storageService.setItem('oisMeetUserId', currentUser.id);
              console.log('OIS Meet UserId stored:', currentUser.id);
            } else {
              console.warn('Logged-in user not found in OIS Users table');
            }
          }
        }),
        map(() => ({ meetUrl, companyUrl }))
      );
    })
  )
  .subscribe({
    next: () => {
      this.showLoading = false;
      this.router.navigateByUrl('/chat');
    },
    error: (err) => {
      console.error('Post-login data load failed:', err);
      this.handleLoginError('Unable to load user details. Please try again.');
    }
  });
}

  /* =======================
      BACKGROUND SSO SYNC
  ======================== */
private syncUsersBeforeNavigation(token: string, userinfo: string): Observable<any> {
  // if (sessionStorage.getItem('ssoSynced')) {
  //   return of(null);
  // }

  const client = this.sessionService.getClientId() ?? '';
  const companyId = this.sessionService.getCompanyId() ?? 0;
  const appId = this.sessionService.getMeetAppId() ?? '';

  return this.ssoApiService.getSSOUserList(token, userinfo, client, companyId.toString(), appId)
    .pipe(
      switchMap((ssoUsers: any[]) => {
        if (ssoUsers.length === 0) {
          console.warn('No users to sync');
          return of(null);
        }

        // Pass client and company to sync method
        return this.userService.syncSsoUsers(ssoUsers, client, companyId);
      }),
      tap((response) => {
        if (response) {
        }
        // sessionStorage.setItem('ssoSynced', 'true');
      }),
      catchError(error => {
        return of(null);
      })
    );
}



  private handleLoginError(message: string) {
    this.showLoading = false;
    this.formError = message;
  }

  /* =======================
      CAPTCHA
  ======================== */
  getCaptcha(): void {
    this.ssoApiService.getCaptcha().subscribe({
      next: res => this.captcha = res
    });
  }

  resetCaptcha(): void {
    this.enteredCode = '';
    this.getCaptcha();
  }

  /* =======================
      REMEMBER ME
  ======================== */
  saveRememberMe(): void {
    if (!this.isRememberMeChecked) {
      this.storageService.removeItem('rememberedLogin');
      return;
    }

    this.storageService.setObject('rememberedLogin', {
      selectedTab: this.selectedTab,
      userID: this.userID,
      password: this.password,
    });
  }

  loadRememberedData(): void {
    const data = this.storageService.getObject<any>('rememberedLogin');
    if (data) {
      this.selectedTab = data.selectedTab;
      this.userID = data.userID;
      this.password = data.password;
      this.isRememberMeChecked = true;
      return;
    }

    const legacy = localStorage.getItem('rememberedLogin');
    if (!legacy) return;

    try {
      const legacyData = JSON.parse(legacy);
      this.selectedTab = legacyData.selectedTab;
      this.userID = legacyData.userID;
      this.password = legacyData.password;
      this.isRememberMeChecked = true;

      this.storageService.setObject('rememberedLogin', {
        selectedTab: this.selectedTab,
        userID: this.userID,
        password: this.password,
      });

      localStorage.removeItem('rememberedLogin');
    } catch {
      // Ignore invalid legacy data
    }
  }

  /* =======================
      HELPERS
  ======================== */
  togglePasswordVisibility(): void {
    this.isPasswordVisible = !this.isPasswordVisible;
  }

  private focusUserIdField(): void {
    switch (this.selectedTab) {
      case 'email':
        this.focusElement(this.emailInput);
        return;
      case 'mobile':
        this.focusElement(this.mobileInput);
        return;
      case 'userid':
      default:
        this.focusElement(this.useridInput);
        return;
    }
  }

  private focusPasswordField(): void {
    this.focusElement(this.passwordInput);
  }

  private focusCaptchaField(): void {
    this.focusElement(this.captchaInput);
  }

  private focusElement(el?: ElementRef<HTMLInputElement>): void {
    const native = el?.nativeElement;
    if (!native) return;
    setTimeout(() => {
      native.focus();
      native.select?.();
    }, 0);
  }

  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  isValidMobile(mobile: string): boolean {
    return /^[0-9]{6,15}$/.test(mobile);
  }
}
