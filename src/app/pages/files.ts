import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { Access } from '../core/access.service';
import { FileStore, suggestFromFile } from '../core/files';
import { FileMeta } from '../core/models';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { FileDrop } from '../shared/file-drop';
import { fileSize } from '../shared/file-size';
import { isSheetFile } from '../core/sheets';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-files',
  imports: [FormsModule, DatePipe, NgIcon, HlmButtonImports, HlmEmptyImports, HlmInputImports, HlmNativeSelectImports, HlmTableImports, PageHeader, FileDrop],
  template: `
    <app-page-header title="Files" [description]="inbox().length + ' waiting to be filed, ' + (rows().length - inbox().length) + ' filed on records'">
      <div class="relative">
        <ng-icon name="lucideSearch" class="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
        <input hlmInput type="search" class="w-64 pl-8" placeholder="Search names and contents..." [ngModel]="search()" (ngModelChange)="search.set($event)">
      </div>
      <hlm-native-select [ngModel]="view()" (ngModelChange)="view.set($event)" class="w-40">
        <option hlmNativeSelectOption value="all">All files</option>
        <option hlmNativeSelectOption value="inbox">Inbox (unfiled)</option>
        <option hlmNativeSelectOption value="filed">Filed</option>
        <option hlmNativeSelectOption value="shared">Shared with me ({{ sharedCount() }})</option>
        <option hlmNativeSelectOption value="review">Needs my review ({{ reviewCount() }})</option>
      </hlm-native-select>
    </app-page-header>

    @if (access.can('create') || access.can('edit')) { <div class="mb-6" data-tour="file-drop"><app-file-drop /></div> }

    @if (shown().length) {
      <div class="rounded-xl border">
        <div hlmTableContainer>
          <table hlmTable>
            <thead hlmTHead><tr hlmTr><th hlmTh>File</th><th hlmTh>Filed on</th><th hlmTh>Added</th><th hlmTh class="text-right">Size</th><th hlmTh></th></tr></thead>
            <tbody hlmTBody>
              @for (f of shown(); track f.id) {
                <tr hlmTr>
                  <td hlmTd>
                    <button class="flex items-center gap-2 text-left font-medium hover:underline" (click)="open(f)">
                      <ng-icon name="lucideFileText" class="text-muted-foreground size-4 shrink-0" /> {{ f.name }}
                    </button>
                  </td>
                  <td hlmTd>
                    @if (access.can('edit')) {
                      <hlm-native-select class="w-56" [ngModel]="f.recordId" (ngModelChange)="fileTo(f, $event)">
                        <option hlmNativeSelectOption value="">Inbox (not filed)</option>
                        @for (r of recordOptions(); track r.id) { <option hlmNativeSelectOption [value]="r.id">{{ r.label }}</option> }
                      </hlm-native-select>
                    } @else { {{ recordLabel(f.recordId) || 'Inbox' }} }
                    @if (f.filedBy === 'auto') { <span class="text-muted-foreground ml-2 text-xs">auto-filed</span> }
                    @if (f.heldBy) { <div class="text-muted-foreground mt-1 text-xs">Held by {{ store.userName(f.heldBy) }}</div> }
                    @if (f.review; as rv) {
                      <div class="mt-1 text-xs">
                        <span [class]="rv.status === 'approved' ? 'text-green-600' : rv.status === 'returned' ? 'text-red-600' : 'text-amber-600'">
                          {{ rv.status === 'pending' ? 'Review requested from ' + store.userName(rv.to) : rv.status === 'approved' ? 'Approved by ' + store.userName(rv.to) : 'Returned by ' + store.userName(rv.to) }}</span>
                        @if (rv.status === 'pending' && rv.to === me()) {
                          <button hlmBtn size="sm" class="ml-2" (click)="answer(f, 'approved')">Approve</button>
                          <button hlmBtn size="sm" variant="outline" class="ml-1" (click)="answer(f, 'returned')">Return</button>
                        }
                      </div>
                    }
                  </td>
                  <td hlmTd class="text-muted-foreground">{{ f.addedAt | date: 'd MMM y' }} &middot; {{ store.userName(f.addedBy) }}</td>
                  <td hlmTd class="text-muted-foreground text-right">{{ size(f.size) }}</td>
                  <td hlmTd class="text-right whitespace-nowrap">
                    @if (isSheet(f.name)) {
                      <button hlmBtn variant="ghost" size="sm" data-tour="workbench" (click)="ui.openWorkbench(f.id)" title="Open, tidy, sort and edit this spreadsheet"><ng-icon name="lucideTable2" /> Workbench</button>
                    }
                    @if (!f.recordId && access.can('create')) {
                      <button hlmBtn variant="ghost" size="sm" (click)="makeRecord(f)" title="Create a new record pre-filled from this file"><ng-icon name="lucideWand" /> New record</button>
                    }
                    @if (access.can('edit') || access.can('comment')) {
                      <button hlmBtn variant="ghost" size="sm" (click)="ui.sendFile.set(f.id)" title="Send to a colleague or manager"><ng-icon name="lucideSend" /></button>
                    }
                    <button hlmBtn variant="ghost" size="sm" (click)="download(f)" title="Download"><ng-icon name="lucideDownload" /></button>
                    @if (access.can('delete')) { <button hlmBtn variant="ghost" size="sm" (click)="remove(f)" title="Delete"><ng-icon name="lucideTrash2" /></button> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @else {
      <div hlmEmpty><div hlmEmptyHeader>
        <div hlmEmptyTitle>No files here</div>
        <p hlmEmptyDescription>{{ search() || view() !== 'all' ? 'Try a different search or view.' : 'Drop contracts, quotes, CVs or spreadsheets above. They are filed to the right record when the name or contents match one.' }}</p>
      </div></div>
    }
  `,
})
export class FilesPage {
  readonly access = inject(Access);
  readonly store = inject(Store);
  private readonly files = inject(FileStore);
  readonly ui = inject(Ui);
  isSheet = isSheetFile;

