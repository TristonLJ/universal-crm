import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { Access } from '../core/access.service';
import { applyRecipe } from '../core/recipes';
import { ParsedFile } from '../core/import';
import { FileStore } from '../core/files';
import { FileMeta, Recipe } from '../core/models';
import {
  Cell, DEFAULT_TIDY, colLetter, Sheet, TidyOptions, addTotals, columnTypes, emptyRow, headerOf, parseCell, show, sortRows, sortTabs,
  sheetsToFile, splitBy, tidy, writeSheets,
} from '../core/sheets';
import { Store } from '../core/store.service';
import { uid } from '../core/utils';
import { Ui } from '../core/ui.service';

const SHOW_ROWS = 300;

/** Opens a stored spreadsheet: auto-tidy, sort, edit, then save as a new version (the old one is kept). */
@Component({
  selector: 'app-workbench',
  imports: [FormsModule, DatePipe, NgIcon, HlmSheetImports, HlmButtonImports, HlmInputImports, HlmNativeSelectImports, HlmCheckboxImports],
  template: `
    <hlm-sheet side="right" [state]="file() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      @if (file(); as f) {
        <hlm-sheet-content *hlmSheetPortal="let ctx" class="w-full gap-0 data-[side=right]:w-[95vw] data-[side=right]:sm:max-w-6xl">
          <hlm-sheet-header class="border-b">
            <h3 hlmSheetTitle>{{ f.name }}</h3>
            <p hlmSheetDescription>Version {{ f.version ?? 1 }}{{ dirty() ? ' · unsaved changes' : '' }}</p>
          </hlm-sheet-header>

          @if (loading()) { <p class="text-muted-foreground p-6 text-sm">Reading the file...</p> }
          @else if (error()) { <p class="text-destructive p-6 text-sm">{{ error() }}</p> }
          @else if (sheet(); as s) {
            <div class="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <!-- tabs -->
              <div class="flex flex-wrap items-center gap-1">
                @for (t of sheets(); track $index) {
                  <button hlmBtn size="sm" [variant]="$index === active() ? 'default' : 'outline'" (click)="active.set($index)">{{ t.name }}</button>
                }
                @if (sheets().length > 1 && can()) { <button hlmBtn size="sm" variant="ghost" (click)="tabsAZ()" title="Sort the sheet tabs A to Z"><ng-icon name="lucideArrowDownAZ" /> Tabs A-Z</button> }
              </div>

              @if (can()) {
                <!-- auto tidy -->
                <div class="bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3 text-sm">
                  <button hlmBtn (click)="runTidy()"><ng-icon name="lucideWand" /> Auto-tidy</button>
                  <label class="flex items-center gap-2"><hlm-checkbox [checked]="opts.trim" (checkedChange)="opts.trim = $event === true" /> Trim spaces</label>
                  <label class="flex items-center gap-2"><hlm-checkbox [checked]="opts.convert" (checkedChange)="opts.convert = $event === true" /> Text to numbers and dates</label>
                  <label class="flex items-center gap-2"><hlm-checkbox [checked]="opts.dropBlank" (checkedChange)="opts.dropBlank = $event === true" /> Remove empty rows and columns</label>
                  <label class="flex items-center gap-2"><hlm-checkbox [checked]="opts.dedupe" (checkedChange)="opts.dedupe = $event === true" /> Remove duplicates</label>
                </div>
                @if (notes().length) {
                  <ul class="text-muted-foreground list-disc pl-6 text-sm">@for (n of notes(); track n) { <li>{{ n }}</li> }</ul>
                }

                <!-- sort and shape -->
                <div class="flex flex-wrap items-center gap-2 text-sm">
                  <label class="flex items-center gap-2"><hlm-checkbox [checked]="s.hasHeader" (checkedChange)="setHeader($event === true)" /> First row is a header</label>
                  <hlm-native-select class="w-48" [ngModel]="sortCol()" (ngModelChange)="sortCol.set(+$event)">
                    @for (h of headers(); track $index) { <option hlmNativeSelectOption [value]="$index">{{ h }}</option> }
                  </hlm-native-select>
                  <hlm-native-select class="w-40" [ngModel]="sortDir()" (ngModelChange)="sortDir.set($event)">
                    <option hlmNativeSelectOption value="asc">A to Z, 0 to 9</option>
                    <option hlmNativeSelectOption value="desc">Z to A, 9 to 0</option>
                  </hlm-native-select>
                  <button hlmBtn variant="outline" size="sm" (click)="sort()">Sort</button>
                  <button hlmBtn variant="outline" size="sm" (click)="split()" title="Make one sheet per value in the chosen column">Split by column</button>
                  <button hlmBtn variant="outline" size="sm" (click)="totals('sum')">Add totals</button>
                  <button hlmBtn variant="outline" size="sm" (click)="addRow()">Add row</button>
                  <button hlmBtn variant="outline" size="sm" (click)="addCol()">Add column</button>
                  <button hlmBtn variant="ghost" size="sm" [disabled]="!undoStack.length" (click)="undo()"><ng-icon name="lucideUndo2" /> Undo</button>
                </div>
              }

              @if (can()) {
                <!-- recipes -->
                <div class="space-y-2 rounded-lg border p-3 text-sm">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium">Recipes</span>
                    <hlm-native-select class="w-64" [ngModel]="recipeId()" (ngModelChange)="recipeId.set($event)">
                      <option hlmNativeSelectOption value="">Choose a saved recipe...</option>
                      @for (r of recipes(); track r.id) { <option hlmNativeSelectOption [value]="r.id">{{ r.name }}{{ r.match ? ' (runs on files named "' + r.match + '")' : '' }}</option> }
                    </hlm-native-select>
                    <button hlmBtn variant="outline" size="sm" [disabled]="!recipeId()" (click)="runRecipe()">Run on all sheets</button>
                    <button hlmBtn variant="ghost" size="sm" [disabled]="!recipeId()" (click)="deleteRecipe()">Delete</button>
                    <button hlmBtn variant="ghost" size="sm" (click)="showSave.set(!showSave())">Save these settings as a recipe...</button>
                  </div>
                  @if (showSave()) {
                    <div class="flex flex-wrap items-center gap-2">
                      <input hlmInput class="w-48" placeholder="Recipe name" [(ngModel)]="rName">
                      <input hlmInput class="w-64" placeholder="Run automatically on files named... (optional)" [(ngModel)]="rMatch">
                      <label class="flex items-center gap-2"><hlm-checkbox [checked]="rSort" (checkedChange)="rSort = $event === true" /> Also sort by "{{ headers()[sortCol()] }}" ({{ sortDir() === 'asc' ? 'A to Z' : 'Z to A' }})</label>
                      <hlm-native-select class="w-52" [ngModel]="rSendTo" (ngModelChange)="rSendTo = $event">
                        <option hlmNativeSelectOption value="">Don't send the result</option>
                        @for (u of otherUsers(); track u.id) { <option hlmNativeSelectOption [value]="u.id">Share result with {{ u.name }}</option> }
                      </hlm-native-select>
                      <button hlmBtn size="sm" [disabled]="!rName.trim()" (click)="saveRecipe()">Save recipe</button>
                    </div>
                    <p class="text-muted-foreground text-xs">A recipe remembers the tidy options ticked above{{ rSort ? ' and the sort' : '' }}. With a file name set, it runs by itself on every spreadsheet you add to Files whose name contains that text.</p>
                  }
                </div>

                <!-- send onwards -->
                <div class="flex flex-wrap items-center gap-2 text-sm">
                  <span class="font-medium">Send</span>
                  <button hlmBtn variant="outline" size="sm" (click)="sendToWorkspace()" [disabled]="!workspaceName()"><ng-icon name="lucideArrowRight" /> This sheet's rows into {{ workspaceName() || 'a workspace' }}</button>
                  <button hlmBtn variant="outline" size="sm" (click)="sendSheet()"><ng-icon name="lucideSend" /> This sheet to a colleague or manager...</button>
                  <span class="text-muted-foreground text-xs">Tip: split by Owner or Region first, then send each sheet to the right person.</span>
                </div>
              }

              <input hlmInput type="search" class="w-72" placeholder="Filter rows..." [ngModel]="filter()" (ngModelChange)="filter.set($event)">

              <!-- grid -->
              <div class="max-h-[55vh] overflow-auto rounded-lg border">
                <table class="w-full border-collapse text-sm">
                  <thead class="bg-muted sticky top-0 z-10">
                    <tr><th class="text-muted-foreground w-10 border-r border-b px-2 py-1 text-right text-xs font-normal">#</th>
                      @for (h of headers(); track $index) { <th class="border-r border-b px-2 py-1 text-left text-xs font-medium whitespace-nowrap">{{ colLetter($index) }} <span class="text-muted-foreground font-normal">{{ types()[$index] }}</span></th> }
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of rows(); track r.i) {
                      <tr [class.bg-muted]="s.hasHeader && r.i === 0" [class.font-semibold]="s.hasHeader && r.i === 0">
                        <td class="text-muted-foreground border-r border-b px-2 py-1 text-right text-xs">{{ r.i + 1 }}</td>
                        @for (v of r.cells; track $index) {
                          <td class="border-r border-b p-0" [class.text-right]="isNum(v)">
                            <input class="w-full min-w-24 bg-transparent px-2 py-1 outline-none focus:bg-primary/10" [value]="show(v)" [readOnly]="!can()"
                                   (change)="setCell(r.i, $index, $any($event.target).value)">
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="text-muted-foreground text-xs">
                {{ s.rows.length - (s.hasHeader ? 1 : 0) }} data rows{{ rows().length < matching() ? ', showing the first ' + rows().length : '' }}.
                Formulas in the original file are kept as their calculated values.
              </p>

              @if (versions().length) {
                <details class="rounded-lg border p-3 text-sm">
                  <summary class="cursor-pointer font-medium"><ng-icon name="lucideHistory" class="mr-1 inline" /> Version history ({{ versions().length }})</summary>
                  <ul class="mt-2 space-y-1">
                    @for (v of versions(); track v.v) {
                      <li class="flex items-center gap-2">
                        <span class="flex-1">v{{ v.v }} &middot; {{ v.at | date: 'd MMM, HH:mm' }} &middot; {{ store.userName(v.by) }} &middot; {{ v.note }}</span>
                        @if (can()) { <button hlmBtn variant="outline" size="sm" (click)="restore(v.v)">Restore</button> }
                      </li>
                    }
                  </ul>
                </details>
              }
            </div>

            <hlm-sheet-footer class="border-t sm:flex-row sm:justify-between">
              <button hlmBtn variant="outline" (click)="download()">Download</button>
              <div class="flex flex-wrap gap-2">
                <button hlmBtn variant="outline" (click)="close()">Close</button>
                @if (can()) {
                  <button hlmBtn variant="outline" (click)="saveCopy()"><ng-icon name="lucideCopy" /> Save as copy</button>
                  <button hlmBtn [disabled]="!dirty() || busy()" (click)="save()"><ng-icon name="lucideSave" /> Save new version</button>
                }
              </div>
            </hlm-sheet-footer>
          }
        </hlm-sheet-content>
      }
    </hlm-sheet>
  `,
})
export class Workbench {
  readonly store = inject(Store);
  private readonly access = inject(Access);
  private readonly files = inject(FileStore);
  private readonly ui = inject(Ui);

