import { Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { Access } from '../core/access.service';
import { Task } from '../core/models';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { today } from '../core/utils';

@Component({
  selector: 'app-task-row',
  imports: [DatePipe, NgIcon, HlmButtonImports, HlmCheckboxImports],
  template: `
    <div class="flex items-center gap-3 border-b py-2.5 last:border-b-0">
      <hlm-checkbox [checked]="task().done" [disabled]="!access.can('edit')" [aria-label]="'Done: ' + task().title"
                    (checkedChange)="store.setTaskDone(task().id, $event)" />
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm" [class.line-through]="task().done" [class.text-muted-foreground]="task().done">{{ task().title }}</div>
        @if (showRecord() && recordTitle()) {
          <button type="button" class="text-muted-foreground hover:text-foreground text-xs hover:underline" (click)="ui.openRecord(task().recordId)">
            {{ recordTitle() }}
          </button>
        }
      </div>
      @if (task().due) {
        <span class="text-xs whitespace-nowrap" [class.text-destructive]="late()" [class.font-medium]="late()"
              [class.text-muted-foreground]="!late()">{{ task().due | date: 'd MMM' }}</span>
      }
      @if (access.can('edit')) {
        <button hlmBtn variant="ghost" size="icon-xs" aria-label="Delete task" (click)="store.deleteTask(task().id)">
          <ng-icon name="lucideX" />
        </button>
      }
    </div>
  `,
})
export class TaskRow {
  readonly store = inject(Store);
  readonly access = inject(Access);
  readonly ui = inject(Ui);

  readonly task = input.required<Task>();
  readonly showRecord = input(true);

  readonly late = computed(() => !this.task().done && !!this.task().due && this.task().due < today());
  recordTitle = () => this.store.state().records.find(r => r.id === this.task().recordId)?.title ?? '';
}
