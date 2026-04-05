export type CalendarViewType = 'day' | 'week' | 'month';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTimeUtc: Date | string;
  endTimeUtc: Date | string;
  organizerId: string;
  organizerName: string;
  location?: string;
  meetingLink?: string;
  isAllDay: boolean;
  status: 'Confirmed' | 'Tentative' | 'Cancelled';
  isPrivate: boolean;
  recurrenceRule?: RecurrenceRule;
  participants: CalendarParticipant[];
  reminderMinutes: number[];
}

export interface CalendarParticipant {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  responseStatus: 'Accepted' | 'Declined' | 'Tentative';
  isOrganizer: boolean;
}

export interface RecurrenceRule {
  frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
  interval: number;
  daysOfWeek?: string; // "MO,TU,WE"
  endDate?: Date | string;
  count?: number;
}

export interface CreateEventDto {
  title: string;
  description?: string;
  startTimeUtc: Date | string;
  endTimeUtc: Date | string;
  location?: string;
  meetingLink?: string;
  isAllDay: boolean;
  isPrivate: boolean;
  recurrenceRule?: RecurrenceRule;
  participantIds: string[];
  reminderMinutes: number[];
}
