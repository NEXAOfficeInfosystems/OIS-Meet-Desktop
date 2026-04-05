import { Component, OnInit, signal, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarHeaderComponent } from './calendar-header/calendar-header.component';
import { CalendarGridComponent } from './calendar-grid/calendar-grid.component';
import { EventDialogComponent } from './event-dialog/event-dialog.component';
import { CalendarService } from '../../core/services/calendar.service';

import { CalendarEvent, CalendarViewType } from '../../core/models/calendar.model';

@Component({
  selector: 'app-calendar-container',
  standalone: true,
  imports: [CommonModule, CalendarHeaderComponent, CalendarGridComponent, EventDialogComponent],
  templateUrl: './calendar-container.component.html',
  styleUrls: ['./calendar-container.component.scss']
})

export class CalendarContainerComponent implements OnInit {
  private calendarService = inject(CalendarService);

  // Use Angular Signals for state management
  viewType = signal<CalendarViewType>('week');
  selectedDate = signal<Date>(new Date());
  events = signal<CalendarEvent[]>([]);
  loading = signal<boolean>(false);

  // Dialog state
  isDialogVisible = signal<boolean>(false);
  selectedEvent = signal<CalendarEvent | undefined>(undefined);
  initialDate = signal<Date | undefined>(undefined);


  constructor() {
    // When date or viewType changes, fetch events
    effect(() => {
      this.loadEvents();
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    this.calendarService.onEventUpdate((id, title) => {
      this.loadEvents();
    });
  }

  loadEvents() {
    this.loading.set(true);
    const { start, end } = this.getRangeForView();
    this.calendarService.getEvents(start, end).subscribe({
      next: (data) => {
        this.events.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading events:', err);
        this.loading.set(false);
      }
    });
  }

  getRangeForView(): { start: Date, end: Date } {
    const d = new Date(this.selectedDate());
    let start: Date;
    let end: Date;

    if (this.viewType() === 'day') {
      start = new Date(d.setHours(0, 0, 0, 0));
      end = new Date(d.setHours(23, 59, 59, 999));
    } else if (this.viewType() === 'week') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(d.setDate(diff));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start = new Date(d.getFullYear(), d.getMonth(), 1);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }

  onViewTypeChange(view: CalendarViewType) {
    this.viewType.set(view);
  }

  onDateChange(date: Date) {
    this.selectedDate.set(date);
  }

  onEventClick(event: CalendarEvent) {
    this.selectedEvent.set(event);
    this.initialDate.set(undefined);
    this.isDialogVisible.set(true);
  }

  onSlotClick(date: Date) {
    this.selectedEvent.set(undefined);
    this.initialDate.set(date);
    this.isDialogVisible.set(true);
  }

  onCreateEvent() {
    this.selectedEvent.set(undefined);
    this.initialDate.set(new Date());
    this.isDialogVisible.set(true);
  }

  onSaveEvent(dto: any) {
    this.loading.set(true);
    if (this.selectedEvent()) {
      this.calendarService.updateEvent(this.selectedEvent()!.id, dto).subscribe(() => {
        this.closeDialog();
        this.loadEvents();
      });
    } else {
      this.calendarService.createEvent(dto).subscribe(() => {
        this.closeDialog();
        this.loadEvents();
      });
    }
  }

  onDeleteEvent(id: string) {
    if (confirm('Are you sure you want to delete this meeting?')) {
      this.calendarService.deleteEvent(id).subscribe(() => {
        this.closeDialog();
        this.loadEvents();
      });
    }
  }

  closeDialog() {
    this.isDialogVisible.set(false);
    this.selectedEvent.set(undefined);
    this.initialDate.set(undefined);
  }
}

