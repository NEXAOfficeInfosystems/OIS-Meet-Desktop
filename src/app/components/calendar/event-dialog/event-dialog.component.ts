import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CalendarEvent, CreateEventDto } from '../../../core/models/calendar.model';

@Component({
  selector: 'app-event-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './event-dialog.component.html',
  styleUrls: ['./event-dialog.component.scss']
})
export class EventDialogComponent {
  private fb = inject(FormBuilder);

  @Input() event?: CalendarEvent;
  @Input() initialDate?: Date;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<CreateEventDto>();
  @Output() delete = new EventEmitter<string>();

  eventForm: FormGroup;

  constructor() {
    this.eventForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      location: [''],
      isAllDay: [false],
      isPrivate: [false],
      repeat: ['none']
    });
  }

  ngOnInit() {
    if (this.event) {
      this.eventForm.patchValue({
        title: this.event.title,
        description: this.event.description,
        startTime: this.formatDate(new Date(this.event.startTimeUtc)),
        endTime: this.formatDate(new Date(this.event.endTimeUtc)),
        location: this.event.location,
        isAllDay: this.event.isAllDay,
        isPrivate: this.event.isPrivate
      });
    } else if (this.initialDate) {
      const start = new Date(this.initialDate);
      const end = new Date(this.initialDate);
      end.setHours(start.getHours() + 1);
      this.eventForm.patchValue({
        startTime: this.formatDate(start),
        endTime: this.formatDate(end)
      });
    }
  }

  formatDate(date: Date): string {
    return date.toISOString().slice(0, 16);
  }

  onSave() {
    if (this.eventForm.valid) {
      const formVal = this.eventForm.value;
      const dto: CreateEventDto = {
        title: formVal.title,
        description: formVal.description,
        startTimeUtc: new Date(formVal.startTime).toISOString(),
        endTimeUtc: new Date(formVal.endTime).toISOString(),
        location: formVal.location,
        isAllDay: formVal.isAllDay,
        isPrivate: formVal.isPrivate,
        participantIds: [], // Add participant picker logic
        reminderMinutes: [15]
      };
      this.save.emit(dto);
    }
  }

  onDelete() {
    if (this.event) {
      this.delete.emit(this.event.id);
    }
  }

  onClose() {
    this.close.emit();
  }
}
