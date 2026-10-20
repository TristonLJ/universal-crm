import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { Access } from '../core/access.service';
import { downloadFile } from '../core/download';
import { exportXlsx } from '../core/export';
import { CrmRecord, Workspace } from '../core/models';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { stageOf, today } from '../core/utils';
import { PageHeader } from '../shared/page-header';
import { PILL, priorityClass } from '../shared/styles';

type ColKey = 'stage' | 'contact' | 'owner' | 'value' | 'dueDate' | 'priority' | 'updatedAt';
type SortKey = 'title' | ColKey;

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: 'stage', label: 'Stage' }, { key: 'contact', label: 'Contact' }, { key: 'owner', label: 'Owner' },
  { key: 'value', label: 'Value' }, { key: 'dueDate', label: 'Due' }, { key: 'priority', label: 'Priority' },
  { key: 'updatedAt', label: 'Updated' },
];
const PAGE_SIZE = 10;

@Component({
  selector: 'app-list',
  imports: [
    DatePipe, FormsModule, NgIcon, HlmButtonImports, HlmCheckboxImports, HlmDropdownMenuImports, HlmInputImports,
    HlmNativeSelectImports, HlmTableImports, PageHeader,
  ],
  template: `
    @if (data(); as d) {
      <app-page-header [title]="d.w.recordLabelPlural" [description]="d.total + ' ' + d.w.recordLabelPlural.toLowerCase() + (d.total !== d.all ? ' (filtered from ' + d.all + ')' : '')">
        @if (access.can('create')) {
          <button hlmBtn variant="outline" data-tour="import" (click)="ui.importSheet.set(true)"><ng-icon name="lucideUpload" /> Import</button>
        }
        @if (access.can('export')) {
          <button hlmBtn variant="outline" [hlmDropdownMenuTrigger]="exportMenu"><ng-icon name="lucideDownload" /> Export</button>
        }
        @if (access.can('create')) {
          <button hlmBtn (click)="ui.openRecord()"><ng-icon name="lucidePlus" /> New {{ d.w.recordLabel.toLowerCase() }}</button>
        }
      </app-page-header>

      <!-- filters -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <div class="relative">
          <ng-icon name="lucideSearch" class="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <input hlmInput type="search" class="w-56 pl-8" placeholder="Search..." [ngModel]="search()" (ngModelChange)="setSearch($event)">
        </div>
        <hlm-native-select class="w-40" [ngModel]="stage()" (ngModelChange)="stage.set($event); page.set(0)" aria-label="Stage">
          <option hlmNativeSelectOption value="">All stages</option>
          @for (s of d.w.stages; track s.id) { <option hlmNativeSelectOption [value]="s.id">{{ s.name }}</option> }
        </hlm-native-select>
        <hlm-native-select class="w-40" [ngModel]="owner()" (ngModelChange)="owner.set($event); page.set(0)" aria-label="Owner">
          <option hlmNativeSelectOption value="">Anyone</option>
          <option hlmNativeSelectOption value="none">Unassigned</option>
          @for (u of store.users(); track u.id) { <option hlmNativeSelectOption [value]="u.id">{{ u.name }}</option> }
        </hlm-native-select>
        <hlm-native-select class="w-36" [ngModel]="priority()" (ngModelChange)="priority.set($event); page.set(0)" aria-label="Priority">
          <option hlmNativeSelectOption value="">Any priority</option>
          <option hlmNativeSelectOption value="high">High</option>
          <option hlmNativeSelectOption value="medium">Medium</option>
          <option hlmNativeSelectOption value="low">Low</option>
        </hlm-native-select>
        <button hlmBtn [variant]="overdueOnly() ? 'default' : 'outline'" (click)="overdueOnly.set(!overdueOnly()); page.set(0)">Overdue</button>
        @if (filtersActive()) { <button hlmBtn variant="ghost" (click)="clearFilters()"><ng-icon name="lucideX" /> Clear</button> }
        <button hlmBtn variant="outline" class="ml-auto" [hlmDropdownMenuTrigger]="colMenu"><ng-icon name="lucideSlidersHorizontal" /> Columns</button>
      </div>

      <!-- bulk actions -->
      @if (selected().size) {
        <div class="bg-primary/5 mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
          <span class="text-sm font-medium">{{ selected().size }} selected</span>
          @if (access.can('edit')) { <button hlmBtn variant="outline" size="sm" [hlmDropdownMenuTrigger]="moveMenu">Move to...</button> }
          @if (access.can('reassign')) { <button hlmBtn variant="outline" size="sm" [hlmDropdownMenuTrigger]="assignMenu">Assign to...</button> }
          @if (access.can('delete')) { <button hlmBtn variant="destructive" size="sm" (click)="bulkDelete()"><ng-icon name="lucideTrash2" /> Delete</button> }
          <button hlmBtn variant="ghost" size="sm" class="ml-auto" (click)="selected.set(emptySet)">Clear selection</button>
        </div>
      }

      <div class="rounded-xl border">
        <div hlmTableContainer>
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh class="w-10">
                  <hlm-checkbox [checked]="allSelected(d.rows)" [indeterminate]="someSelected(d.rows)" aria-label="Select all"
                                (checkedChange)="toggleAll(d.rows, $event)" />
                </th>
                <th hlmTh class="cursor-pointer select-none" (click)="sortBy('title')">Name {{ arrow('title') }}</th>
                @for (c of shownColumns(); track c.key) {
                  <th hlmTh class="cursor-pointer select-none whitespace-nowrap" (click)="sortBy(c.key)">{{ c.label }} {{ arrow(c.key) }}</th>
                }
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (r of d.pageRows; track r.id) {
                <tr hlmTr class="cursor-pointer" [attr.data-state]="selected().has(r.id) ? 'selected' : null" (click)="ui.openRecord(r.id)">
                  <td hlmTd (click)="$event.stopPropagation()">
                    <hlm-checkbox [checked]="selected().has(r.id)" [aria-label]="'Select ' + r.title" (checkedChange)="toggle(r.id, $event)" />
                  </td>
                  <td hlmTd class="font-medium">{{ r.title }}</td>
                  @for (c of shownColumns(); track c.key) {
                    <td hlmTd class="whitespace-nowrap">
                      @switch (c.key) {
                        @case ('stage') {
                          <span class="mr-2 inline-block size-2 rounded-full" [style.background]="stageOf(d.w, r.stageId).color"></span>{{ stageOf(d.w, r.stageId).name }}
                        }
                        @case ('contact') { {{ store.contactName(r.contactId) }} }
                        @case ('owner') { {{ store.userName(r.ownerId) || '-' }} }
                        @case ('value') { {{ access.money(r.value) }} }
                        @case ('dueDate') {
                          <span [class.text-destructive]="isLate(d.w, r)" [class.font-medium]="isLate(d.w, r)">{{ r.dueDate ? (r.dueDate | date: 'd MMM y') : '' }}</span>
                        }
                        @case ('priority') { <span [class]="pill + ' ' + prio(r.priority)">{{ r.priority }}</span> }
                        @case ('updatedAt') { <span class="text-muted-foreground">{{ r.updatedAt | date: 'd MMM y' }}</span> }
                      }
                    </td>
                  }
                </tr>
              } @empty {
                <tr hlmTr><td hlmTd [attr.colspan]="shownColumns().length + 2" class="text-muted-foreground py-12 text-center">
                  No {{ d.w.recordLabelPlural.toLowerCase() }} match these filters.
                </td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="mt-3 flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Page {{ d.page + 1 }} of {{ d.pages }}</span>
        <div class="flex gap-2">
          <button hlmBtn variant="outline" size="sm" [disabled]="d.page === 0" (click)="page.set(d.page - 1)"><ng-icon name="lucideChevronLeft" /> Previous</button>
          <button hlmBtn variant="outline" size="sm" [disabled]="d.page >= d.pages - 1" (click)="page.set(d.page + 1)">Next <ng-icon name="lucideChevronRight" /></button>
        </div>
      </div>

      <ng-template #exportMenu>
        <hlm-dropdown-menu class="w-52">
          <button hlmDropdownMenuItem (click)="exportExcel(d.w, d.rows)"><ng-icon name="lucideFileSpreadsheet" /> Excel (.xlsx)</button>
          <button hlmDropdownMenuItem (click)="exportCsv(d.w, d.rows)"><ng-icon name="lucideDownload" /> CSV (.csv)</button>
        </hlm-dropdown-menu>
      </ng-template>

      <ng-template #colMenu>
        <hlm-dropdown-menu class="w-44">
          <hlm-dropdown-menu-label>Show columns</hlm-dropdown-menu-label>
          <hlm-dropdown-menu-separator />
          @for (c of availableColumns(); track c.key) {
            <button hlmDropdownMenuItem (click)="toggleColumn(c.key)">
              <span class="flex-1">{{ c.label }}</span>
              @if (visibleCols().has(c.key)) { <ng-icon name="lucideCheck" /> }
            </button>
          }
        </hlm-dropdown-menu>
      </ng-template>

      <ng-template #moveMenu>
        <hlm-dropdown-menu class="w-48">
          @for (s of d.w.stages; track s.id) { <button hlmDropdownMenuItem (click)="bulkMove(s.id)">{{ s.name }}</button> }
        </hlm-dropdown-menu>
      </ng-template>

      <ng-template #assignMenu>
        <hlm-dropdown-menu class="w-52">
          <button hlmDropdownMenuItem (click)="bulkAssign('')">Unassigned</button>
          @for (u of store.users(); track u.id) { <button hlmDropdownMenuItem (click)="bulkAssign(u.id)">{{ u.name }}</button> }
        </hlm-dropdown-menu>
      </ng-template>
    }
  `,
})
export class ListPage {
  readonly access = inject(Access);
  readonly store = inject(Store);
  readonly ui = inject(Ui);

