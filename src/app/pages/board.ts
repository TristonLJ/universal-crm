import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { Access } from '../core/access.service';
import { CrmRecord } from '../core/models';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { stageOf, sumValues, today } from '../core/utils';
import { PageHeader } from '../shared/page-header';
import { PILL, priorityClass } from '../shared/styles';

@Component({
  selector: 'app-board',
  imports: [DatePipe, FormsModule, NgIcon, CdkDropListGroup, CdkDropList, CdkDrag, HlmButtonImports, HlmInputImports, PageHeader],
  template: `
    @if (data(); as d) {
      <app-page-header [title]="d.w.recordLabelPlural" description="Drag cards between stages. Click one to open it.">
        <input hlmInput type="search" class="w-48" placeholder="Search..." [ngModel]="search()" (ngModelChange)="search.set($event)">
        <button hlmBtn [variant]="mine() ? 'default' : 'outline'" (click)="mine.set(!mine())">Mine</button>
        @if (access.can('create')) {
          <button hlmBtn (click)="ui.openRecord()"><ng-icon name="lucidePlus" /> New {{ d.w.recordLabel.toLowerCase() }}</button>
        }
      </app-page-header>

      <div cdkDropListGroup data-tour="board" class="-mx-4 flex items-start gap-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
        @for (col of d.cols; track col.stage.id) {
          <div cdkDropList [cdkDropListData]="col.stage.id" (cdkDropListDropped)="drop($event)"
               class="bg-muted/50 flex min-h-40 w-72 shrink-0 flex-col gap-2 rounded-xl border p-3">
            <div class="flex items-center gap-2 border-t-[3px] pt-2" [style.border-color]="col.stage.color">
              <span class="text-sm font-semibold">{{ col.stage.name }}</span>
              <span class="bg-background text-muted-foreground rounded-full border px-2 text-xs">{{ col.recs.length }}</span>
              @if (access.money(col.total)) { <span class="text-muted-foreground ml-auto text-xs">{{ access.money(col.total) }}</span> }
            </div>

            <div class="flex flex-col gap-2">
              @for (r of col.recs; track r.id) {
                <div cdkDrag [cdkDragData]="r.id" [cdkDragDisabled]="!access.can('edit')" tabindex="0"
                     class="bg-card hover:border-primary focus-visible:border-primary cursor-pointer rounded-lg border p-3 shadow-xs outline-none"
                     [class.cursor-grab]="access.can('edit')" (click)="open(r.id)" (keydown.enter)="open(r.id)">
                  <div class="text-sm font-medium">{{ r.title }}</div>
                  @if (store.contactName(r.contactId)) { <div class="text-muted-foreground mt-0.5 text-xs">{{ store.contactName(r.contactId) }}</div> }
                  <div class="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span [class]="pill + ' ' + prio(r.priority)">{{ r.priority }}</span>
                    @if (access.money(r.value)) { <span>{{ access.money(r.value) }}</span> }
                    @if (r.dueDate) {
                      <span [class.text-destructive]="r.dueDate < today && col.stage.kind === 'open'" [class.font-medium]="r.dueDate < today && col.stage.kind === 'open'">
                        {{ r.dueDate | date: 'd MMM' }}
                      </span>
                    }
                    @if (store.userName(r.ownerId)) { <span class="ml-auto">{{ store.userName(r.ownerId) }}</span> }
                  </div>
                </div>
              }
            </div>

            @if (access.can('create')) {
              @if (adding() === col.stage.id) {
                <input hlmInput class="bg-background" placeholder="Name, then Enter" autofocus [(ngModel)]="addTitle"
                       (keydown.enter)="quickAdd(d.w.id, col.stage.id)" (keydown.escape)="adding.set('')" (blur)="adding.set('')">
              } @else {
                <button hlmBtn variant="ghost" size="sm" class="text-muted-foreground w-full justify-start" (click)="startAdd(col.stage.id)">
                  <ng-icon name="lucidePlus" /> Add
                </button>
              }
            }
          </div>
        }
      </div>
    }
  `,
})
export class BoardPage {
  readonly access = inject(Access);
  readonly store = inject(Store);
  readonly ui = inject(Ui);

  readonly today = today();
  readonly pill = PILL;
  readonly prio = priorityClass;
  readonly search = signal('');
  readonly mine = signal(false);
  readonly adding = signal('');
  addTitle = '';
  private justDragged = false;

  readonly data = computed(() => {
    const w = this.access.activeWorkspace();
    if (!w) return null;
    const q = this.search().toLowerCase(), me = this.store.currentUser().id, mine = this.mine();
    const match = (r: CrmRecord) => (!mine || r.ownerId === me) && (!q ||
      (r.title + ' ' + this.store.contactName(r.contactId) + ' ' + this.store.userName(r.ownerId)).toLowerCase().includes(q));
    const recs = this.access.recordsOf(w.id).filter(match);
    return {
      w,
      cols: w.stages.map(s => {
        const rs = recs.filter(r => r.stageId === s.id);
        return { stage: stageOf(w, s.id), recs: rs, total: sumValues(rs) };
      }),
    };
  });

  open(id: string) { if (!this.justDragged) this.ui.openRecord(id); }

  drop(e: CdkDragDrop<string>) {
    this.justDragged = true;
    setTimeout(() => (this.justDragged = false), 150);
    const id = e.item.data as string;
    const to = e.container.data;
    const rec = this.store.state().records.find(r => r.id === id);
    if (!rec || rec.stageId === to) return;
    const from = rec.stageId;
    const w = this.store.workspace(rec.wsId)!;
    this.store.moveRecord(id, to);
    toast('Moved "' + rec.title + '" to ' + stageOf(w, to).name, {
      action: { label: 'Undo', onClick: () => this.store.moveRecord(id, from) },
    });
  }

  startAdd(stageId: string) { this.addTitle = ''; this.adding.set(stageId); }

  quickAdd(wsId: string, stageId: string) {
    const t = this.addTitle.trim();
    if (!t) return;
    this.store.quickAdd(wsId, stageId, t);
    this.addTitle = '';
    toast.success('Added "' + t + '"');
  }
}
