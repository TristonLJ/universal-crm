import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { Access } from '../core/access.service';
import { Task } from '../core/models';
import { Store } from '../core/store.service';
import { dayOffset, today } from '../core/utils';
import { PageHeader } from '../shared/page-header';
import { TaskRow } from '../shared/task-row';

@Component({
  selector: 'app-tasks',
  imports: [FormsModule, HlmButtonImports, HlmCardImports, HlmInputImports, HlmNativeSelectImports, HlmTabsImports, PageHeader, TaskRow],
  template: `
    @if (w(); as w) {
      <app-page-header title="Tasks" [description]="'Follow-ups for ' + w.name">
        <hlm-tabs [tab]="filter()" (tabActivated)="filter.set($any($event))">
          <hlm-tabs-list>
            <button hlmTabsTrigger="open">Open</button>
            <button hlmTabsTrigger="done">Done</button>
            <button hlmTabsTrigger="all">All</button>
          </hlm-tabs-list>
        </hlm-tabs>
      </app-page-header>

      @if (access.can('edit')) {
        <div hlmCard class="mb-6 py-4">
          <div hlmCardContent class="flex flex-wrap gap-2">
            <input hlmInput class="min-w-48 flex-1" placeholder="Add a task and press Enter..." [(ngModel)]="title" (keydown.enter)="add(w.id)">
            <input hlmInput type="date" class="w-40" [(ngModel)]="due">
            <hlm-native-select class="w-48" [(ngModel)]="recordId">
              <option hlmNativeSelectOption value="">No {{ w.recordLabel.toLowerCase() }}</option>
              @for (r of records(); track r.id) { <option hlmNativeSelectOption [value]="r.id">{{ r.title }}</option> }
            </hlm-native-select>
            <button hlmBtn (click)="add(w.id)">Add</button>
          </div>
        </div>
      }

      @for (g of groups(); track g.label) {
        <div hlmCard class="mb-4 py-4">
          <div hlmCardHeader class="pb-0">
            <h3 hlmCardTitle class="text-sm" [class.text-destructive]="g.label === 'Overdue'">{{ g.label }} <span class="text-muted-foreground font-normal">({{ g.tasks.length }})</span></h3>
          </div>
          <div hlmCardContent>
            @for (t of g.tasks; track t.id) { <app-task-row [task]="t" /> }
          </div>
        </div>
      } @empty {
        <p class="text-muted-foreground py-16 text-center">Nothing here. You are all caught up.</p>
      }
    }
  `,
})
export class TasksPage {
  readonly access = inject(Access);
  private readonly store = inject(Store);

  readonly w = this.access.activeWorkspace;
  readonly filter = signal<'open' | 'done' | 'all'>('open');
  title = ''; due = ''; recordId = '';

  readonly records = computed(() => { const w = this.w(); return w ? this.access.recordsOf(w.id) : []; });

  private readonly tasks = computed(() => {
    const w = this.w(), f = this.filter(), me = this.store.currentUser().id;
    const own = this.access.role().recordScope === 'own';
    if (!w) return [];
    return this.store.state().tasks
      .filter(t => t.wsId === w.id && (!own || t.assigneeId === me) && (f === 'all' || (f === 'open') === !t.done))
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  });

  /** Tasks bucketed by urgency so the screen answers "what do I do next?". */
  readonly groups = computed(() => {
    const t0 = today(), week = dayOffset(7);
    const buckets: { label: string; tasks: Task[] }[] = [
      { label: 'Overdue', tasks: [] }, { label: 'Today', tasks: [] }, { label: 'This week', tasks: [] },
      { label: 'Later', tasks: [] }, { label: 'No date', tasks: [] }, { label: 'Done', tasks: [] },
    ];
    for (const t of this.tasks()) {
      const b = t.done ? 5 : !t.due ? 4 : t.due < t0 ? 0 : t.due === t0 ? 1 : t.due <= week ? 2 : 3;
      buckets[b].tasks.push(t);
    }
    return buckets.filter(b => b.tasks.length);
  });

  add(wsId: string) {
    if (!this.title.trim()) return;
    this.store.addTask({ wsId, title: this.title.trim(), due: this.due, recordId: this.recordId });
    this.title = ''; this.due = ''; this.recordId = '';
  }
}
