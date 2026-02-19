import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { StoredDefaultCompany, StoredUserDetails } from '../../core/models/session.models';
import { SessionService } from '../../core/services/session.service';

interface DashboardSession {
  ssoToken: string | null;
  userDetails: StoredUserDetails | null;
  defaultCompany: StoredDefaultCompany | null;
  meetAppId: string | null;
  applicationName: string | null;
  applicationUrl: string | null;
  applicationToken: string | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
   userFullName: string | null = null;

  // session: DashboardSession | null = null;
  // defaultCompany: string | null = null;
  // clinetId: string | null = null;
  // companyId:string | number | null = null;
  // companyLogo: string | null = null;
  // applicationName: string | null = null;
  // appplicationToken: string | null = null;
  // ssoToken: string | null = null;

  constructor(
    private authService: AuthService,
    private sessionService: SessionService,
    private router: Router
  ) { }

  ngOnInit() {
    this.userFullName = this.sessionService.getFullName();

    // this.session = this.sessionService.getSession();
    // this.defaultCompany = this.sessionService.getCompanyName();
    // this.clinetId = this.sessionService.getClientId();
    // this.companyId = this.sessionService.getCompanyId();
    // this.companyLogo = this.sessionService.getCompanyLogo();
    // this.applicationName = this.sessionService.getApplicationName();
    // this.appplicationToken = this.sessionService.getApplicationToken();
    // this.ssoToken = this.sessionService.getSsoToken();
    // console.log('Session Data:', this.session);
  }

  logout() {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
  gotoLandingPage() {
      this.router.navigateByUrl('/landing');
  }
}