  readonly file = computed<FileMeta | null>(() => {
    const id = this.ui.workbench();
    return id ? this.store.state().files.find(f => f.id === id) ?? null : null;
  });
  readonly can = computed(() => this.access.can('edit'));

  readonly sheets = signal<Sheet[]>([]);
  readonly active = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly notes = signal<string[]>([]);
  readonly filter = signal('');
  readonly sortCol = signal(0);
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  opts: TidyOptions = { ...DEFAULT_TIDY };
  undoStack: Sheet[][] = [];
  private actions: string[] = [];

  readonly recipes = computed(() => this.store.state().recipes);
  readonly recipeId = signal('');
  readonly showSave = signal(false);
  rName = ''; rMatch = ''; rSort = false; rSendTo = '';
  readonly otherUsers = computed(() => this.store.users().filter(u => u.id !== this.store.currentUser().id));
  readonly workspaceName = computed(() => this.access.activeWorkspace()?.name ?? '');

  readonly sheet = computed(() => this.sheets()[this.active()]);
  readonly headers = computed(() => { const s = this.sheet(); return s ? (s.rows[0] ?? []).map((_, c) => headerOf(s, c)) : []; });
  readonly types = computed(() => { const s = this.sheet(); return s ? columnTypes(s) : []; });
  readonly versions = computed(() => [...(this.file()?.versions ?? [])].reverse());

