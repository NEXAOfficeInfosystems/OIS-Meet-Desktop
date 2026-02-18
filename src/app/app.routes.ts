import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { AppLayoutComponent } from './shared/layout/app-layout/app-layout.component';

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
