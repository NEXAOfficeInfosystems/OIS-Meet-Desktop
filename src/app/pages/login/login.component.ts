import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subject } from 'rxjs';
import { switchMap, takeUntil, tap } from 'rxjs/operators';
import { SsoApiService } from '../../core/services/sso-api.service';
import { AuthService } from '../../core/services/auth.service';
import { encryptValueSixteen } from '../../core/utils/encrypt';

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

    this.ssoApiService.authenticateUser(encryptedData).subscribe({
      next: (res) => {
        const result = res?.response?.table?.[0];
        if (result?.successflag === 1) {
          this.formError = null;
          this.authService.setSession(result.token);
          this.showLoading = true;
          this.loadingMessage = 'Loading your workspace...';
          this.loadPostLoginData(result.token, res?.encryptedJson);
        } else {
          this.showLoading = false;
          this.formError = result?.responsemessage || 'Invalid credentials. Please try again.';
          this.resetCaptcha();
        }
      },
      error: () => {
        this.showLoading = false;
        this.formError = 'Login failed. Please try again.';
        this.resetCaptcha();
      }
    });
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
      localStorage.removeItem('rememberedLogin');
      return;
    }

    localStorage.setItem('rememberedLogin', JSON.stringify({
      selectedTab: this.selectedTab,
      userID: this.userID,
      password: this.password
    }));
  }

  loadRememberedData(): void {
    const saved = localStorage.getItem('rememberedLogin');
    if (!saved) return;

    const data = JSON.parse(saved);
    this.selectedTab = data.selectedTab;
    this.userID = data.userID;
    this.password = data.password;
    this.isRememberMeChecked = true;
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


  private loadPostLoginData(token: string, userinfo: string): void {
    this.ssoApiService.getUserDetails(token, userinfo).pipe(
      takeUntil(this.destroy$),
      tap((user) => console.log('User details response:', user)),
      switchMap((user) => {
        const userId = user?.Id;
        if (!userId) {
          throw new Error('UserId not found in GetUser response.');
        }

        return this.ssoApiService.getApplicationList(token, userinfo, userId).pipe(
          tap((apps) => console.log('Application list response:', apps)),
          switchMap((apps) => {
            const dmsApp = apps.find(app =>
              app?.Code === 'DMS' || app?.Code === 'OISVault' || app?.Code === 'Vault'
            );

            const appId = dmsApp?.ApplicationId;
            if (!appId) {
              throw new Error('DMS/Vault app not found in application list.');
            }

            return forkJoin({
              dmsUrl: this.ssoApiService.getDMSUrl(token, userinfo, appId),
              companyUrl: this.ssoApiService.getCompanyURL(token, userinfo, userId, appId),
            });
          })
        );
      })
    ).subscribe({
      next: ({ dmsUrl, companyUrl }) => {
        console.log('DMS URL response:', dmsUrl);
        console.log('Company URL response:', companyUrl);
        this.showLoading = false;
        this.router.navigateByUrl('/dashboard');
      },
      error: (err) => {
        console.error('Post-login data load failed:', err);
        this.showLoading = false;
        this.formError = 'Unable to load user details. Please try again.';
      }
    });
  }
}
