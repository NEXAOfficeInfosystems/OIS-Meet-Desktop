import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule,CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  password = '';
  error = '';

  submit() {
    this.error = '';
    const ok = this.auth.login(this.username, this.password);
    if (!ok) {
      this.error = 'Please enter username and password.';
      return;
    }

    void this.router.navigateByUrl('/dashboard');
  }
}
