import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { AppLayoutComponent } from './shared/layout/app-layout/app-layout.component';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'login' },
	{ path: 'login', component: LoginComponent },
	{
		path: '',
		component: AppLayoutComponent,
		children: [
			{ path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] }
		]
	},
	{ path: '**', redirectTo: 'login' }
];
