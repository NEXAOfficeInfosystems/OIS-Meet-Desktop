import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, FooterComponent, SidebarComponent],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.scss',
})
export class AppLayoutComponent {}
