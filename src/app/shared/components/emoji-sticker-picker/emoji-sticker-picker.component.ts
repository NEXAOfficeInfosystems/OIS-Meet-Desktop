import {
  Component, OnInit, OnDestroy, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, ViewChild,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import {
  EMOJI_CATEGORIES, STICKER_PACKS,
  buildEmojiSearchIndex, buildStickerSearchIndex,
  EmojiEntry, EmojiCategory, StickerEntry, StickerPack
} from './emoji-data';

const RECENT_EMOJIS_KEY = 'esp_recent_emojis';
const RECENT_STICKERS_KEY = 'esp_recent_stickers';
const MAX_RECENT = 24;

export type PickerTab = 'emoji' | 'sticker';

@Component({
  selector: 'app-emoji-sticker-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './emoji-sticker-picker.component.html',
  styleUrls: ['./emoji-sticker-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmojiStickerPickerComponent implements OnInit, OnDestroy {
  @Input() initialTab: PickerTab = 'emoji';
  @Output() emojiSelect = new EventEmitter<string>();
  @Output() stickerSelect = new EventEmitter<string>();
  @Output() pickerClose = new EventEmitter<void>();

  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('scrollBody') scrollBodyRef!: ElementRef<HTMLDivElement>;

  // ── Tab state ────────────────────────────────────────────────────────────────
  activeTab: PickerTab = 'emoji';

  // ── Emoji state ──────────────────────────────────────────────────────────────
  emojiCategories = EMOJI_CATEGORIES;
  activeCategoryId = EMOJI_CATEGORIES[0].id;
  recentEmojis: EmojiEntry[] = [];
  emojiSearchResults: EmojiEntry[] = [];

  // ── Sticker state ────────────────────────────────────────────────────────────
  stickerPacks = STICKER_PACKS;
  activePackId = STICKER_PACKS[0].id;
  recentStickers: StickerEntry[] = [];
  stickerSearchResults: StickerEntry[] = [];

  // ── Search state ─────────────────────────────────────────────────────────────
  searchQuery = '';
  isSearching = false;

  // ── Keyboard nav ─────────────────────────────────────────────────────────────
  focusedIndex = -1;

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private emojiIndex = buildEmojiSearchIndex();
  private stickerIndex = buildStickerSearchIndex();

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.activeTab = this.initialTab;
    this.loadRecent();

    this.searchSubject.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => this.runSearch(query));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Tab ──────────────────────────────────────────────────────────────────────

  setTab(tab: PickerTab): void {
    this.activeTab = tab;
    this.searchQuery = '';
    this.isSearching = false;
    this.focusedIndex = -1;
    this.cdr.markForCheck();
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 50);
  }

  // ── Category / Pack navigation ───────────────────────────────────────────────

  setCategory(id: string): void {
    this.activeCategoryId = id;
    this.scrollToSection(id);
    this.cdr.markForCheck();
  }

  setPack(id: string): void {
    this.activePackId = id;
    this.scrollToSection(id);
    this.cdr.markForCheck();
  }

  private scrollToSection(id: string): void {
    setTimeout(() => {
      const el = this.scrollBodyRef?.nativeElement.querySelector(`[data-section="${id}"]`) as HTMLElement;
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 10);
  }

  // ── Search ───────────────────────────────────────────────────────────────────

  onSearchInput(): void {
    const q = this.searchQuery.trim();
    this.isSearching = q.length > 0;
    this.focusedIndex = -1;
    this.searchSubject.next(q.toLowerCase());
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.isSearching = false;
    this.focusedIndex = -1;
    this.cdr.markForCheck();
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  private runSearch(q: string): void {
    if (!q) {
      this.emojiSearchResults = [];
      this.stickerSearchResults = [];
      this.cdr.markForCheck();
      return;
    }

    if (this.activeTab === 'emoji') {
      this.emojiSearchResults = this.searchEmojis(q);
    } else {
      this.stickerSearchResults = this.searchStickers(q);
    }
    this.cdr.markForCheck();
  }

  private searchEmojis(q: string): EmojiEntry[] {
    const seen = new Set<string>();
    const results: EmojiEntry[] = [];

    // Exact name/keyword match first
    for (const cat of EMOJI_CATEGORIES) {
      for (const e of cat.emojis) {
        if (!seen.has(e.char) && (e.name.toLowerCase().includes(q) || e.keywords.some(k => k.toLowerCase().includes(q)))) {
          seen.add(e.char);
          results.push(e);
        }
      }
    }
    return results;
  }

  private searchStickers(q: string): StickerEntry[] {
    const seen = new Set<string>();
    const results: StickerEntry[] = [];

    for (const pack of STICKER_PACKS) {
      for (const s of pack.stickers) {
        if (!seen.has(s.char) && (s.name.toLowerCase().includes(q) || s.keywords.some(k => k.toLowerCase().includes(q)))) {
          seen.add(s.char);
          results.push(s);
        }
      }
    }
    return results;
  }

  // ── Selection ────────────────────────────────────────────────────────────────

  selectEmoji(entry: EmojiEntry): void {
    this.addToRecent(RECENT_EMOJIS_KEY, entry, this.recentEmojis);
    this.emojiSelect.emit(entry.char);
  }

  selectSticker(entry: StickerEntry): void {
    this.addToRecent(RECENT_STICKERS_KEY, entry, this.recentStickers);
    this.stickerSelect.emit(entry.char);
  }

  // ── Recent items ─────────────────────────────────────────────────────────────

  private loadRecent(): void {
    try {
      const rawE = localStorage.getItem(RECENT_EMOJIS_KEY);
      this.recentEmojis = rawE ? JSON.parse(rawE) : [];
      const rawS = localStorage.getItem(RECENT_STICKERS_KEY);
      this.recentStickers = rawS ? JSON.parse(rawS) : [];
    } catch {
      this.recentEmojis = [];
      this.recentStickers = [];
    }
  }

  private addToRecent<T extends { char: string }>(key: string, item: T, list: T[]): void {
    const idx = list.findIndex(x => x.char === item.char);
    if (idx > -1) list.splice(idx, 1);
    list.unshift(item);
    if (list.length > MAX_RECENT) list.length = MAX_RECENT;
    try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
    this.cdr.markForCheck();
  }

  // ── Keyboard navigation ──────────────────────────────────────────────────────

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.pickerClose.emit();
      event.preventDefault();
      return;
    }
    const items = this.getVisibleItems();
    if (!items.length) return;

    if (event.key === 'ArrowRight') {
      this.focusedIndex = Math.min(this.focusedIndex + 1, items.length - 1);
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
      event.preventDefault();
    } else if (event.key === 'ArrowDown') {
      this.focusedIndex = Math.min(this.focusedIndex + 8, items.length - 1);
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      if (this.focusedIndex <= 0) return;
      this.focusedIndex = Math.max(this.focusedIndex - 8, 0);
      event.preventDefault();
    } else if (event.key === 'Enter' && this.focusedIndex >= 0) {
      const item = items[this.focusedIndex];
      if (this.activeTab === 'emoji') this.selectEmoji(item as EmojiEntry);
      else this.selectSticker(item as StickerEntry);
      event.preventDefault();
    }
    this.cdr.markForCheck();
    this.scrollFocusedIntoView();
  }

  private getVisibleItems(): (EmojiEntry | StickerEntry)[] {
    if (this.activeTab === 'emoji') {
      if (this.isSearching) return this.emojiSearchResults;
      const all: EmojiEntry[] = [];
      if (this.recentEmojis.length) all.push(...this.recentEmojis);
      for (const cat of EMOJI_CATEGORIES) all.push(...cat.emojis);
      return all;
    } else {
      if (this.isSearching) return this.stickerSearchResults;
      const all: StickerEntry[] = [];
      if (this.recentStickers.length) all.push(...this.recentStickers);
      for (const pack of STICKER_PACKS) all.push(...pack.stickers);
      return all;
    }
  }

  private scrollFocusedIntoView(): void {
    setTimeout(() => {
      const el = this.scrollBodyRef?.nativeElement.querySelector('.esp-item.focused') as HTMLElement;
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 10);
  }

  // ── Scroll tracking (category highlight) ────────────────────────────────────

  onBodyScroll(): void {
    if (this.isSearching) return;
    const body = this.scrollBodyRef?.nativeElement;
    if (!body) return;
    const sections = body.querySelectorAll<HTMLElement>('[data-section]');
    let closestId = '';
    let closestDist = Infinity;
    sections.forEach(sec => {
      const dist = Math.abs(sec.getBoundingClientRect().top - body.getBoundingClientRect().top);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = sec.dataset['section'] || '';
      }
    });
    if (this.activeTab === 'emoji' && closestId !== this.activeCategoryId) {
      this.activeCategoryId = closestId;
      this.cdr.markForCheck();
    }
    if (this.activeTab === 'sticker' && closestId !== this.activePackId) {
      this.activePackId = closestId;
      this.cdr.markForCheck();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  trackByChar(_: number, item: { char: string }): string {
    return item.char;
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  getItemIndexInVisible(item: { char: string }): number {
    return this.getVisibleItems().findIndex(x => x.char === item.char);
  }
}
