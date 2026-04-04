import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivityItem, ActivityType, PagedResult } from '../models/activity.models';
import { environment } from '../../../environments/environment';
import { ChatSignalrService } from './chat-signalr.service';
import { tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  private http = inject(HttpClient);
  private signalr = inject(ChatSignalrService);
  private apiUrl = `${environment.apiBaseUrl}/activity`;

  // Signals State
  activities = signal<ActivityItem[]>([]);
  selectedActivity = signal<ActivityItem | null>(null);
  activeFilter = signal<'all' | 'unread' | 'mentions'>('all');
  unreadCount = signal<number>(0);

  // Computed state
  filteredActivities = computed(() => {
    const all = this.activities();
    const filter = this.activeFilter();
    
    let filtered = all;
    if (filter === 'unread') {
      filtered = all.filter(a => !a.isRead);
    } else if (filter === 'mentions') {
      filtered = all.filter(a => a.type === ActivityType.Mention);
    }

    return this.deduplicate(filtered);
  });

  constructor() {
    this.signalr.newActivity$.subscribe(activity => {
      if (activity) {
        this.activities.update(prev => [activity, ...prev]);
        if (!activity.isRead) {
          this.unreadCount.update(c => c + 1);
        }
      }
    });
  }

  loadActivities(filter: string = 'all', page: number = 1) {
    this.http.get<PagedResult<ActivityItem>>(`${this.apiUrl}?filter=${filter}&page=${page}`)
      .subscribe(res => {
        this.activities.set(res.items);
      });
    
    this.http.get<number>(`${this.apiUrl}/unread-count`)
      .subscribe(count => this.unreadCount.set(count));
  }

  async selectActivity(item: ActivityItem) {
    const prev = this.selectedActivity();
    if (prev?.contextId && prev.contextId !== item.contextId) {
      await this.signalr.leaveContext(prev.contextId);
    }

    this.selectedActivity.set(item);
    
    if (item.contextId) {
      await this.signalr.joinContext(item.contextId);
    }

    if (!item.isRead) {
      this.markRead([item.id]);
    }
  }

  markRead(ids: string[]) {
    // Optimistic update
    this.activities.update(prev => prev.map(a => 
      ids.includes(a.id) ? { ...a, isRead: true } : a
    ));
    
    // Recalculate unread count locally
    this.unreadCount.set(this.activities().filter(a => !a.isRead).length);

    this.http.post(`${this.apiUrl}/mark-read`, { activityIds: ids }).subscribe();
  }

  private deduplicate(items: ActivityItem[]): any[] {
    const grouped: any[] = [];
    const bucketSizeMs = 60000; // 60 seconds

    items.forEach(item => {
      const itemTime = new Date(item.createdAt).getTime();
      const existingGroup = grouped.find(g => 
        g.senderId === item.senderId &&
        g.type === item.type &&
        g.contextId === item.contextId &&
        Math.abs(new Date(g.createdAt).getTime() - itemTime) < bucketSizeMs
      );

      if (existingGroup && item.type === ActivityType.FileShared) {
        existingGroup.count = (existingGroup.count || 1) + 1;
        // Optionally update preview or other fields
      } else {
        grouped.push({ ...item, count: 1 });
      }
    });

    return grouped;
  }
}
