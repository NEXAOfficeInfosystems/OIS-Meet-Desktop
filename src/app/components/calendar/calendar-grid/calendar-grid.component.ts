import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarEvent, CalendarViewType } from '../../../core/models/calendar.model';

@Component({
  selector: 'app-calendar-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar-grid.component.html',
  styleUrls: ['./calendar-grid.component.scss']
})
export class CalendarGridComponent {
  @Input() viewType: CalendarViewType = 'week';
  @Input() selectedDate: Date = new Date();
  @Input() events: CalendarEvent[] = [];
  
  @Output() eventClick = new EventEmitter<CalendarEvent>();
  @Output() slotClick = new EventEmitter<Date>();

  hours = Array.from({ length: 24 }, (_, i) => i);
  days: Date[] = [];
  today = new Date();


  ngOnChanges() {
    this.updateDays();
  }

  updateDays() {
    this.days = [];
    const start = this.getStartOfView();
    const count = this.viewType === 'day' ? 1 : this.viewType === 'week' ? 7 : 42; // Month usually needs 6 rows

    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      this.days.push(d);
    }
  }

  getStartOfView(): Date {
    const d = new Date(this.selectedDate);
    if (this.viewType === 'day') return d;
    if (this.viewType === 'week') {
      const day = d.getDay(); // 0 is Sunday
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      return d;
    }
    // Month start (back up to Monday if month doesn't start on Monday)
    d.setDate(1);
    const dayOfMonthStart = d.getDay();
    const diff = (dayOfMonthStart === 0 ? -6 : 1) - dayOfMonthStart;
    d.setDate(d.getDate() + diff);
    return d;
  }

  getEventsForSlot(day: Date, hour: number): CalendarEvent[] {
    return this.events.filter(e => {
      const start = new Date(e.startTimeUtc);
      return start.getFullYear() === day.getFullYear() &&
             start.getMonth() === day.getMonth() &&
             start.getDate() === day.getDate() &&
             start.getHours() === hour;
    });
  }

  getEventStyle(event: CalendarEvent) {
    const start = new Date(event.startTimeUtc);
    const end = new Date(event.endTimeUtc);
    const durationMin = (end.getTime() - start.getTime()) / 60000;
    const top = (start.getMinutes() / 60) * 100;
    const height = (durationMin / 60) * 100;

    return {
      top: `${top}%`,
      height: `calc(${height}% - 2px)`,
      'background-color': event.status === 'Cancelled' ? 'var(--bg-hover)' : 'var(--primary-color)',
      'border-left': '4px solid rgba(255,255,255,0.3)'
    };
  }

  onSlotClick(day: Date, hour: number) {
    const d = new Date(day);
    d.setHours(hour, 0, 0, 0);
    this.slotClick.emit(d);
  }

  onEventClick(event: CalendarEvent, e: MouseEvent) {
    e.stopPropagation();
    this.eventClick.emit(event);
  }
}
