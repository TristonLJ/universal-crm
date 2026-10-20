import { DatePipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { FileStore } from '../core/files';
import { FileMeta, Message } from '../core/models';
import { isSheetFile } from '../core/sheets';
import { Ui } from '../core/ui.service';
import { Messages } from '../core/messages';
import { Store } from '../core/store.service';

/** One conversation: messages, a box to write in, and @mentions. */
@Component({
  selector: 'app-thread',
  imports: [FormsModule, DatePipe, NgIcon, HlmButtonImports, HlmInputImports],
  template: `
    <div class="flex h-full min-h-0 flex-col">
      <div #scroller class="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
        @for (m of list(); track m.id) {
          <div class="flex flex-col" [class.items-end]="m.fromId === me()">
            <div class="text-muted-foreground mb-0.5 text-xs">{{ m.fromId === me() ? 'You' : store.userName(m.fromId) || 'Former colleague' }} &middot; {{ m.at | date: 'd MMM, HH:mm' }}</div>
            <div class="group flex max-w-[85%] items-start gap-1">
              <div class="rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap"
                   [class]="m.fromId === me() ? 'bg-primary text-primary-foreground' : 'bg-muted'"
                   [class.ring-2]="msgs.isMention(m)" [class.ring-amber-500]="msgs.isMention(m)">{{ m.text }}
                @for (f of filesOf(m); track f.id) {
                  <div class="mt-2 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5 dark:bg-white/10">
                    <ng-icon name="lucideFileText" class="size-4 shrink-0" />
                    <button class="min-w-0 flex-1 truncate text-left font-medium underline-offset-2 hover:underline" (click)="openFile(f)">{{ f.name }}</button>
                  </div>
                }
              </div>
              @if (m.fromId === me()) {
                <button class="text-muted-foreground opacity-0 group-hover:opacity-100" title="Delete message" (click)="msgs.remove(m.id)"><ng-icon name="lucideX" class="size-3.5" /></button>
              }
            </div>
          </div>
        } @empty { <p class="text-muted-foreground py-8 text-center text-sm">No messages yet. Say hello, or @mention someone to get their attention.</p> }
      </div>
      <div class="border-t pt-3">
        @if (suggest().length) {
          <div class="mb-2 flex flex-wrap gap-1">
            @for (u of suggest(); track u.id) { <button hlmBtn variant="outline" size="sm" (click)="insert(u.name)">&#64;{{ u.name }}</button> }
          </div>
        }
        <div class="flex gap-2">
          <input hlmInput class="flex-1" autocomplete="off" [placeholder]="placeholder()" [ngModel]="text()" (ngModelChange)="text.set($event)" (keydown.enter)="send()">
          <button hlmBtn [disabled]="!text().trim()" (click)="send()">Send</button>
        </div>
      </div>
    </div>
  `,
})
export class Thread {
  readonly msgs = inject(Messages);
  readonly store = inject(Store);
  private readonly fileStore = inject(FileStore);
  private readonly ui = inject(Ui);

  readonly thread = input.required<string>();
  readonly placeholder = input('Write a message... use @name to mention someone');
  readonly text = signal('');
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  readonly me = computed(() => this.store.currentUser().id);
  readonly list = computed(() => this.msgs.forThread(this.thread()));

  /** People matching what is typed after a trailing "@". */
  readonly suggest = computed(() => {
    const m = /@([^\s@]*)$/.exec(this.text());
    if (!m) return [];
    const q = m[1].toLowerCase();
    return this.store.users().filter(u => u.id !== this.me() && u.name.toLowerCase().split(' ').some(p => p.startsWith(q)) ).slice(0, 6);
  });

  constructor() {
    effect(() => {
      this.list();   // run again when messages arrive or the thread changes
      const t = this.thread();
      untracked(() => {
        this.msgs.markRead(t);
        setTimeout(() => { const el = this.scroller().nativeElement; el.scrollTop = el.scrollHeight; }, 0);
      });
    });
  }

  filesOf(m: Message): FileMeta[] {
    return (m.fileIds ?? []).map(id => this.store.state().files.find(f => f.id === id)).filter((f): f is FileMeta => !!f);
  }
  /** Spreadsheets open in the workbench; everything else opens in a new tab. */
  openFile(f: FileMeta) { if (isSheetFile(f.name)) this.ui.openWorkbench(f.id); else this.fileStore.open(f); }

  send() { this.msgs.send(this.thread(), this.text()); this.text.set(''); }
  insert(name: string) { this.text.update(t => t.replace(/@[^\s@]*$/, '') + '@' + name + ' '); }
}
