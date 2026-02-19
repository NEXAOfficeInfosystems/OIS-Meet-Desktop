import { Component } from '@angular/core';

@Component({
  selector: 'app-coming-soon',
  template: `
    <div class="d-flex flex-column justify-content-center align-items-center vh-100 text-center bg-light mb-5">
      <h1 class="display-3 mb-3">🚀 Coming Soon!</h1>
      <p class="lead mb-4">We are working hard to bring this feature to you.</p>
      <button class="btn btn-primary btn-lg" (click)="goBack()">Go Back</button>
    </div>
  `,
  standalone: true
})
export class ComingSoonComponent {
  goBack() {
    window.history.back();
  }
}
