import { Component, ElementRef, HostListener, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';

type ThemeMode = 'light' | 'dark';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {



  readonly isAuthenticated$ = this.auth.isAuthenticated$;
  readonly appTitle = computed(() => 'OIS Meet Desktop');

  theme: ThemeMode = (localStorage.getItem('ois.theme') as ThemeMode) ?? 'light';
  isUserMenuOpen = false;
  userFullName: string | null = null;

  constructor(
    private hostEl: ElementRef,
    private auth: AuthService,
    private router: Router,
    private sessionService: SessionService
  ) {
    this.userFullName = this.sessionService.getFullName();
    this.applyThemeToDocument();
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
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