  readonly stageOf = stageOf;
  readonly pill = PILL;
  readonly prio = priorityClass;
  readonly emptySet = new Set<string>();

  readonly search = signal('');
  readonly stage = signal('');
  readonly owner = signal('');
  readonly priority = signal('');
  readonly overdueOnly = signal(false);
  readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'updatedAt', dir: -1 });
  readonly page = signal(0);
  readonly selected = signal<Set<string>>(new Set());
  readonly visibleCols = signal<Set<ColKey>>(new Set(COLUMNS.map(c => c.key)));

  readonly availableColumns = computed(() => COLUMNS.filter(c => c.key !== 'value' || this.access.can('viewMoney')));
  readonly shownColumns = computed(() => this.availableColumns().filter(c => this.visibleCols().has(c.key)));
  readonly filtersActive = computed(() => !!(this.search() || this.stage() || this.owner() || this.priority() || this.overdueOnly()));

  readonly data = computed(() => {
    const w = this.access.activeWorkspace();
    if (!w) return null;
    const q = this.search().toLowerCase(), { key, dir } = this.sort();
    const all = this.access.recordsOf(w.id);
    const val = (r: CrmRecord): string | number => {
      switch (key) {
        case 'stage': return stageOf(w, r.stageId).name;
        case 'contact': return this.store.contactName(r.contactId);
        case 'owner': return this.store.userName(r.ownerId);
        case 'value': return r.value ?? 0;
        default: return r[key] ?? '';
      }
    };
    const rows = all
      .filter(r => (!this.stage() || r.stageId === this.stage())
        && (!this.owner() || (this.owner() === 'none' ? !r.ownerId : r.ownerId === this.owner()))
        && (!this.priority() || r.priority === this.priority())
        && (!this.overdueOnly() || this.isLate(w, r))
        && (!q || (r.title + ' ' + this.store.contactName(r.contactId) + ' ' + this.store.userName(r.ownerId) + ' ' + Object.values(r.fields).join(' ')).toLowerCase().includes(q)))
      .sort((a, b) => {
        const x = val(a), y = val(b);
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
      });
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const page = Math.min(this.page(), pages - 1);
    return { w, rows, all: all.length, total: rows.length, pages, page, pageRows: rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) };
  });

  isLate = (w: Workspace, r: CrmRecord) => !!r.dueDate && r.dueDate < today() && stageOf(w, r.stageId).kind === 'open';
  arrow = (k: SortKey) => this.sort().key === k ? (this.sort().dir > 0 ? '▲' : '▼') : '';

  setSearch(v: string) { this.search.set(v); this.page.set(0); }
  clearFilters() { this.search.set(''); this.stage.set(''); this.owner.set(''); this.priority.set(''); this.overdueOnly.set(false); this.page.set(0); }
  sortBy(key: SortKey) { this.sort.update(s => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 })); }

  toggleColumn(k: ColKey) {
    this.visibleCols.update(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  // ---- selection ----
  toggle(id: string, on: boolean) {
    this.selected.update(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  }
  toggleAll(rows: CrmRecord[], on: boolean) { this.selected.set(on ? new Set(rows.map(r => r.id)) : new Set()); }
  allSelected = (rows: CrmRecord[]) => rows.length > 0 && rows.every(r => this.selected().has(r.id));
  someSelected = (rows: CrmRecord[]) => !this.allSelected(rows) && rows.some(r => this.selected().has(r.id));

  // ---- bulk actions ----
  bulkMove(stageId: string) {
    const ids = [...this.selected()];
    const snapshot = this.store.state();
    this.store.bulkMove(ids, stageId);
    this.selected.set(new Set());
    toast('Moved ' + ids.length + ' item' + (ids.length > 1 ? 's' : ''), { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } });
  }
  bulkAssign(ownerId: string) {
    const ids = [...this.selected()];
    const snapshot = this.store.state();
    this.store.bulkAssign(ids, ownerId);
    this.selected.set(new Set());
    toast('Reassigned ' + ids.length + ' item' + (ids.length > 1 ? 's' : ''), { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } });
  }
  bulkDelete() {
    const ids = [...this.selected()];
    const snapshot = this.store.state();
    this.store.bulkDelete(ids);
    this.selected.set(new Set());
    toast('Deleted ' + ids.length + ' item' + (ids.length > 1 ? 's' : ''), { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } });
  }

  async exportExcel(w: Workspace, rows: CrmRecord[]) {
    await exportXlsx({
      w, rows, fields: this.access.visibleFields(w), includeMoney: this.access.can('viewMoney'),
      currency: this.store.state().settings.currency, userName: id => this.store.userName(id), contactName: id => this.store.contactName(id),
    });
    toast.success('Exported ' + rows.length + ' rows to Excel');
  }

  exportCsv(w: Workspace, rows: CrmRecord[]) {
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const fs = this.access.visibleFields(w), money = this.access.can('viewMoney');
    const head = ['Name', 'Stage', 'Contact', 'Owner', ...(money ? ['Value'] : []), 'Due', 'Priority', ...fs.map(f => f.label), 'Created'];
    const lines = rows.map(r => [
      r.title, stageOf(w, r.stageId).name, this.store.contactName(r.contactId), this.store.userName(r.ownerId),
      ...(money ? [r.value] : []), r.dueDate, r.priority, ...fs.map(f => r.fields[f.id] ?? ''), r.createdAt,
    ]);
    downloadFile(w.name.replace(/\W+/g, '-').toLowerCase() + '.csv', [head, ...lines].map(l => l.map(esc).join(',')).join('\n'), 'text/csv');
    toast.success('Exported ' + rows.length + ' rows');
  }
}
