import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-scroll-to-bottom-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scroll-to-bottom-button.component.html',
  styleUrl: './scroll-to-bottom-button.component.scss'
})
export class ScrollToBottomButtonComponent {
  unreadCount = input<number>(0);
  isVisible = input<boolean>(false);
  clicked = output<void>();

  onClick() {
    this.clicked.emit();
  }
}
