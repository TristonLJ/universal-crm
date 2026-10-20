import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { Access } from '../core/access.service';
import { GENERAL, Messages, dmThread, recThread } from '../core/messages';
import { Store } from '../core/store.service';
import { PageHeader } from '../shared/page-header';
import { Thread } from '../shared/thread';

interface Convo { key: string; title: string; sub: string; icon: string; }

@Component({
  selector: 'app-messages',
  imports: [FormsModule, NgIcon, HlmBadgeImports, HlmNativeSelectImports, PageHeader, Thread],
  template: `
    <app-page-header title="Messages" description="Company chat, direct messages and record discussions in one place" />
    <div data-tour="chat" class="grid h-[calc(100vh-11rem)] min-h-96 gap-4 md:grid-cols-[18rem_1fr]">
      <div class="overflow-y-auto rounded-xl border p-2">
        @for (g of groups(); track g.label) {
          <div class="text-muted-foreground px-2 pt-3 pb-1 text-xs font-medium uppercase">{{ g.label }}</div>
          @for (c of g.items; track c.key) {
            <button class="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm" [class.bg-muted]="c.key === current()" (click)="selected.set(c.key)">
              <ng-icon [name]="c.icon" class="text-muted-foreground size-4 shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block truncate" [class.font-semibold]="unread(c.key)">{{ c.title }}</span>
                @if (c.sub) { <span class="text-muted-foreground block truncate text-xs">{{ c.sub }}</span> }
              </span>
              @if (unread(c.key); as n) { <span hlmBadge [variant]="mentioned(c.key) ? 'destructive' : 'default'">{{ n }}</span> }
            </button>
          }
        }
        <div class="px-2 pt-4 pb-2">
          <hlm-native-select class="w-full" [ngModel]="''" (ngModelChange)="startRecord($event)">
            <option hlmNativeSelectOption value="">Discuss a record...</option>
            @for (r of records(); track r.id) { <option hlmNativeSelectOption [value]="r.id">{{ r.title }}</option> }
          </hlm-native-select>
        </div>
      </div>
      <div class="flex min-h-0 flex-col rounded-xl border p-4">
        <h3 class="mb-2 font-semibold">{{ currentTitle() }}</h3>
        <div class="min-h-0 flex-1"><app-thread [thread]="current()" /></div>
      </div>
    </div>
  `,
})
export class MessagesPage {
  private readonly store = inject(Store);
  private readonly access = inject(Access);
  private readonly msgs = inject(Messages);

  readonly selected = signal(GENERAL);
  /** Falls back to the company channel if the chosen thread is not visible to this person. */
  readonly current = computed(() => this.msgs.canSee(this.selected()) ? this.selected() : GENERAL);

  private readonly me = computed(() => this.store.currentUser().id);
  private readonly recById = computed(() => new Map(this.store.state().records.map(r => [r.id, r])));

  readonly records = computed(() => this.store.state().records.filter(r => this.access.recordVisible(r)).sort((a, b) => a.title.localeCompare(b.title)));

  readonly groups = computed(() => {
    const out: { label: string; items: Convo[] }[] = [];
    out.push({ label: 'Company', items: [{ key: GENERAL, title: 'General', sub: 'Everyone', icon: 'lucideUsers' }] });
    out.push({ label: 'Direct messages', items: this.store.users().filter(u => u.id !== this.me())
      .map(u => ({ key: dmThread(this.me(), u.id), title: u.name, sub: this.store.roleName(u.roleId), icon: 'lucideUser' })) });
    const active = new Set(this.msgs.visible().filter(m => m.thread.startsWith('rec:')).map(m => m.thread));
    if (this.selected().startsWith('rec:')) active.add(this.selected());
    const recs = [...active].map(k => ({ k, r: this.recById().get(k.slice(4)) })).filter(x => x.r && this.msgs.canSee(x.k))
      .map(x => ({ key: x.k, title: x.r!.title, sub: this.store.workspace(x.r!.wsId)?.name ?? '', icon: 'lucideBriefcase' }));
    if (recs.length) out.push({ label: 'Records', items: recs });
    return out;
  });

  readonly currentTitle = computed(() => this.groups().flatMap(g => g.items).find(c => c.key === this.current())?.title ?? 'General');

  unread = (key: string) => this.msgs.counts().get(key)?.unread ?? 0;
  mentioned = (key: string) => (this.msgs.counts().get(key)?.mentions ?? 0) > 0;
  startRecord(id: string) { if (id) this.selected.set(recThread(id)); }
}