  private readonly matches = computed(() => {
    const s = this.sheet(), q = this.filter().trim().toLowerCase();
    if (!s) return [];
    return s.rows.map((cells, i) => ({ i, cells }))
      .filter(r => (s.hasHeader && r.i === 0) || !q || r.cells.some(v => show(v).toLowerCase().includes(q)));
  });
  readonly matching = computed(() => this.matches().length);
  readonly rows = computed(() => this.matches().slice(0, SHOW_ROWS));

  show = show;
  colLetter = colLetter;
  isNum = (v: Cell) => typeof v === 'number';

  constructor() {
    effect(() => {
      const id = this.ui.workbench();
      untracked(() => { if (id) this.load(); });
    });
  }

  private async load() {
    const f = this.file();
    if (!f) return;
    this.loading.set(true); this.error.set(''); this.dirty.set(false); this.notes.set([]); this.undoStack = []; this.actions = [];
    this.filter.set(''); this.active.set(0); this.sortCol.set(0);
    try { this.sheets.set(await this.files.readStoredSheets(f)); }
    catch (e) { this.sheets.set([]); this.error.set(e instanceof Error ? e.message : 'Could not read this file.'); }
    this.loading.set(false);
  }

  // ---- editing (every change can be undone) ----
  private change(fn: (all: Sheet[]) => Sheet[], action: string) {
    this.undoStack.push(this.sheets());
    this.sheets.set(fn(this.sheets()));
    this.dirty.set(true);
    if (action && !this.actions.includes(action)) this.actions.push(action);
  }
  private onSheet(fn: (s: Sheet) => Sheet, action: string) {
    this.change(all => all.map((s, i) => i === this.active() ? fn(s) : s), action);
  }
  undo() { const p = this.undoStack.pop(); if (p) { this.sheets.set(p); this.dirty.set(this.undoStack.length > 0); if (!this.undoStack.length) this.actions = []; } }

