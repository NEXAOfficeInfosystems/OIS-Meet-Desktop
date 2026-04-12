import { Component, Input, Output, EventEmitter, inject, signal, computed, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CalendarEvent, CreateEventDto } from '../../../core/models/calendar.model';
import { UserService } from '../../../core/services/user.service';
import { SessionService } from '../../../core/services/session.service';
import { CalendarService } from '../../../core/services/calendar.service';


@Component({
  selector: 'app-event-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './event-dialog.component.html',
  styleUrls: ['./event-dialog.component.scss']
})
export class EventDialogComponent {
  private fb = inject(FormBuilder);
  private userService = inject(UserService);
  private session = inject(SessionService);
  private calendarService = inject(CalendarService);

  @Input() event?: CalendarEvent;
  @Input() initialDate?: Date;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<CreateEventDto>();
  @Output() delete = new EventEmitter<string>();

  @ViewChild('availabilityGrid') gridElement?: ElementRef;

  eventForm: FormGroup;
  pastDateError = signal<string>('');
  minDateTime = signal<string>('');
  isPastEvent = signal<boolean>(false);
  
  // Preview slot calculation
  slotPosition = signal({ top: 0, height: 40 });
  slotText = signal('8:00 - 8:30');
  availableHours = Array.from({ length: 24 }, (_, i) => i);
  currentTimeTop = signal<number>(0);

