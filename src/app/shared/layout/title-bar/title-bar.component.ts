import { Component, ElementRef, HostListener, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MeetNowDialogComponent } from '../../../components/meet-now-dialog/meet-now-dialog.component';
import { CommonService } from '../../../core/services/common.service';
import { SsoApiService } from '../../../core/services/sso-api.service';
import { StorageService } from '../../../core/services/storage.service';
import { ConfirmationDialogComponent } from '../confirmation-dialog.component';
import { switchMap } from 'rxjs';
import { UserService } from '../../../core/services/user.service';

type ThemeMode = 'light' | 'dark';

@Component({
  selector: 'app-title-bar',
  standalone: true,
  imports: [RouterLink, CommonModule, MatDialogModule, MeetNowDialogComponent],
  templateUrl: './title-bar.component.html',
  styleUrl: './title-bar.component.scss'
})
export class TitleBarComponent implements OnInit {
  isMaximized = false;
  isElectron = !!(window as any).windowAPI;

  readonly isAuthenticated$ = this.auth.isAuthenticated$;
  readonly appTitle = computed(() => 'OIS Meet');

  theme: ThemeMode = (localStorage.getItem('ois.theme') as ThemeMode) ?? 'light';
  isUserMenuOpen = false;
  isCompanyMenuOpen = false;
  userFullName: string | null = null;
  selectedCompanyId: number | null = null;
  companyList: any[] = [];

  constructor(
    private hostEl: ElementRef,
    private auth: AuthService,
    private router: Router,
    private sessionService: SessionService,
    private commonService: CommonService,
    private ssoApiService: SsoApiService,
    private storageService: StorageService,
    private userService: UserService,
    private dialog: MatDialog
  ) {
    this.userFullName = this.sessionService.getFullName();
    this.applyThemeToDocument();
  }

  ngOnInit(): void {
    if (this.isElectron) {
      this.updateMaximizedState();
      window.addEventListener('resize', () => {
        this.updateMaximizedState();
      });
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
    this.applyThemeToDocument();
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  toggleUserMenu(event: MouseEvent) {
    event.stopPropagation();
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.isUserMenuOpen) return;
    const target = event.target as Node | null;
    if (target && this.hostEl.nativeElement.contains(target)) return;
    this.isUserMenuOpen = false;
  }

  private applyThemeToDocument() {
    const body = document.body;
    body.classList.toggle('theme-dark', this.theme === 'dark');
    body.classList.toggle('theme-light', this.theme === 'light');
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
}