  setCell(r: number, c: number, text: string) {
    const type = this.types()[c] ?? 'text';
    const hdr = this.sheet().hasHeader && r === 0;
    const v = hdr ? (text.trim() || null) : parseCell(text, type);
    if (show(v) === show(this.sheet().rows[r][c])) return;
    this.onSheet(s => ({ ...s, rows: s.rows.map((row, i) => i === r ? row.map((x, j) => j === c ? v : x) : row) }), 'edited cells');
  }
  setHeader(on: boolean) { this.onSheet(s => ({ ...s, hasHeader: on }), ''); }
  runTidy() {
    const res = tidy(this.sheet(), this.opts);
    this.notes.set(res.notes);
    if (res.notes[0] !== 'Nothing needed tidying.') this.onSheet(() => res.sheet, 'auto-tidied');
  }
  sort() {
    const c = this.sortCol();
    this.onSheet(s => sortRows(s, [{ col: c, desc: this.sortDir() === 'desc' }]), 'sorted by ' + (this.headers()[c] ?? 'column'));
    this.notes.set([`Sorted by ${this.headers()[c]}. Blank cells are kept at the bottom.`]);
  }
  split() {
    const c = this.sortCol(), s = this.sheet(), parts = splitBy(s, c);
    if (parts.length < 2) { toast('Every row has the same value in that column, so there is nothing to split.'); return; }
    this.change(all => [...all.filter((_, i) => i !== this.active()), ...parts], 'split by ' + this.headers()[c]);
    this.active.set(this.sheets().length - parts.length);
    this.notes.set([`Split into ${parts.length} sheets by ${this.headers()[c]}.`]);
  }
  totals(fn: 'sum' | 'average') { this.onSheet(s => addTotals(s, fn), 'added totals'); }
  addRow() { this.onSheet(s => ({ ...s, rows: [...s.rows, emptyRow(s)] }), 'added a row'); }
  addCol() { this.onSheet(s => ({ ...s, rows: s.rows.map((r, i) => [...r, s.hasHeader && i === 0 ? 'New column' : null]) }), 'added a column'); }
  tabsAZ() { this.change(all => sortTabs(all), 'sorted tabs'); this.active.set(0); }

