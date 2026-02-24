import { Component, ElementRef, HostListener, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MeetNowDialogComponentModule } from '../../../components/meet-now-dialog/meet-now-dialog.component.module';
import { MeetNowDialogComponent } from '../../../components/meet-now-dialog/meet-now-dialog.component';
import { CommonService } from '../../../core/services/common.service';
import { SsoApiService } from '../../../core/services/sso-api.service';
import { StorageService } from '../../../core/services/storage.service';
import { ConfirmationDialogComponent } from '../confirmation-dialog.component';
import { switchMap } from 'rxjs';
import { ChatService } from '../../../core/services/chat.service';

type ThemeMode = 'light' | 'dark';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, CommonModule, MatDialogModule, MeetNowDialogComponentModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {



  readonly isAuthenticated$ = this.auth.isAuthenticated$;
  readonly appTitle = computed(() => 'OIS Meet Desktop');

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
    private chatService: ChatService,
    private dialog: MatDialog
  ) {
    this.userFullName = this.sessionService.getFullName();
    this.applyThemeToDocument();
  }

ngOnInit() {
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

  // Store the selected company info in session storage for chat component
  sessionStorage.setItem('selectedCompanyId', company.companyId.toString());
  sessionStorage.setItem('selectedClientId', this.sessionService.getClientId() ?? '');

  // Remove sync flag to force re-sync
  sessionStorage.removeItem('ssoSynced');

  // First notify that company is changing (chat will clear data and show loading)
  this.commonService.notifyCompanyChanged(company);

  // Then trigger re-sync
  this.resyncUsersForCompany(company);
}


private resyncUsersForCompany(company: any) {
  const token = this.auth.getSSOToken() ?? '';
  const userinfo = this.auth.getEncryptedJson() ?? '';
  const client = this.sessionService.getClientId() ?? '';
  const appId = this.sessionService.getMeetAppId() ?? '';

  if (!token || !userinfo) {
    console.error('No token or userinfo found');
    return;
  }

  console.log('🔄 Re-syncing users for company:', company);

  this.ssoApiService.getSSOUserList(token, userinfo, client, company.companyId.toString(), appId)
    .pipe(
      switchMap((ssoUsers: any[]) => {
        console.log(`📥 Fetched ${ssoUsers.length} users from SSO for new company`);
        return this.chatService.syncSsoUsers(ssoUsers, client, company.companyId);
      })
    )
    .subscribe({
      next: (response) => {
        console.log('✅ Users re-synced for new company:', response);
        sessionStorage.setItem('ssoSynced', 'true');

        // Notify that sync is complete
        this.commonService.notifySyncComplete(company);
      },
      error: (error) => {
        console.error('❌ Failed to re-sync users:', error);
        // Still try to load whatever is available
        this.commonService.notifySyncComplete(company);
      }
    });
}

  generateMeetingId() {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `OIS-${randomId}`;
  }
  openMeetNowDialog(mode: string = 'meet-now') {
    this.dialog.open(MeetNowDialogComponent, {
      width: '320px',
      panelClass: 'meet-now-dialog',
      position: {
        top: '70px',
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
