import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * MeetingLinkPipe
 * ---------------
 * Scans a plain-text chat message for OIS meeting IDs and wraps each
 * match in a styled, clickable <span>.
 *
 * API format confirmed: OIS-XXXXXX  (OIS- + exactly 6 uppercase alphanumeric)
 * Examples: OIS-GOK8FH   OIS-AB12CD   OIS-ZZZZZZ
 *
 * Usage in template:
 *   <div [innerHTML]="msg.content | meetingLink"
 *        (click)="onMessageClick($event)"></div>
 */
@Pipe({ name: 'meetingLink', standalone: true })
export class MeetingLinkPipe implements PipeTransform {

  // Matches OIS- followed by exactly 6 uppercase letters/digits
  // \b word-boundary prevents partial matches inside longer strings
  private readonly MEETING_ID_RE = /\b(OIS-[A-Z0-9]{6})\b/g;

  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string): SafeHtml {
    if (!text) return '';

    // 1. Escape any HTML in the raw message content to prevent XSS
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Replace every meeting-ID match with a clickable chip
    const linked = escaped.replace(
      this.MEETING_ID_RE,
      (id) =>
        `<span class="meeting-id-link" ` +
        `data-meeting-id="${id}" ` +
        `title="Click to join meeting ${id}">${id} <small style="font-size:0.75em;opacity:0.8">▶ Join</small></span>`
    );

    // 3. Trust the resulting HTML (built from escaped user input + our own markup)
    return this.sanitizer.bypassSecurityTrustHtml(linked);
  }
}