  readonly search = signal('');
  readonly view = signal<'all' | 'inbox' | 'filed' | 'shared' | 'review'>('all');
  readonly me = computed(() => this.store.currentUser().id);
  size = fileSize;

  private readonly visibleRecords = computed(() => this.store.state().records.filter(r => this.access.recordVisible(r)));
  private readonly recById = computed(() => new Map(this.visibleRecords().map(r => [r.id, r])));

  /** Files of records this role may see, plus everything in the inbox. */
  readonly rows = computed(() => this.store.state().files
    .filter(f => !f.recordId || this.recById().has(f.recordId) || f.sharedWith?.includes(this.me()))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt)));
  readonly inbox = computed(() => this.rows().filter(f => !f.recordId));
  readonly shown = computed(() => {
    const q = this.search().toLowerCase(), v = this.view();
    return this.rows().filter(f => (v === 'all' || (v === 'shared' ? this.isShared(f) : v === 'review' ? this.needsReview(f) : (v === 'inbox') === !f.recordId))
      && (!q || (f.name + ' ' + f.text + ' ' + this.recordLabel(f.recordId)).toLowerCase().includes(q)));
  });
  readonly recordOptions = computed(() => this.visibleRecords()
    .map(r => ({ id: r.id, label: r.title + ' (' + (this.store.workspace(r.wsId)?.name ?? '') + ')' }))
    .sort((a, b) => a.label.localeCompare(b.label)));

  private isShared = (f: FileMeta) => !!f.sharedWith?.includes(this.me()) && f.addedBy !== this.me();
  private needsReview = (f: FileMeta) => f.review?.to === this.me() && f.review.status === 'pending';
  readonly sharedCount = computed(() => this.rows().filter(this.isShared).length);
  readonly reviewCount = computed(() => this.rows().filter(this.needsReview).length);
  answer(f: FileMeta, status: 'approved' | 'returned') {
    this.files.respond(f.id, status, '');
    toast.success(status === 'approved' ? 'Approved. ' + this.store.userName(f.review!.by) + ' has been told.' : 'Returned. ' + this.store.userName(f.review!.by) + ' has been told.');
  }

  recordLabel = (id: string) => this.recById().get(id)?.title ?? '';

  open(f: FileMeta) { this.ui.openFile(f); }
  async download(f: FileMeta) { if (!(await this.files.open(f, true))) toast.error('The file data is missing from this browser.'); }
  fileTo(f: FileMeta, recordId: string) {
    this.files.file(f.id, recordId);
    toast.success(recordId ? 'Filed on ' + this.recordLabel(recordId) : 'Moved to the inbox');
  }

  remove(f: FileMeta) {
    const snapshot = this.store.state();
    this.files.remove(f.id);
    toast('Deleted ' + f.name, { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } });
  }

  /** Create a record in the active workspace from what can be read in the file, then file the file on it. */
  makeRecord(f: FileMeta) {
    const w = this.access.activeWorkspace();
    if (!w) return;
    const sug = suggestFromFile(f);
    const contact = sug.email ? this.store.state().contacts.find(c => c.email.toLowerCase() === sug.email.toLowerCase()) : undefined;
    const fields: Record<string, unknown> = {};
    for (const fd of w.fields) {
      if (fd.type === 'email' && sug.email) fields[fd.id] = sug.email;
      else if (fd.type === 'phone' && sug.phone) fields[fd.id] = sug.phone;
    }
    const id = this.store.saveRecord({
      id: '', wsId: w.id, title: sug.title, stageId: w.stages[0].id, ownerId: this.store.currentUser().id,
      contactId: contact?.id ?? '', value: this.access.can('viewMoney') ? sug.value : null, dueDate: sug.dueDate,
      priority: 'medium', fields, createdAt: '', updatedAt: '', stageChangedAt: '',
    });
    this.files.file(f.id, id);
    toast.success('Created "' + sug.title + '" in ' + w.name + ' from the file');
    this.ui.openRecord(id);
  }
}