  constructor() {
    this.eventForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      location: [''],
      isAllDay: [false],
      isPrivate: [false],
      repeat: ['none'],
      isTeamsMeeting: [true]
    });

    // Auto-scroll effect
    effect(() => {
      const pos = this.slotPosition();
      if (this.gridElement && pos.top > 0) {
        this.gridElement.nativeElement.scrollTo({
          top: pos.top - 100, // Center it slightly
          behavior: 'smooth'
        });
      }
    });

    // Sync form with preview and validate
    this.eventForm.valueChanges.subscribe(() => {
      this.syncPreview();
      this.validateForm();
      this.enforceFutureTime();
    });

    // Update current time marker and min date
    this.updateTimeMarker();
    this.updateMinDateTime();
    setInterval(() => {
      this.updateTimeMarker();
      this.updateMinDateTime();
    }, 60000);
  }

  updateMinDateTime() {
    this.minDateTime.set(this.formatDate(new Date()));
  }

  updateTimeMarker() {
    const now = new Date();
    const top = (now.getHours() * 40) + (now.getMinutes() / 60) * 40;
    this.currentTimeTop.set(top);
  }

  // Participant management
  searchQuery = '';
  searchResults: any[] = [];
  selectedParticipants: any[] = [];
  currentUserId = '';
  isParticipant = false;
  myStatus = 'Tentative';

  ngOnInit() {
    // Priority: Internal OIS Meet ID (from DB), fallback to SSO ID
    this.currentUserId = this.session.getOISMeetUserId() || this.session.getUserId() || '';

    if (this.event) {
      const startTime = new Date(this.event.startTimeUtc);
      const now = new Date();
      
      // If event started more than 5 mins ago, consider it past (grace period)
      if (startTime.getTime() < (now.getTime() - 5 * 60000)) {
        this.isPastEvent.set(true);
      }

      this.eventForm.patchValue({
        title: this.event.title,
        description: this.event.description,
        startTime: this.formatDate(startTime),
        endTime: this.formatDate(new Date(this.event.endTimeUtc)),
        location: this.event.location,
        isAllDay: this.event.isAllDay,
        isPrivate: this.event.isPrivate,
        repeat: this.event.recurrenceRule?.frequency?.toLowerCase() || 'none'
      });

      if (this.isPastEvent()) {
        this.eventForm.disable();
      }

      this.selectedParticipants = [...this.event.participants];
      
      // Check if I am a participant or organizer
      const me = this.event.participants.find(p => p.userId === this.currentUserId);
      this.isParticipant = !!me || this.event.organizerId === this.currentUserId;
      this.myStatus = me?.responseStatus || 'Tentative';
    } else {
      const start = this.getDefaultStartTime();
      const end = new Date(start.getTime() + (30 * 60 * 1000));
      this.eventForm.patchValue({
        startTime: this.formatDate(start),
        endTime: this.formatDate(end)
      });
    }
    this.updateMinDateTime();
    this.syncPreview();
  }

  private getDefaultStartTime(): Date {
    const now = new Date();
    let start: Date;

    if (this.initialDate) {
      start = new Date(this.initialDate);
      
      // If it's a "midnight" date (usually from month view), 
      // use the selected date but default to current time or a default hour
      if (start.getHours() === 0 && start.getMinutes() === 0) {
        if (start.toDateString() === now.toDateString()) {
          start.setHours(now.getHours(), now.getMinutes());
        } else {
          start.setHours(9, 0); // Default to 9 AM for future dates picked from month view
        }
      }
    } else {
      start = now;
    }

    const rounded = this.getRoundedTime(start);
    
    // If result is in the past, use current time rounded
    if (rounded.getTime() < now.getTime() - 60000) {
      return this.getRoundedTime(now);
    }

    return rounded;
  }

  private getRoundedTime(date: Date): Date {
    const start = new Date(date);
    const minutes = start.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 15) * 15;
    start.setMinutes(roundedMinutes, 0, 0);
    return start;
  }

  private syncPreview() {
    const val = this.eventForm.value;
    if (!val.startTime || !val.endTime) return;

    const start = new Date(val.startTime);
    const end = new Date(val.endTime);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const hour = start.getHours();
    const minute = start.getMinutes();
    const durationMin = Math.max(15, (end.getTime() - start.getTime()) / 60000);

    // Position relative to a 24h grid where each hour is 40px
    const hourHeight = 40;
    const top = (hour * hourHeight) + (minute / 60) * hourHeight;
    const height = (durationMin / 60) * hourHeight;

    this.slotPosition.set({ top, height });
    this.slotText.set(`${hour}:${minute.toString().padStart(2, '0')} - ${end.getHours()}:${end.getMinutes().toString().padStart(2, '0')}`);
  }

  private validateForm() {
    this.pastDateError.set('');
    if (this.isPastEvent()) return;

    const val = this.eventForm.getRawValue(); // Get values even if disabled
    if (!val.startTime || !val.endTime) return;

    const start = new Date(val.startTime);
    const end = new Date(val.endTime);
    const now = new Date();

    // Buffer of 1 minute to account for clock drift/latency
    const threshold = new Date(now.getTime() - 60000);

    if (start < threshold && !this.event) {
      this.pastDateError.set('You cannot schedule events in the past.');
      return;
    }

    if (this.event && start < threshold && this.eventForm.dirty) {
      // If editing an existing event, don't allow moving it to the past
      // But if it's already in the past, the form is disabled anyway
      this.pastDateError.set('Cannot reschedule a meeting to a past time.');
      return;
    }

    if (end <= start) {
      this.pastDateError.set('End time must be after start time.');
      return;
    }
  }

  private enforceFutureTime() {
    if (this.isPastEvent()) return;
    
    const startTimeVal = this.eventForm.get('startTime')?.value;
    const endTimeVal = this.eventForm.get('endTime')?.value;
    if (!startTimeVal || !endTimeVal) return;

    const start = new Date(startTimeVal);
    const now = new Date();

    // 1. If new event and start is in the past, snap to now
    if (!this.event && start.getTime() < now.getTime() - 30000) {
      const snappedStart = this.getRoundedTime(now);
      this.eventForm.patchValue({ 
        startTime: this.formatDate(snappedStart) 
      }, { emitEvent: false });
      return; // Re-validation will happen on next cycle
    }

    // 2. Ensure end time is at least 15 mins after start time
    const end = new Date(endTimeVal);
    if (end.getTime() <= start.getTime()) {
      const newEnd = new Date(start.getTime() + 15 * 60000);
      this.eventForm.patchValue({ 
        endTime: this.formatDate(newEnd) 
      }, { emitEvent: false });
    }
  }

  searchUsers() {
    if (this.searchQuery.length < 2) {
      this.searchResults = [];
      return;
    }
    this.userService.searchUsers(this.searchQuery).subscribe(res => {
      this.searchResults = res.data.filter(u => 
        !this.selectedParticipants.some(p => p.userId === u.id) && u.id !== this.currentUserId
      );
    });
  }

  addParticipant(user: any) {
    this.selectedParticipants.push({
      userId: user.id,
      name: user.fullName || user.userName,
      email: user.email,
      responseStatus: 'Tentative',
      isOrganizer: false
    });
    this.searchQuery = '';
    this.searchResults = [];
  }

  removeParticipant(userId: string) {
    this.selectedParticipants = this.selectedParticipants.filter(p => p.userId !== userId);
  }

  formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  setNow() {
    if (this.isPastEvent()) return;
    const now = new Date();
    this.eventForm.patchValue({
      startTime: this.formatDate(now),
      endTime: this.formatDate(new Date(now.getTime() + 30 * 60000))
    });
  }

  setDuration(mins: number) {
    if (this.isPastEvent()) return;
    const startValue = this.eventForm.get('startTime')?.value;
    if (!startValue) return;
    const start = new Date(startValue);
    if (isNaN(start.getTime())) return;
    this.eventForm.patchValue({
      endTime: this.formatDate(new Date(start.getTime() + mins * 60000))
    });
  }

  onSave() {
    if (this.eventForm.valid && !this.pastDateError()) {
      const formVal = this.eventForm.getRawValue();
      const startTime = new Date(formVal.startTime);
      const endTime = new Date(formVal.endTime);

      const dto: CreateEventDto = {
        title: formVal.title,
        description: formVal.description,
        startTimeUtc: startTime.toISOString(),
        endTimeUtc: endTime.toISOString(),
        location: formVal.location,
        isAllDay: formVal.isAllDay,
        isPrivate: formVal.isPrivate,
        participantIds: this.selectedParticipants.map(p => p.userId),
        reminderMinutes: this.event?.reminderMinutes || [10, 60]
      };

      // Add recurrence if not none
      if (formVal.repeat && formVal.repeat !== 'none') {
        dto.recurrenceRule = {
          frequency: formVal.repeat.toUpperCase(),
          interval: 1
        };
      }
      
      this.save.emit(dto);
    }
  }

  onDelete() {
    if (this.event) {
      this.delete.emit(this.event.id);
    }
  }

  getCount(status: string): number {
    return this.selectedParticipants.filter(p => p.responseStatus === status).length;
  }

  onRSVP(status: any) {
    if (this.event) {
      this.calendarService.respondToInvite(this.event.id, status).subscribe(() => {
        this.myStatus = status;
        this.close.emit();
      });
    }
  }

  onClose() {
    this.close.emit();
  }
}
