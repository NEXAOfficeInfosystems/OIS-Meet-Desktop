import { Component } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-join-meeting',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './join-meeting.component.html',
  styleUrl: './join-meeting.component.scss'
})
export class JoinMeetingComponent {
  joinForm: FormGroup;

  constructor(private fb: FormBuilder, private sessionService: SessionService) {
    const userFullName = this.sessionService.getFullName() || '';
    this.joinForm = this.fb.group({
      name: new FormControl(userFullName, [Validators.required]),
      meetingId: new FormControl('', [Validators.required])
    });
  }

  onSubmit() {
    if (this.joinForm.valid) {
      const { name, meetingId } = this.joinForm.value;
    }
  }

  goback() {
    window.history.back();
  }

}
