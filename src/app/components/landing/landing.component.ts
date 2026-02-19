import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {

  constructor(
    private router: Router
  ) { }
  joinMeeting(){
    this.router.navigate(['/join-meeting']);
  }
  goback() {
    window.history.back();
  }
}
