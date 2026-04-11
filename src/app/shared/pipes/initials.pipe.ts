import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'initials',
  standalone: true
})
export class InitialsPipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    if (!name) return 'U';
    const trimmed = name.trim();
    if (!trimmed) return 'U';

    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      // First char of first name and first char of last name
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    } else {
      // First two chars of first name
      return trimmed.substring(0, 2).toUpperCase();
    }
  }
}
