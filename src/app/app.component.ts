import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ElectronAuthService } from './core/services/electron-auth.service';
import { TitleBarComponent } from './shared/layout/title-bar/title-bar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TitleBarComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'ois-meet-desktop';
  isElectron = !!(window as any).windowAPI;
  constructor(private _electronAuth: ElectronAuthService) {
    // Inject to ensure ElectronAuthService is instantiated early
  }
}