  // ---- recipes ----
  saveRecipe() {
    const r: Recipe = {
      id: uid(), name: this.rName.trim(), match: this.rMatch.trim(), tidy: { ...this.opts },
      sortBy: this.rSort ? (this.headers()[this.sortCol()] ?? '') : '', sortDesc: this.sortDir() === 'desc', sendTo: this.rSendTo,
    };
    this.store.mutate(s => { s.recipes.push(r); });
    this.recipeId.set(r.id); this.showSave.set(false); this.rName = ''; this.rMatch = ''; this.rSendTo = '';
    toast.success('Recipe saved' + (r.match ? '. It will run on new files named "' + r.match + '".' : ''));
  }
  deleteRecipe() {
    const id = this.recipeId();
    this.store.mutate(s => { s.recipes = s.recipes.filter(r => r.id !== id); });
    this.recipeId.set('');
  }
  runRecipe() {
    const r = this.recipes().find(x => x.id === this.recipeId());
    if (!r) return;
    const res = applyRecipe(this.sheets(), r);
    this.change(() => res.sheets, 'recipe ' + r.name);
    this.notes.set([`Ran "${r.name}" on ${res.sheets.length} sheet${res.sheets.length === 1 ? '' : 's'}.`, ...res.notes]);
  }

  // ---- sending ----
  /** Hand this sheet's rows to the import screen, which matches columns and previews before anything is created. */
  sendToWorkspace() {
    const s = this.sheet();
    if (!s || s.rows.length < 2) { toast('This sheet needs a header row and at least one data row.'); return; }
    const parsed: ParsedFile = {
      name: this.file()?.name ?? s.name, headers: this.headers(),
      rows: s.rows.slice(s.hasHeader ? 1 : 0).map(r => r.map(v => show(v))),
    };
    if (this.dirty() && !confirm('Sending opens the import screen and closes the workbench, so unsaved changes here are dropped. Continue?')) return;
    this.dirty.set(false);
    this.ui.workbench.set(null);
    this.ui.importPrefill.set(parsed);
    this.ui.importSheet.set(true);
  }

  /** Save the open sheet as its own file in Files (next to the original), then open the send screen for it. */
  async sendSheet() {
    const f = this.file(), s = this.sheet();
    if (!f || !s) return;
    try {
      const base = f.name.replace(/\.[^.]+$/, '') + (this.sheets().length > 1 ? ' - ' + s.name : '') + '.xlsx';
      const blob = await writeSheets([s]);
      const res = await this.files.add([new File([blob], base, { type: blob.type })], f.recordId);
      if (res.added[0]) this.ui.sendFile.set(res.added[0].id);
    } catch { toast.error('Could not prepare the sheet.'); }
  }

  // ---- saving ----
  private async build(): Promise<{ blob: Blob; name: string; text: string }> {
    const out = await sheetsToFile(this.file()!.name, this.sheets());
    if (out.truncated) toast('CSV files hold one sheet, so only the first sheet is saved. Save as a copy to keep them all as .xlsx.');
    return { blob: out.blob, name: out.name, text: '' };
  }

  async save() {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    try {
      const { blob } = await this.build();
      await this.files.saveVersion(f.id, blob, this.actions.join(', ') || 'edited');
      this.dirty.set(false); this.undoStack = []; this.actions = [];
      toast.success('Saved as version ' + (this.file()?.version ?? ''));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save.'); }
    this.busy.set(false);
  }

  async saveCopy() {
    const f = this.file();
    if (!f) return;
    try {
      const b = await writeSheets(this.sheets());
      const name = f.name.replace(/\.[^.]+$/, '') + ' (copy).xlsx';
      await this.files.add([new File([b], name, { type: b.type })], f.recordId);
      toast.success('Saved "' + name + '" in Files');
    } catch { toast.error('Could not save the copy.'); }
  }

  async download() {
    const f = this.file();
    if (!f) return;
    const { blob, name } = await this.build();
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async restore(v: number) {
    const f = this.file();
    if (!f || (this.dirty() && !confirm('Discard your unsaved changes and restore version ' + v + '?'))) return;
    try { await this.files.restoreVersion(f.id, v); await this.load(); toast.success('Restored version ' + v + ' as the newest version'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not restore.'); }
  }

  onState(s: string) { if (s === 'closed') this.close(); }
  close() {
    if (this.dirty() && !confirm('Close without saving your changes?')) return;
    this.dirty.set(false);
    this.ui.workbench.set(null);
  }
}
