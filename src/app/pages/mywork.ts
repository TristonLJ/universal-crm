import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { Access } from '../core/access.service';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { stageOf, today } from '../core/utils';
import { PageHeader } from '../shared/page-header';
import { TaskRow } from '../shared/task-row';

@Component({
  selector: 'app-mywork',
  imports: [DatePipe, HlmCardImports, PageHeader, TaskRow],
  template: `
    <app-page-header [title]="'Hi, ' + firstName()" description="Everything assigned to you, soonest first." />
    <div class="grid gap-4 lg:grid-cols-2">
      <div hlmCard>
        <div hlmCardHeader><h3 hlmCardTitle>My open items</h3><p hlmCardDescription>{{ items().length }} in progress</p></div>
        <div hlmCardContent>
          @for (i of items(); track i.rec.id) {
            <button type="button" class="hover:bg-muted -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left" (click)="ui.openRecord(i.rec.id)">
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{{ i.rec.title }}</span>
                <span class="text-muted-foreground text-xs">{{ i.w.name }} &middot; {{ i.stage }}</span>
              </span>
              @if (i.rec.dueDate) {
                <span class="text-xs whitespace-nowrap" [class.text-destructive]="i.rec.dueDate < today" [class.font-medium]="i.rec.dueDate < today">
                  {{ i.rec.dueDate | date: 'd MMM' }}
                </span>
              }
            </button>
          } @empty { <p class="text-muted-foreground py-8 text-center text-sm">Nothing assigned to you.</p> }
        </div>
      </div>

      <div hlmCard>
        <div hlmCardHeader><h3 hlmCardTitle>My tasks</h3><p hlmCardDescription>{{ tasks().length }} to do</p></div>
        <div hlmCardContent>
          @for (t of tasks(); track t.id) { <app-task-row [task]="t" /> }
          @empty { <p class="text-muted-foreground py-8 text-center text-sm">No open tasks.</p> }
        </div>
      </div>
    </div>
  `,
})
export class MyWorkPage {
  readonly ui = inject(Ui);
  private readonly store = inject(Store);
  private readonly access = inject(Access);
  readonly today = today();

  readonly firstName = computed(() => this.store.currentUser().name.split(' ')[0]);

  readonly items = computed(() => {
    const me = this.store.currentUser().id;
    const visible = new Set(this.access.visibleWorkspaces().map(w => w.id));
    return this.store.state().records
      .filter(r => r.ownerId === me && visible.has(r.wsId))
      .map(rec => { const w = this.store.workspace(rec.wsId)!; return { rec, w, stage: stageOf(w, rec.stageId) }; })
      .filter(x => x.stage.kind === 'open')
      .map(x => ({ rec: x.rec, w: x.w, stage: x.stage.name }))
      .sort((a, b) => (a.rec.dueDate || '9999').localeCompare(b.rec.dueDate || '9999'));
  });

  readonly tasks = computed(() => {
    const me = this.store.currentUser().id;
    return this.store.state().tasks.filter(t => t.assigneeId === me && !t.done)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  });
}
