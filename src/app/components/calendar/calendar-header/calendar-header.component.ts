import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarViewType } from '../../../core/models/calendar.model';

@Component({
  selector: 'app-calendar-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar-header.component.html',
  styleUrls: ['./calendar-header.component.scss']
})
export class CalendarHeaderComponent {
  @Input() viewType: CalendarViewType = 'week';
  @Input() selectedDate: Date = new Date();
  @Output() viewTypeChange = new EventEmitter<CalendarViewType>();
  @Output() dateChange = new EventEmitter<Date>();
  @Output() createEventRequested = new EventEmitter<void>();

  get dateLabel(): string {
    if (this.viewType === 'day') {
      return this.selectedDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else if (this.viewType === 'week') {
      const start = this.getStartOfWeek(this.selectedDate);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return this.selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
  }

  prev() {
    const newDate = new Date(this.selectedDate);
    if (this.viewType === 'day') newDate.setDate(newDate.getDate() - 1);
    else if (this.viewType === 'week') newDate.setDate(newDate.getDate() - 7);
    else newDate.setMonth(newDate.getMonth() - 1);
    this.dateChange.emit(newDate);
  }

  next() {
    const newDate = new Date(this.selectedDate);
    if (this.viewType === 'day') newDate.setDate(newDate.getDate() + 1);
    else if (this.viewType === 'week') newDate.setDate(newDate.getDate() + 7);
    else newDate.setMonth(newDate.getMonth() + 1);
    this.dateChange.emit(newDate);
  }

  today() {
    this.dateChange.emit(new Date());
  }

  setView(view: CalendarViewType) {
    this.viewTypeChange.emit(view);
  }

  onCreateEvent() {
    this.createEventRequested.emit();
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday (0) to Monday start
    d.setDate(diff);
    return d;
  }
}
