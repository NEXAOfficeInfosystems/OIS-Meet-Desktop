import { SessionService } from './../../core/services/session.service';
import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SsoApiService } from '../../core/services/sso-api.service';
import { AuthService } from '../../core/services/auth.service';
import { CommonService } from '../../core/services/common.service';
import { Subject, takeUntil } from 'rxjs';

interface User {
  id: string;
  name: string;
  online: boolean;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  avatarColor: string;
}

interface Message {
  id: number;
  userId: string;
  text: string;
  sender: 'me' | 'other';
  time: string;
  read: boolean;
}


@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatMessages') private chatMessagesContainer!: ElementRef;

  constructor(private ssoApiService: SsoApiService, private authService: AuthService, private sessionService: SessionService, private commonService: CommonService) { }

  users: User[] = [];

  allMessages: Message[] = [
    { id: 1, userId: '', text: 'Hi John! How are you?', sender: 'me', time: '10:20 AM', read: true },
    { id: 2, userId: '', text: 'I\'m good, thanks! How about you?', sender: 'other', time: '10:21 AM', read: true },
    { id: 3, userId: '', text: 'Great! Ready for the meeting?', sender: 'me', time: '10:22 AM', read: true },
    { id: 4, userId: '', text: 'Yes, see you at 11', sender: 'other', time: '10:23 AM', read: true },
    { id: 5, userId: '', text: 'Hi Emma, did you see the design?', sender: 'me', time: '9:15 AM', read: true },
    { id: 6, userId: '', text: 'Yes, it looks perfect!', sender: 'other', time: '9:16 AM', read: true },
    { id: 7, userId: '', text: 'Sarah, check out the new update', sender: 'me', time: 'Yesterday', read: false }
  ];

  selectedUser: User | null = null;
  newMessage = '';
  private destroy$ = new Subject<void>();
  ngOnInit() {
    this.commonService.selectedCompany$.pipe(takeUntil(this.destroy$))
      .subscribe(company => {
        if (company) {
          this.getSSOUserList();
        }
      });
    // Auto-select first user
    if (this.users.length > 0) {
      this.selectUser(this.users[0]);
    }
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
  selectUser(user: User) {
    this.selectedUser = user;
    // Reset unread count for selected user
    user.unreadCount = 0;
  }

  getMessagesForSelectedUser(): Message[] {
    if (!this.selectedUser) return [];

    return this.allMessages
      .filter(msg => msg.userId === this.selectedUser?.id)
      .sort((a, b) =>
        this.parseTime(a.time).getTime() - this.parseTime(b.time).getTime()
      );
  }

  sendMessage() {
    if (!this.newMessage.trim() || !this.selectedUser) return;

    const newMsg: Message = {
      id: this.allMessages.length + 1,
      userId: this.selectedUser.id,
      text: this.newMessage,
      sender: 'me',
      time: this.formatTime(new Date()),
      read: false
    };

    this.allMessages.push(newMsg);

    // Update user's last message
    const user = this.users.find(u => u.id === this.selectedUser?.id);
    if (user) {
      user.lastMessage = this.newMessage;
      user.lastMessageTime = 'Just now';
    }

    this.newMessage = '';

    // Simulate reply after 2 seconds
    setTimeout(() => {
      this.simulateReply();
    }, 2000);
  }

  private simulateReply() {
    if (!this.selectedUser) return;

    const replies = [
      'Thanks for your message!',
      'I\'ll get back to you soon.',
      'Sounds good!',
      'Great, thanks for letting me know!',
      '👍',
      'Perfect!'
    ];

    const randomReply = replies[Math.floor(Math.random() * replies.length)];

    const replyMsg: Message = {
      id: this.allMessages.length + 1,
      userId: this.selectedUser.id,
      text: randomReply,
      sender: 'other',
      time: this.formatTime(new Date()),
      read: false
    };

    this.allMessages.push(replyMsg);

    // Update user's last message
    const user = this.users.find(u => u.id === this.selectedUser?.id);
    if (user) {
      user.lastMessage = randomReply;
      user.lastMessageTime = 'Just now';
      user.unreadCount++;
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.chatMessagesContainer) {
        const element = this.chatMessagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) { }
  }


//GET SSO USER LIST
  getSSOUserList(): void {
    const token = this.authService.getSSOToken() ?? '';
    const userinfo = this.authService.getEncryptedJson() ?? '';
    const client = this.sessionService.getClientId() ?? '';
    const companyId = this.sessionService.getCompanyId()?.toString() ?? '';
    const appId = this.sessionService.getMeetAppId() ?? '';

  this.ssoApiService.getSSOUserList(token, userinfo, client, companyId, appId)
    .subscribe(
      (response: any[]) => {
        this.users = response.map(user => ({
          id: user.id,
          name: user.fullName,
          online: true,
          lastMessage: '',
          lastMessageTime: '',
          unreadCount: 0,
          avatarColor: this.commonService.getRandomColor()
        }));
        if (this.users.length > 0) {
          this.selectUser(this.users[0]);
        }
      },
      (error) => {
        console.error('Error fetching SSO user list:', error);
      }
    );
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private parseTime(timeStr: string): Date {
    const today = new Date();
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    today.setHours(hours, minutes, 0, 0);
    return today;
  }
}
