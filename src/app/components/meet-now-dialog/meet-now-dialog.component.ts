import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SessionService }  from '../../core/services/session.service';
import { MeetingService }  from '../../core/services/meeting.service';

@Component({
  selector:    'app-meet-now-dialog',
  templateUrl: './meet-now-dialog.component.html',
  styleUrls:   ['./meet-now-dialog.component.scss']
})
export class MeetNowDialogComponent implements OnInit {
  mode: 'meet-now' | 'join-meeting' = 'meet-now';
  meetingId    = '';
  micOn        = false;
  camOn        = false;
  isValidating = false;
  meetingError = '';
  isCreating   = false;

  constructor(
    public  dialogRef:      MatDialogRef<MeetNowDialogComponent>,
    private clipboard:      Clipboard,
    private snackBar:       MatSnackBar,
    private router:         Router,
    private meetingService: MeetingService,
    private sessionService: SessionService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.mode = data.mode;
  }

  ngOnInit(): void {
    if (this.mode === 'meet-now') {
      this.initMeeting();
    }
  }

  // ── Meeting creation (with cache) ──────────────────────────────────────────

  private initMeeting(): void {
    const pending = this.meetingService.getPendingMeeting();
    if (pending?.meetingId) {
      this.meetingId = pending.meetingId;
      return;
    }
    this.createNewMeeting();
  }

  createNewMeeting(): void {
    const userId   = this.sessionService.getOISMeetUserId();
    const userName = this.sessionService.getFullName() || 'User';

    if (!userId) {
      this.snackBar.open('User not authenticated', 'Close', { duration: 3000 });
      return;
    }

    this.isCreating = true;
    this.meetingId  = '';

    const request = {
      topic:       'My Meeting',
      hostId:      userId,
      hostName:    userName,
      expiryHours: 24,
      settings: {
        muteOnEntry:      false,
        allowChat:        true,
        allowScreenShare: true,
        maxParticipants:  50,
        waitingRoom:      false
      }
    };

    this.meetingService.createMeeting(request).subscribe({
      next: (response: any) => {
        this.isCreating = false;
        if (response.success) {
          this.meetingId = response.data.meetingId;
        }
      },
      error: () => {
        this.isCreating = false;
        this.snackBar.open('Failed to create meeting', 'Close', { duration: 3000 });
      }
    });
  }

  // ── Share meeting ID into active chat ──────────────────────────────────────
  shareToChat(): void {
    if (!this.meetingId) return;
    const shareText = `Join my meeting! Meeting ID: ${this.meetingId}`;
    this.clipboard.copy(shareText);
    // window.dispatchEvent(
    //   new CustomEvent('ois-share-meeting-id', {
    //     detail: { meetingId: this.meetingId, text: shareText }
    //   })
    // );
    this.snackBar.open(
      'Meeting ID Copied to Clipboard!',
      'Close',
      { duration: 3000, verticalPosition: 'bottom' }
    );
  }

  // ── Mic / Cam ──────────────────────────────────────────────────────────────

  toggleMic(): void { this.micOn = !this.micOn; }
  toggleCam(): void { this.camOn = !this.camOn; }

  // ── Clipboard copy ─────────────────────────────────────────────────────────

  copyMeetingId(input: HTMLInputElement): void {
    this.clipboard.copy(input.value);
    this.snackBar.open('Meeting ID copied!', 'Close', {
      duration: 2000,
      verticalPosition: 'bottom',
      panelClass: ['mat-toolbar', 'mat-primary']
    });
  }

  // ── Join flow ──────────────────────────────────────────────────────────────

  validateAndJoin(meetingId: string): void {
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
      error: () => {
        this.isValidating = false;
        this.meetingError = 'Error validating meeting';
      }
    });
  }

  /**
   * CHANGED: now calls openMeetingWindow() instead of router.navigate().
   * The meeting opens in a new Electron BrowserWindow (or browser tab).
   */
  joinMeeting(meetingId: string): void {
    const userId   = this.sessionService.getOISMeetUserId();
    const userName = this.sessionService.getFullName() || 'User';

    if (!userId) {
      this.snackBar.open('User not authenticated', 'Close', { duration: 3000 });
      return;
    }

    this.meetingService.joinMeeting({ meetingId, userId, userName }).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.dialogRef.close();
          this.openMeetingWindow(meetingId, false, this.micOn, this.camOn);
        }
      },
      error: () =>
        this.snackBar.open('Failed to join meeting', 'Close', { duration: 3000 })
    });
  }

  // ── Start flow ─────────────────────────────────────────────────────────────

  /**
   * CHANGED: auto-shares the meeting ID to the active chat, then opens
   * the meeting in a dedicated window instead of navigating in-place.
   */
  startMeeting(): void {
    if (!this.meetingId) return;
    this.meetingService.clearPendingMeeting();
    this.dialogRef.close();

    // Send meeting ID to the currently open chat conversation automatically
    // this.shareToChat();

    // Open meeting in its own window
    this.openMeetingWindow(this.meetingId, true, this.micOn, this.camOn);
  }

  // ── Shared window opener ───────────────────────────────────────────────────

  /**
   * Opens a meeting room in a new Electron BrowserWindow via IPC,
   * with a plain window.open() fallback for browser / dev-server use.
   *
   * FIX: In the installed EXE, window.location.origin is "null" (file://
   * context), so we can no longer build a valid absolute URL.  We send
   * a structured { routePath, queryString } payload instead and let
   * main.js resolve it with loadFile() for production or loadURL() for dev.
   */
  private openMeetingWindow(
    meetingId: string,
    isHost:    boolean,
    mic:       boolean,
    cam:       boolean
  ): void {
    const params = new URLSearchParams({
      host:  String(isHost),
      topic: 'OIS Meet',
      mic:   String(mic),
      cam:   String(cam),
    });

    const electronApi = (window as any).oisMeet;
    if (electronApi?.isElectron && typeof electronApi.openMeetingWindow === 'function') {
      // Send structured payload so main.js can use loadFile() in production
      electronApi.openMeetingWindow({
        routePath:   `/meeting/${meetingId}`,
        queryString: params.toString(),
      });
    } else {
      // Browser / dev-server fallback — window.location.origin is valid here
      const url = `${window.location.origin}/meeting/${meetingId}?${params}`;
      window.open(url, '_blank', 'width=1280,height=800,menubar=no,toolbar=no');
    }
  }
}
