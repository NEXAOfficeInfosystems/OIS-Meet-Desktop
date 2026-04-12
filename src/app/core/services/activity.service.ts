import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivityItem as CoreActivityItem, ActivityType, PagedResult } from '../models/activity.models';
import { environment } from '../../../environments/environment';
import { ChatSignalrService } from './chat-signalr.service';
import { SessionService } from './session.service';
import { tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  private http = inject(HttpClient);
  private signalr = inject(ChatSignalrService);
  private sessionService = inject(SessionService);
  private apiUrl = `${environment.apiBaseUrl}/Collaboration/activity`;

  // Signals State
  activities = signal<CoreActivityItem[]>([]);
  selectedActivity = signal<CoreActivityItem | null>(null);
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
    const userId = this.sessionService.getOISMeetUserId();
    if (!userId) {
      console.warn('ActivityService: No UserID available yet');
      return;
    }

    this.http.get<any>(`${this.apiUrl}?filter=${filter}&page=${page}&userId=${userId}&take=50`)
      .subscribe({
        next: (res) => {
          const newItems = res?.data || res?.items || [];
          if (page === 1) {
            this.activities.set(newItems);
          } else {
            this.activities.update(prev => [...prev, ...newItems]);
          }
        },
        error: (err) => console.error('ActivityService: Failed to load', err)
      });
    
    this.http.get<number>(`${this.apiUrl}/unread-count?userId=${userId}`)
      .subscribe(count => this.unreadCount.set(count));
  }

  async selectActivity(item: CoreActivityItem) {
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
    const userId = this.sessionService.getOISMeetUserId();
    if (!userId) return;

    // Optimistic update
    this.activities.update(prev => prev.map(a => 
      ids.includes(a.id) ? { ...a, isRead: true } : a
    ));
    
    // Recalculate unread count locally
    this.unreadCount.set(this.activities().filter(a => !a.isRead).length);

    this.http.post(`${this.apiUrl}/mark-read?userId=${userId}`, { activityIds: ids }).subscribe();
  }

  private deduplicate(items: CoreActivityItem[]): any[] {
    const grouped: any[] = [];
    const bucketSizeMs = 60000; // 60 seconds

    items.forEach(item => {
      // Standardize date parsing
      const sanitizedDate = item.createdAt?.replace(/(\.\d{3})\d+/, '$1');
      const itemTime = sanitizedDate ? new Date(sanitizedDate).getTime() : Date.now();
      
      // VERY strict find to avoid accidental merging
      const existingGroup = grouped.find(g => {
        if (!g.createdAt || !item.createdAt) return false;
        const gTime = new Date(g.createdAt.replace(/(\.\d{3})\d+/, '$1')).getTime();
        
        return g.senderId === item.senderId &&
               g.type === item.type &&
               (g.type === ActivityType.FileShared || 
                g.type === ActivityType.Reaction || 
                g.type === ActivityType.Reply || 
                g.type === ActivityType.MissedCall) &&
               g.contextId === item.contextId &&
               Math.abs(gTime - itemTime) < bucketSizeMs;
      });

      if (existingGroup) {
        existingGroup.count = (existingGroup.count || 1) + 1;
      } else {
        grouped.push({ ...item, count: 1 });
      }
    });

    return grouped;
  }
}
