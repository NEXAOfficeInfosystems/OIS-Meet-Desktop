import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface User {
  id: number;
  name: string;
  online: boolean;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  avatarColor: string;
}

interface Message {
  id: number;
  userId: number;
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

  users: User[] = [
    {
      id: 1,
      name: 'John Smith',
      online: true,
      lastMessage: 'See you at the meeting',
      lastMessageTime: '10:30 AM',
      unreadCount: 2,
      avatarColor: '#1a73e8'
    },
    {
      id: 2,
      name: 'Emma Watson',
      online: true,
      lastMessage: 'Thanks for the update',
      lastMessageTime: '9:15 AM',
      unreadCount: 0,
      avatarColor: '#e91e63'
    },
    {
      id: 3,
      name: 'Michael Brown',
      online: false,
      lastMessage: 'Can you review the document?',
      lastMessageTime: 'Yesterday',
      unreadCount: 0,
      avatarColor: '#4caf50'
    },
    {
      id: 4,
      name: 'Sarah Wilson',
      online: true,
      lastMessage: 'The project looks great!',
      lastMessageTime: 'Yesterday',
      unreadCount: 1,
      avatarColor: '#ff9800'
    },
    {
      id: 5,
      name: 'David Lee',
      online: false,
      lastMessage: 'Call me when you\'re free',
      lastMessageTime: 'Yesterday',
      unreadCount: 0,
      avatarColor: '#9c27b0'
    }
  ];

  allMessages: Message[] = [
    { id: 1, userId: 1, text: 'Hi John! How are you?', sender: 'me', time: '10:20 AM', read: true },
    { id: 2, userId: 1, text: 'I\'m good, thanks! How about you?', sender: 'other', time: '10:21 AM', read: true },
    { id: 3, userId: 1, text: 'Great! Ready for the meeting?', sender: 'me', time: '10:22 AM', read: true },
    { id: 4, userId: 1, text: 'Yes, see you at 11', sender: 'other', time: '10:23 AM', read: true },
    { id: 5, userId: 2, text: 'Hi Emma, did you see the design?', sender: 'me', time: '9:15 AM', read: true },
    { id: 6, userId: 2, text: 'Yes, it looks perfect!', sender: 'other', time: '9:16 AM', read: true },
    { id: 7, userId: 4, text: 'Sarah, check out the new update', sender: 'me', time: 'Yesterday', read: false }
  ];

  selectedUser: User | null = null;
  newMessage = '';

  ngOnInit() {
    // Auto-select first user
    if (this.users.length > 0) {
      this.selectUser(this.users[0]);
    }
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
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
      .sort((a, b) => this.parseTime(a.time).getTime() - this.parseTime(b.time).getTime());
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
