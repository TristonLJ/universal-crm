import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { Access } from '../core/access.service';
import { ActivityType, CrmRecord, FieldType, Workspace } from '../core/models';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { stageOf } from '../core/utils';
import { TaskRow } from './task-row';
import { FileDrop } from './file-drop';
import { Thread } from './thread';
import { Messages, recThread } from '../core/messages';
import { FileStore } from '../core/files';
import { fileSize } from './file-size';
import { isSheetFile } from '../core/sheets';
import { FileMeta } from '../core/models';

interface Draft { rec: CrmRecord; w: Workspace; existing: boolean; editable: boolean; }

/** Side drawer for viewing/editing one record. Tabs keep details, tasks and history in one place. */
@Component({
  selector: 'app-record-sheet',
  imports: [
    FormsModule, DatePipe, NgIcon, TaskRow, FileDrop, Thread, HlmSheetImports, HlmTabsImports, HlmButtonImports, HlmInputImports,
    HlmLabelImports, HlmNativeSelectImports, HlmTextareaImports, HlmBadgeImports,
  ],
  template: `
    <hlm-sheet side="right" [state]="open() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      @if (draft(); as d) {
        <hlm-sheet-content *hlmSheetPortal="let ctx" class="w-full gap-0 data-[side=right]:sm:max-w-xl">
          <hlm-sheet-header class="border-b">
            <h3 hlmSheetTitle>{{ heading(d) }}</h3>
            <p hlmSheetDescription>
              @if (d.existing) { Created {{ d.rec.createdAt | date: 'd MMM y' }} in {{ d.w.name }} } @else { in {{ d.w.name }} }
            </p>
          </hlm-sheet-header>

          <div class="flex-1 overflow-y-auto px-4 py-4">
            @if (d.existing) {
              <hlm-tabs [tab]="tab()" (tabActivated)="tab.set($event)" class="w-full">
                <hlm-tabs-list class="w-full">
                  <button hlmTabsTrigger="details" class="flex-1">Details</button>
                  <button hlmTabsTrigger="tasks" class="flex-1">Tasks ({{ tasks().length }})</button>
                  <button hlmTabsTrigger="chat" class="flex-1">Chat ({{ chatCount() }})</button>
                  <button hlmTabsTrigger="files" class="flex-1">Files ({{ recFiles().length }})</button>
                  <button hlmTabsTrigger="activity" class="flex-1">Activity</button>
                </hlm-tabs-list>
              </hlm-tabs>
            }

            @if (!d.existing || tab() === 'details') {
              <div class="mt-4 grid grid-cols-2 gap-4">
                <div class="col-span-2 grid gap-1.5">
                  <label hlmLabel>Name *</label>
                  <input hlmInput [class.border-destructive]="invalid()" [(ngModel)]="d.rec.title" [disabled]="!d.editable"
                         [placeholder]="d.w.recordLabel + ' name'">
                </div>
                <div class="grid gap-1.5"><label hlmLabel>Stage</label>
                  <hlm-native-select class="w-full" [(ngModel)]="d.rec.stageId" [disabled]="!d.editable">
                    @for (s of d.w.stages; track s.id) { <option hlmNativeSelectOption [value]="s.id">{{ s.name }}</option> }
                  </hlm-native-select></div>
                <div class="grid gap-1.5"><label hlmLabel>Priority</label>
                  <hlm-native-select class="w-full" [(ngModel)]="d.rec.priority" [disabled]="!d.editable">
                    <option hlmNativeSelectOption value="low">Low</option>
                    <option hlmNativeSelectOption value="medium">Medium</option>
                    <option hlmNativeSelectOption value="high">High</option>
                  </hlm-native-select></div>
                <div class="grid gap-1.5"><label hlmLabel>Contact</label>
                  <hlm-native-select class="w-full" [(ngModel)]="d.rec.contactId" [disabled]="!d.editable">
                    <option hlmNativeSelectOption value="">-</option>
                    @for (c of store.state().contacts; track c.id) {
                      <option hlmNativeSelectOption [value]="c.id">{{ c.name }}{{ c.company ? ' (' + c.company + ')' : '' }}</option>
                    }
                  </hlm-native-select></div>
                <div class="grid gap-1.5"><label hlmLabel>Owner</label>
                  <hlm-native-select class="w-full" [(ngModel)]="d.rec.ownerId" [disabled]="!d.editable || !access.can('reassign')">
                    <option hlmNativeSelectOption value="">Unassigned</option>
                    @for (u of store.users(); track u.id) { <option hlmNativeSelectOption [value]="u.id">{{ u.name }} ({{ store.roleName(u.roleId) }})</option> }
                  </hlm-native-select></div>
                @if (access.can('viewMoney')) {
                  <div class="grid gap-1.5"><label hlmLabel>Value</label>
                    <input hlmInput type="number" [(ngModel)]="d.rec.value" [disabled]="!d.editable"></div>
                }
                <div class="grid gap-1.5"><label hlmLabel>Due date</label>
                  <input hlmInput type="date" [(ngModel)]="d.rec.dueDate" [disabled]="!d.editable"></div>

                @for (f of access.visibleFields(d.w); track f.id) {
                  <div class="grid gap-1.5" [class.col-span-2]="f.type === 'longtext'">
                    <label hlmLabel>{{ f.label }}</label>
                    @switch (f.type) {
                      @case ('longtext') { <textarea hlmTextarea rows="3" [(ngModel)]="d.rec.fields[f.id]" [disabled]="!d.editable"></textarea> }
                      @case ('select') {
                        <hlm-native-select class="w-full" [(ngModel)]="d.rec.fields[f.id]" [disabled]="!d.editable">
                          <option hlmNativeSelectOption value="">-</option>
                          @for (o of f.options; track o) { <option hlmNativeSelectOption [value]="o">{{ o }}</option> }
                        </hlm-native-select>
                      }
                      @default { <input hlmInput [type]="inputType(f.type)" [(ngModel)]="d.rec.fields[f.id]" [disabled]="!d.editable"> }
                    }
                  </div>
                }
              </div>
            }

            @if (d.existing && tab() === 'tasks') {
              <div class="mt-4">
                @for (t of tasks(); track t.id) { <app-task-row [task]="t" [showRecord]="false" /> }
                @empty { <p class="text-muted-foreground py-6 text-center text-sm">No follow-ups yet.</p> }
                @if (access.can('edit')) {
                  <div class="mt-3 flex gap-2">
                    <input hlmInput class="flex-1" placeholder="Add a follow-up..." [(ngModel)]="taskTitle" (keydown.enter)="addTask(d)">
                    <input hlmInput type="date" class="w-40" [(ngModel)]="taskDue">
                    <button hlmBtn variant="outline" (click)="addTask(d)">Add</button>
                  </div>
                }
              </div>
            }

            @if (d.existing && tab() === 'chat') {
              <div class="mt-4 h-[26rem]"><app-thread [thread]="threadKey()" /></div>
            }

            @if (d.existing && tab() === 'files') {
              <div class="mt-4 grid gap-3">
                @if (access.can('edit')) { <app-file-drop [recordId]="d.rec.id" [compact]="true" label="Drop files here or click to attach" /> }
                @for (f of recFiles(); track f.id) {
                  <div class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <ng-icon name="lucideFileText" class="text-muted-foreground size-4 shrink-0" />
                    <button class="min-w-0 flex-1 truncate text-left font-medium hover:underline" (click)="openFile(f)">{{ f.name }}</button>
                    <span class="text-muted-foreground shrink-0 text-xs">{{ size(f.size) }} &middot; {{ f.addedAt | date: 'd MMM' }}</span>
                    @if (isSheet(f.name)) { <button hlmBtn variant="ghost" size="sm" (click)="ui.openWorkbench(f.id)" title="Open in the workbench"><ng-icon name="lucideTable2" /></button> }
                    <button hlmBtn variant="ghost" size="sm" (click)="ui.sendFile.set(f.id)" title="Send to a colleague or manager"><ng-icon name="lucideSend" /></button>
                    <button hlmBtn variant="ghost" size="sm" (click)="openFile(f, true)" title="Download"><ng-icon name="lucideDownload" /></button>
                    @if (access.can('delete')) { <button hlmBtn variant="ghost" size="sm" (click)="removeFile(f)" title="Delete"><ng-icon name="lucideTrash2" /></button> }
                  </div>
                } @empty { <p class="text-muted-foreground py-4 text-center text-sm">No files on this {{ d.w.recordLabel.toLowerCase() }} yet.</p> }
              </div>
            }

            @if (d.existing && tab() === 'activity') {
              <div class="mt-4">
                @if (access.can('comment')) {
                  <div class="mb-4 flex gap-2">
                    <hlm-native-select [(ngModel)]="noteType" class="w-28">
                      <option hlmNativeSelectOption value="note">Note</option>
                      <option hlmNativeSelectOption value="call">Call</option>
                      <option hlmNativeSelectOption value="email">Email</option>
                      <option hlmNativeSelectOption value="meeting">Meeting</option>
                    </hlm-native-select>
                    <input hlmInput class="flex-1" placeholder="Log what happened..." [(ngModel)]="noteText" (keydown.enter)="logNote(d)">
                    <button hlmBtn variant="outline" (click)="logNote(d)">Log</button>
                  </div>
                }
                <ol class="border-border relative ml-2 border-l">
                  @for (a of acts(); track a.id) {
                    <li class="mb-4 ml-4">
                      <span class="bg-border absolute -left-[5px] mt-1.5 size-2.5 rounded-full" [class.bg-primary]="a.type !== 'stage'"></span>
                      <div class="text-muted-foreground text-xs">{{ a.at | date: 'd MMM, HH:mm' }} &middot; <span class="capitalize">{{ a.type }}</span></div>
                      <div class="text-sm">{{ a.text }}</div>
                    </li>
                  }
                </ol>
              </div>
            }
          </div>

          <hlm-sheet-footer class="border-t sm:flex-row sm:justify-between">
            @if (d.existing && access.can('delete')) {
              <button hlmBtn variant="destructive" (click)="remove(d)"><ng-icon name="lucideTrash2" /> Delete</button>
            } @else { <span></span> }
            @if (d.editable) {
              <div class="flex gap-2">
                <button hlmBtn variant="outline" (click)="close()">Cancel</button>
                <button hlmBtn (click)="save(d)">Save</button>
              </div>
            } @else {
              <span class="text-muted-foreground self-center text-sm">Read-only for your role</span>
            }
          </hlm-sheet-footer>
        </hlm-sheet-content>
      }
    </hlm-sheet>
  `,
})
export class RecordSheet {
  readonly store = inject(Store);
  readonly access = inject(Access);
  readonly ui = inject(Ui);
  isSheet = isSheetFile;
  private readonly fileStore = inject(FileStore);
  private readonly messages = inject(Messages);
  size = fileSize;

