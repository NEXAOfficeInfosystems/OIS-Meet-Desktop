import { Component, ElementRef, HostListener, OnInit, OnDestroy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MeetNowDialogComponent } from '../../../components/meet-now-dialog/meet-now-dialog.component';
import { CommonService } from '../../../core/services/common.service';
import { SsoApiService } from '../../../core/services/sso-api.service';
import { StorageService } from '../../../core/services/storage.service';
import { ConfirmationDialogComponent } from '../confirmation-dialog.component';
import { switchMap, filter } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { NativeNotificationService } from '../../../core/services/native-notification.service';

type ThemeMode = 'light' | 'dark';

@Component({
  selector: 'app-title-bar',
  standalone: true,
  imports: [RouterLink, CommonModule, MatDialogModule, MeetNowDialogComponent],
  templateUrl: './title-bar.component.html',
  styleUrl: './title-bar.component.scss'
})
export class TitleBarComponent implements OnInit, OnDestroy {
  isMaximized = false;
  isElectron = !!(window as any).windowAPI;
  isLoginPage = false;

  readonly isAuthenticated$ = this.auth.isAuthenticated$;
  readonly appTitle = computed(() => 'OIS Meet');

  theme: ThemeMode = (localStorage.getItem('ois.theme') as ThemeMode) ?? 'light';
  isUserMenuOpen = false;
  isSettingsMenuOpen = false;
  isCompanyMenuOpen = false;
  userFullName: string | null = null;
  selectedCompanyId: number | null = null;
  companyList: any[] = [];
  isMeetingActive = false;
  private meetingCheckInterval: any;

  constructor(
    private hostEl: ElementRef,
    private auth: AuthService,
    private router: Router,
    private sessionService: SessionService,
    private commonService: CommonService,
    private ssoApiService: SsoApiService,
    private storageService: StorageService,
    private userService: UserService,
    private nativeNotify: NativeNotificationService,
    private dialog: MatDialog
  ) {
    this.userFullName = this.sessionService.getFullName();
    this.applyThemeToDocument();
    this.checkRoute(this.router.url);
  }

