import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { AppLayoutComponent } from './shared/layout/app-layout/app-layout.component';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LandingComponent } from './components/landing/landing.component';
import { JoinMeetingComponent } from './components/join-meeting/join-meeting.component';
import { ChatComponent } from './components/chat/chat.component';

export const routes: Routes = [

  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'landing', component: LandingComponent },
      { path: 'join-meeting', component: JoinMeetingComponent },
      { path: 'chat', component: ChatComponent }

    ]
  },

  { path: '**', redirectTo: 'login' }
];
