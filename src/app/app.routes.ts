import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { AppLayoutComponent } from './shared/layout/app-layout/app-layout.component';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LandingComponent } from './components/landing/landing.component';
import { JoinMeetingComponent } from './components/join-meeting/join-meeting.component';
import { ChatComponent } from './components/chat/chat.component';
import { ComingSoonComponent } from './components/comming-soon.component';
import { MeetingComponent } from './components/meeting/meeting.component';
import { ActivityFeedComponent } from './components/activity-feed/activity-feed.component';
import { NotificationsPanelComponent } from './components/notifications-panel/notifications-panel.component';
import { CallsCenterComponent } from './components/calls-center/calls-center.component';
import { TeamsPanelComponent } from './components/teams-panel/teams-panel.component';
import { FilesPanelComponent } from './components/files-panel/files-panel.component';

export const routes: Routes = [

  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginComponent },
  { path: 'meeting/:meetingId', component: MeetingComponent , canActivate:[authGuard]},
  {
    path: '',
    component: AppLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'landing', component: LandingComponent },
      { path: 'join-meeting', component: JoinMeetingComponent },
      { path: 'chat', component: ChatComponent },
      { path: 'activity', component: ActivityFeedComponent },
      { path: 'notifications', component: NotificationsPanelComponent },
      { path: 'calls', component: CallsCenterComponent },
      { path: 'teams', component: TeamsPanelComponent },
      { path: 'files', component: FilesPanelComponent },
      { path: 'coming-soon', component: ComingSoonComponent },

    ]
  },

  { path: '**', redirectTo: 'login' }
];
