import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-meet-now-dialog',
  templateUrl: './meet-now-dialog.component.html',
  styleUrls: ['./meet-now-dialog.component.scss']
})
export class MeetNowDialogComponent {
  mode: 'meet-now' | 'join-meeting' = 'meet-now';
  meetingId = 'OIS-7821';
  micOn = false;
  camOn = false;
  constructor(
    public dialogRef: MatDialogRef<MeetNowDialogComponent>,
    private clipboard: Clipboard,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.mode = data.mode;
  }

  setMeetNow() {
    this.mode = 'meet-now';
  }

  setJoinMeeting() {
    this.mode = 'join-meeting';
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


  startMeeting() {
    console.log('Starting meeting...');
    this.dialogRef.close();
  }

  joinMeeting(meetingId: string) {
    console.log('Joining meeting:', meetingId);
    this.dialogRef.close();
  }
}
