import { Injectable, computed, inject } from '@angular/core';
import { Access } from './access.service';
import { Message } from './models';
import { Store } from './store.service';
import { nowIso, uid } from './utils';

export const GENERAL = 'general';
export const recThread = (recordId: string) => 'rec:' + recordId;
export const dmThread = (a: string, b: string) => 'dm:' + [a, b].sort().join(':');

/** Chat built into the CRM: a company channel, direct messages and one thread per record. */
@Injectable({ providedIn: 'root' })
export class Messages {
  private readonly store = inject(Store);
  private readonly access = inject(Access);

  private readonly me = computed(() => this.store.currentUser().id);

  /** Can the current person see this thread? */
  canSee(thread: string): boolean {
    if (thread === GENERAL) return true;
    if (thread.startsWith('dm:')) return thread.split(':').slice(1).includes(this.me());
    const rec = this.store.state().records.find(r => r.id === thread.slice(4));
    return !!rec && this.access.recordVisible(rec);
  }

  readonly visible = computed(() => this.store.state().messages.filter(m => this.canSee(m.thread)));

  forThread(thread: string): Message[] {
    return this.visible().filter(m => m.thread === thread).sort((a, b) => a.at.localeCompare(b.at));
  }

  isUnread = (m: Message) => m.fromId !== this.me() && !m.readBy.includes(this.me());
  isMention = (m: Message) => m.mentions.includes(this.me());

  /** thread -> unread and mention counts, for everything the person can see. */
  readonly counts = computed(() => {
    const out = new Map<string, { unread: number; mentions: number }>();
    for (const m of this.visible()) {
      if (!this.isUnread(m)) continue;
      const c = out.get(m.thread) ?? { unread: 0, mentions: 0 };
      c.unread++;
      if (this.isMention(m)) c.mentions++;
      out.set(m.thread, c);
    }
    return out;
  });
  readonly totalUnread = computed(() => [...this.counts().values()].reduce((t, c) => t + c.unread, 0));
  readonly totalMentions = computed(() => [...this.counts().values()].reduce((t, c) => t + c.mentions, 0));

  /** People named with @ in the text: "@Sipho" or "@Sipho Dlamini". */
  mentionsIn(text: string): string[] {
    const t = ' ' + text.toLowerCase() + ' ';
    return this.store.users().filter(u => {
      const full = u.name.toLowerCase(), first = full.split(' ')[0].replace(/[^a-z0-9]/g, '');
      return t.includes('@' + full) || (!!first && new RegExp('@' + first + '(?![a-z0-9])').test(t));
    }).map(u => u.id).filter(id => id !== this.me());
  }

  send(thread: string, text: string) {
    const clean = text.trim();
    if (!clean || !this.canSee(thread)) return;
    const mentions = this.mentionsIn(clean);
    this.store.mutate(s => {
      s.messages.push({ id: uid(), thread, fromId: this.me(), text: clean, at: nowIso(), mentions, readBy: [this.me()] });
    });
  }

  markRead(thread: string) {
    const me = this.me();
    if (!this.visible().some(m => m.thread === thread && this.isUnread(m))) return;
    this.store.mutate(s => {
      for (const m of s.messages) if (m.thread === thread && !m.readBy.includes(me)) m.readBy.push(me);
    });
  }

  remove(id: string) { this.store.mutate(s => { s.messages = s.messages.filter(m => m.id !== id); }); }
}
