import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { StorageService } from '../../core/services/storage.service';
import { StoredDefaultCompany, StoredUserDetails } from '../../core/models/session.models';

interface DashboardSession {
  ssoToken: string | null;
  userDetails: StoredUserDetails | null;
  defaultCompany: StoredDefaultCompany | null;
  dmsAppId: string | null;
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
  session: DashboardSession | null = null;

  constructor(
    private storageService: StorageService,
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    this.session = this.getSession();
    console.log('Dashboard session data:', this.session);
  }

  private getSession(): DashboardSession {
    return {
      ssoToken: this.authService.getToken(),
      userDetails: this.storageService.getObject<StoredUserDetails>('userDetails'),
      defaultCompany: this.storageService.getObject<StoredDefaultCompany>('defaultCompany'),
      dmsAppId: this.storageService.getItem('dmsAppId'),
      applicationName: this.storageService.getItem('applicationName'),
      applicationUrl: this.storageService.getItem('applicationUrl'),
      applicationToken: this.storageService.getItem('applicationToken'),
    };
  }

  logout() {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