  readonly draft = signal<Draft | null>(null);
  readonly open = signal(false);
  readonly invalid = signal(false);
  readonly tab = signal('details');

  noteType: ActivityType = 'note';
  noteText = '';
  taskTitle = '';
  taskDue = '';

  private readonly recId = computed(() => this.draft()?.rec.id ?? '');
  readonly acts = computed(() => this.store.state().activities
    .filter(a => a.recordId === this.recId()).sort((a, b) => b.at.localeCompare(a.at)));
  readonly threadKey = computed(() => recThread(this.recId()));
  readonly chatCount = computed(() => this.messages.forThread(this.threadKey()).length);
  readonly recFiles = computed(() => this.store.state().files.filter(f => f.recordId === this.recId()).sort((a, b) => b.addedAt.localeCompare(a.addedAt)));
  readonly tasks = computed(() => this.store.state().tasks.filter(t => t.recordId === this.recId()));

  constructor() {
    effect(() => {
      const req = this.ui.recordSheet();
      untracked(() => this.show(req));
    });
  }

  private show(req: { id?: string; stageId?: string } | null) {
    if (!req) { this.open.set(false); return; }
    const ex = req.id ? this.store.state().records.find(r => r.id === req.id) : undefined;
    const w = ex ? this.store.workspace(ex.wsId) : this.access.activeWorkspace();
    if (!w) return;
    const rec: CrmRecord = ex ? structuredClone(ex) : {
      id: '', wsId: w.id, title: '', stageId: req.stageId ?? w.stages[0].id, ownerId: this.store.currentUser().id,
      contactId: '', value: null, dueDate: '', priority: 'medium', fields: {},
      createdAt: '', updatedAt: '', stageChangedAt: '',
    };
    this.invalid.set(false);
    this.tab.set('details');
    this.noteType = 'note'; this.noteText = ''; this.taskTitle = ''; this.taskDue = '';
    this.draft.set({ rec, w, existing: !!ex, editable: ex ? this.access.can('edit') : this.access.can('create') });
    this.open.set(true);
  }

