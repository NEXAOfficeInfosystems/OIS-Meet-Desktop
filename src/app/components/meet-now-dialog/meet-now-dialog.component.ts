import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { MeetingService } from '../../core/services/meeting.service';

@Component({
  selector: 'app-meet-now-dialog',
  templateUrl: './meet-now-dialog.component.html',
  styleUrls: ['./meet-now-dialog.component.scss']
})
export class MeetNowDialogComponent implements OnInit {
  mode: 'meet-now' | 'join-meeting' = 'meet-now';
  meetingId = '';
  micOn = false; // Default mic OFF
  camOn = false; // Default camera OFF (as requested)
  isValidating = false;
  meetingError = '';

  constructor(
    public dialogRef: MatDialogRef<MeetNowDialogComponent>,
    private clipboard: Clipboard,
    private snackBar: MatSnackBar,
    private router: Router,
    private meetingService: MeetingService,
    private sessionService: SessionService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.mode = data.mode;
  }

  ngOnInit() {
    if (this.mode === 'meet-now') {
      this.createNewMeeting();
    }
  }

  createNewMeeting() {
    const userId = this.sessionService.getOISMeetUserId();
    const userName = this.sessionService.getFullName() || 'User';

    if (!userId) {
      this.snackBar.open('User not authenticated', 'Close', { duration: 3000 });
      return;
    }

    const request = {
      topic: 'My Meeting',
      hostId: userId,
      hostName: userName,
      expiryHours: 24,
      settings: {
        muteOnEntry: false,
        allowChat: true,
        allowScreenShare: true,
        maxParticipants: 50,
        waitingRoom: false
      }
    };

    this.meetingService.createMeeting(request).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.meetingId = response.data.meetingId;
          this.snackBar.open('Meeting created successfully!', 'Close', {
            duration: 2000
          });
        }
      },
      error: (error) => {
        console.error('Error creating meeting:', error);
        this.snackBar.open('Failed to create meeting', 'Close', {
          duration: 3000
        });
      }
    });
  }

  toggleMic() {
    this.micOn = !this.micOn;
  }

  toggleCam() {
    this.camOn = !this.camOn;
  }

  copyMeetingId(input: HTMLInputElement) {
    this.clipboard.copy(input.value);
    this.snackBar.open('Meeting ID copied!', 'Close', {
      duration: 2000,
      verticalPosition: 'bottom',
      panelClass: ['mat-toolbar', 'mat-primary']
    });
  }

  validateAndJoin(meetingId: string) {
    if (!meetingId.trim()) {
      this.meetingError = 'Please enter a meeting ID';
      return;
    }

    this.isValidating = true;
    this.meetingError = '';

    this.meetingService.validateMeeting(meetingId.trim()).subscribe({
      next: (response: any) => {
        this.isValidating = false;

        if (response.success) {
          this.joinMeeting(meetingId.trim());
        } else {
          this.meetingError = response.message || 'Invalid meeting ID';
        }
      },
      error: (error) => {
        this.isValidating = false;
        this.meetingError = 'Error validating meeting';
        console.error('Validation error:', error);
      }
    });
  }

  joinMeeting(meetingId: string) {
    const userId = this.sessionService.getOISMeetUserId();
    const userName = this.sessionService.getFullName() || 'User';

    if (!userId) {
      this.snackBar.open('User not authenticated', 'Close', { duration: 3000 });
      return;
    }

    const request = {
      meetingId: meetingId,
      userId: userId,
      userName: userName
    };

    this.meetingService.joinMeeting(request).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.dialogRef.close();

          // Pass micOn and camOn states to meeting component
          this.router.navigate(['/meeting', meetingId], {
            queryParams: {
              host: 'false',
              topic: response.data.topic || 'Joined Meeting',
              mic: this.micOn,  // Pass mic state
              cam: this.camOn   // Pass cam state (will be false)
            }
          });
        }
      },
      error: (error) => {
        console.error('Error joining meeting:', error);
        this.snackBar.open('Failed to join meeting', 'Close', {
          duration: 3000
        });
      }
    });
  }

  startMeeting() {
    this.dialogRef.close();

    // Pass micOn and camOn states to meeting component
    this.router.navigate(['/meeting', this.meetingId], {
      queryParams: {
        host: 'true',
        topic: 'My Meeting',
        mic: this.micOn,  // Pass mic state
        cam: this.camOn   // Pass cam state (will be false)
      }
    });
  }
}