  ngOnInit(): void {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.checkRoute(event.urlAfterRedirects);
    });

    if (this.isElectron) {
      this.updateMaximizedState();
      window.addEventListener('resize', () => {
        this.updateMaximizedState();
      });

      // Periodically check if a meeting is active to show/hide "Meet Now"
      this.checkMeetingStatus();
      this.meetingCheckInterval = setInterval(() => this.checkMeetingStatus(), 2000);
    }

    const storedCompany = this.storageService.getObject<any>('defaultCompany');
    if (storedCompany) {
      this.selectedCompanyId = storedCompany.companyId;
      this.commonService.setSelectedCompany(storedCompany);
    }

    this.commonService.companyList$.subscribe(companies => {
      if (!companies || companies.length === 0) {
        this.getUserCompanyList();
      } else {
        this.companyList = companies;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.meetingCheckInterval) {
      clearInterval(this.meetingCheckInterval);
    }
  }

  private async checkMeetingStatus() {
    const electronApi = (window as any).oisMeet;
    if (electronApi && typeof electronApi.isMeetingActive === 'function') {
      try {
        this.isMeetingActive = await electronApi.isMeetingActive();
      } catch (err) {
        console.error('Error checking meeting status:', err);
      }
    }
  }

  private checkRoute(url: string) {
    this.isLoginPage = url.includes('/login');
  }

  async updateMaximizedState() {
    if (this.isElectron) {
      this.isMaximized = await (window as any).windowAPI.isMaximized();
    }
  }

  // --- Window Control Logic ---
  onMinimize() {
    if (this.isElectron) {
      (window as any).windowAPI.minimize();
    }
  }

  toggleSidebar(): void {
    this.commonService.toggleSidebar();
  }

  onMaximize() {
    if (this.isElectron) {
      (window as any).windowAPI.maximize();
      this.updateMaximizedState();
    }
  }

  onClose() {
    if (this.isElectron) {
      (window as any).windowAPI.close();
    }
  }

  // --- Header Migration Logic ---
  getUserCompanyList() {
    const token = this.auth.getSSOToken() ?? '';
    const userinfo = this.auth.getEncryptedJson() ?? '';
    const userId = this.sessionService.getUserId() ?? '';
    const appId = this.sessionService.getMeetAppId() ?? '';

    this.ssoApiService.getCompanyURL(token, userinfo, userId, appId)
      .subscribe({
        next: (response: any) => {
          if (response?.status) {
            const companies = (response.data ?? []).map((x: any) => x.company);
            const defaultCompany = this.commonService.pickDefaultCompanyForStorage(response);
            if (defaultCompany) {
              this.storageService.setObject('defaultCompany', defaultCompany);
            }
            this.companyList = companies;
          }
        },
        error: (error) => {
          console.error('Company API Error:', error);
        }
      });
  }

  selectCompany(company: any) {
    this.selectedCompanyId = company.companyId;
    this.storageService.setObject('defaultCompany', company);
    this.commonService.setSelectedCompany(company);
    this.isCompanyMenuOpen = false;
    this.isUserMenuOpen = false;

    sessionStorage.setItem('selectedCompanyId', company.companyId.toString());
    sessionStorage.setItem('selectedClientId', this.sessionService.getClientId() ?? '');
    sessionStorage.removeItem('ssoSynced');

    this.commonService.notifyCompanyChanged(company);
    this.resyncUsersForCompany(company);
  }

  private resyncUsersForCompany(company: any) {
    const token = this.auth.getSSOToken() ?? '';
    const userinfo = this.auth.getEncryptedJson() ?? '';
    const client = this.sessionService.getClientId() ?? '';
    const appId = this.sessionService.getMeetAppId() ?? '';

    if (!token || !userinfo) return;

    this.ssoApiService.getSSOUserList(token, userinfo, client, company.companyId.toString(), appId)
      .pipe(
        switchMap((ssoUsers: any[]) => {
          return this.userService.syncSsoUsers(ssoUsers, client, company.companyId, appId);
        })
      )
      .subscribe({
        next: () => this.commonService.notifySyncComplete(company),
        error: () => this.commonService.notifySyncComplete(company)
      });
  }

  openMeetNowDialog(mode: string = 'meet-now') {
    this.dialog.open(MeetNowDialogComponent, {
      width: '320px',
      panelClass: 'meet-now-dialog',
      position: {
        top: '50px',
        right: '20px'
      },
      data: { mode: mode },
      autoFocus: false,
      hasBackdrop: true,
      disableClose: true
    });
  }

  setTheme(theme: ThemeMode) {
    this.theme = theme;
    localStorage.setItem('ois.theme', theme);
    window.dispatchEvent(new CustomEvent('ois-theme-changed', { detail: theme }));
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  toggleUserMenu(event: MouseEvent) {
    event.stopPropagation();
    this.isUserMenuOpen = !this.isUserMenuOpen;
    if (this.isUserMenuOpen) this.isSettingsMenuOpen = false;
  }

  toggleSettingsMenu(event: MouseEvent) {
    event.stopPropagation();
    this.isSettingsMenuOpen = !this.isSettingsMenuOpen;
    if (this.isSettingsMenuOpen) this.isUserMenuOpen = false;
  }

  async checkForUpdates() {
    this.isSettingsMenuOpen = false;
    if (this.isElectron) {
      try {
        const response = await (window as any).oisMeet.checkForUpdates();
        if (response.success) {
          this.nativeNotify.notify('Info', 'Update check initiated. You will be notified if an update is available.');
        } else {
          this.nativeNotify.notify('Error', 'Failed to check for updates: ' + response.error);
        }
      } catch (err) {
        this.nativeNotify.notify('Error', 'Err: ' + err);
      }
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.isUserMenuOpen && !this.isSettingsMenuOpen) return;
    const target = event.target as Node | null;
    if (target && this.hostEl.nativeElement.contains(target)) return;
    this.isUserMenuOpen = false;
    this.isSettingsMenuOpen = false;
  }

  private applyThemeToDocument() {
    // Logic moved to AppComponent for global consistency (including login page)
    window.dispatchEvent(new CustomEvent('ois-theme-changed', { detail: this.theme }));
  }

  navigateToHome() {
    this.router.navigateByUrl('/dashboard');
  }

  logout() {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: {
        type: 'question',
        title: 'Confirm Logout',
        message: 'Are you sure you want to logout?'
      },
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.auth.logout();
        this.router.navigateByUrl('/login');
      }
    });
  }

  toggleCompanyMenu(event: Event) {
    event.stopPropagation();
    this.isCompanyMenuOpen = !this.isCompanyMenuOpen;
  }

  getSelectedCompanyName(): string {
    const selected = this.companyList.find(c => c.companyId === this.selectedCompanyId);
    return selected?.companyname || 'Select Company';
  }
}