  heading = (d: Draft) => (!d.editable ? 'View ' : d.existing ? 'Edit ' : 'New ') + d.w.recordLabel.toLowerCase();
  inputType = (t: FieldType) => ({ number: 'number', money: 'number', date: 'date', email: 'email', phone: 'tel', url: 'url' } as Record<string, string>)[t] ?? 'text';

  onState(s: string) { if (s === 'closed') this.close(); }
  close() { this.ui.recordSheet.set(null); }

  save(d: Draft) {
    if (!d.rec.title.trim()) { this.invalid.set(true); return; }
    d.rec.title = d.rec.title.trim();
    d.rec.value = d.rec.value === null || (d.rec.value as unknown) === '' ? null : Number(d.rec.value);
    this.store.saveRecord(d.rec);
    toast.success(d.existing ? 'Changes saved' : d.w.recordLabel + ' created');
    this.close();
  }

  remove(d: Draft) {
    const snapshot = this.store.state();
    this.store.deleteRecord(d.rec.id);
    this.close();
    toast('Deleted "' + d.rec.title + '"', { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } });
  }

  logNote(d: Draft) {
    if (!this.noteText.trim()) return;
    this.store.addActivity(d.rec.id, this.noteType, this.noteText.trim());
    this.noteText = '';
  }

  addTask(d: Draft) {
    if (!this.taskTitle.trim()) return;
    this.store.addTask({ wsId: d.w.id, recordId: d.rec.id, title: this.taskTitle.trim(), due: this.taskDue, assigneeId: d.rec.ownerId || this.store.currentUser().id });
    this.taskTitle = ''; this.taskDue = '';
  }

  async openFile(f: FileMeta, download = false) { if (!(await this.fileStore.open(f, download))) toast.error('The file data is missing from this browser.'); }
  removeFile(f: FileMeta) {
    const snapshot = this.store.state();
    this.fileStore.remove(f.id);
    toast('Deleted ' + f.name, { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } });
  }

  stageName = (d: Draft) => stageOf(d.w, d.rec.stageId).name;
}
