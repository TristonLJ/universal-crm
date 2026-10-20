import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { Access } from '../core/access.service';
import { Workspace } from '../core/models';
import { downloadTemplate } from '../core/export';
import { DuplicateMode, ParsedFile, buildPreview, guessMapping, parseFile, targetsFor } from '../core/import';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { stageOf } from '../core/utils';

/** Three steps: choose a file, check the column mapping, review the preview and import. */
@Component({
  selector: 'app-import-sheet',
  imports: [FormsModule, NgIcon, HlmSheetImports, HlmButtonImports, HlmNativeSelectImports, HlmCheckboxImports, HlmBadgeImports],
  template: `
    <hlm-sheet side="right" [state]="open() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      @if (w(); as w) {
        <hlm-sheet-content *hlmSheetPortal="let ctx" class="w-full gap-0 data-[side=right]:sm:max-w-2xl">
          <hlm-sheet-header class="border-b">
            <h3 hlmSheetTitle>Import {{ w.recordLabelPlural.toLowerCase() }} from a file</h3>
            <p hlmSheetDescription>Step {{ step() }} of 3 &middot; {{ step() === 1 ? 'Choose a file' : step() === 2 ? 'Match the columns' : 'Check and import' }}</p>
          </hlm-sheet-header>

          <div class="flex-1 overflow-y-auto px-4 py-4">
            <!-- STEP 1 -->
            @if (step() === 1) {
              <label class="hover:bg-muted/50 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors"
                     [class.bg-muted]="dragging()" [class.border-primary]="dragging()"
                     (dragover)="$event.preventDefault(); dragging.set(true)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
                <ng-icon name="lucideUpload" class="text-muted-foreground size-8" />
                <span class="font-medium">Drop an Excel or CSV file here</span>
                <span class="text-muted-foreground text-sm">or click to browse. The first row should be the column names.</span>
                <input type="file" hidden accept=".xlsx,.csv,.txt" (change)="onPick($event)">
              </label>
              @if (error()) { <p class="text-destructive mt-3 text-sm">{{ error() }}</p> }
              @if (busy()) { <p class="text-muted-foreground mt-3 text-sm">Reading file...</p> }
              <div class="mt-6 rounded-lg border p-4 text-sm">
                <div class="mb-1 font-medium">Not sure how to lay out the file?</div>
                <p class="text-muted-foreground mb-3">Download a starter file with the right column names for this workspace, fill it in, and drop it back here.</p>
                <button hlmBtn variant="outline" size="sm" (click)="template(w)"><ng-icon name="lucideFileSpreadsheet" /> Download starter file</button>
              </div>
            }

            <!-- STEP 2 -->
            @if (step() === 2 && file(); as f) {
              <p class="text-muted-foreground mb-4 text-sm"><strong class="text-foreground">{{ f.name }}</strong> &middot; {{ f.rows.length }} rows. We matched what we could. Check each one, and pick "Don't import" for columns you don't need.</p>
              <div class="divide-y rounded-lg border">
                @for (t of targets(); track t.key) {
                  <div class="grid grid-cols-[8rem_1fr] items-center gap-3 p-3 sm:grid-cols-[9rem_1fr_1fr]">
                    <div class="text-sm font-medium">{{ t.label }}@if (t.required) { <span class="text-destructive"> *</span>}</div>
                    <hlm-native-select [ngModel]="mapping()[t.key]" (ngModelChange)="setMap(t.key, $event)" [attr.aria-label]="'Column for ' + t.label">
                      <option hlmNativeSelectOption [value]="-1">Don't import</option>
                      @for (h of f.headers; track $index) { <option hlmNativeSelectOption [value]="$index">{{ h }}</option> }
                    </hlm-native-select>
                    <div class="text-muted-foreground hidden truncate text-xs sm:block">{{ sample(f, t.key) }}</div>
                  </div>
                }
              </div>

              <div class="mt-5 space-y-3 rounded-lg border p-4 text-sm">
                <div class="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
                  <span>If a row has the same name as an existing {{ w.recordLabel.toLowerCase() }}</span>
                  <hlm-native-select [ngModel]="dupMode()" (ngModelChange)="dupMode.set($event)">
                    <option hlmNativeSelectOption value="skip">Skip it</option>
                    <option hlmNativeSelectOption value="update">Update the existing one</option>
                    <option hlmNativeSelectOption value="create">Create another anyway</option>
                  </hlm-native-select>
                </div>
                <label class="flex items-center gap-2">
                  <hlm-checkbox [checked]="createContacts()" (checkedChange)="createContacts.set($event)" />
                  Create new contacts for names that don't exist yet
                </label>
              </div>
              @if (mapping()['title'] < 0) { <p class="text-destructive mt-3 text-sm">Choose which column holds the name.</p> }
            }

            <!-- STEP 3 -->
            @if (step() === 3 && file()) {
              <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-lg border p-3"><div class="text-2xl font-semibold text-emerald-600">{{ summary().create }}</div><div class="text-muted-foreground text-xs">to create</div></div>
                <div class="rounded-lg border p-3"><div class="text-2xl font-semibold text-blue-600">{{ summary().update }}</div><div class="text-muted-foreground text-xs">to update</div></div>
                <div class="rounded-lg border p-3"><div class="text-2xl font-semibold text-amber-600">{{ summary().warn }}</div><div class="text-muted-foreground text-xs">with notes</div></div>
                <div class="rounded-lg border p-3"><div class="text-2xl font-semibold">{{ summary().skip }}</div><div class="text-muted-foreground text-xs">skipped</div></div>
              </div>
              @if (summary().contacts) { <p class="text-muted-foreground mb-3 text-sm">{{ summary().contacts }} new contact(s) will be created.</p> }
              @if (activeRules()) { <p class="text-muted-foreground mb-3 text-sm"><ng-icon name="lucideZap" class="mr-1 inline size-3.5" />{{ activeRules() }} automation rule(s) will run on these rows.</p> }

              <div class="overflow-hidden rounded-lg border">
                <table class="w-full text-sm">
                  <thead class="bg-muted/50 text-muted-foreground text-left text-xs">
                    <tr><th class="px-3 py-2">Row</th><th class="px-3 py-2">Name</th><th class="px-3 py-2">Result</th><th class="px-3 py-2">Notes</th></tr>
                  </thead>
                  <tbody>
                    @for (p of shownPreview(); track p.line) {
                      <tr class="border-t align-top">
                        <td class="text-muted-foreground px-3 py-2">{{ p.line }}</td>
                        <td class="px-3 py-2 font-medium">{{ p.title }}</td>
                        <td class="px-3 py-2">
                          @if (!p.row) { <span hlmBadge variant="outline">Skipped</span> }
                          @else if (p.row.existingId) { <span hlmBadge variant="secondary">Update</span> }
                          @else { <span hlmBadge>New</span> }
                        </td>
                        <td class="text-muted-foreground px-3 py-2 text-xs">{{ p.issues.join('; ') }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (preview().length > shownPreview().length) {
                <p class="text-muted-foreground mt-2 text-xs">Showing {{ shownPreview().length }} of {{ preview().length }} rows. Rows with notes are shown first.</p>
              }
            }
          </div>

          <hlm-sheet-footer class="border-t sm:flex-row sm:justify-between">
            @if (step() > 1) { <button hlmBtn variant="outline" (click)="step.set(step() === 3 ? 2 : 1)"><ng-icon name="lucideArrowLeft" /> Back</button> }
            @else { <button hlmBtn variant="outline" (click)="close()">Cancel</button> }

            @if (step() === 2) {
              <button hlmBtn [disabled]="mapping()['title'] < 0" (click)="step.set(3)">Preview <ng-icon name="lucideArrowRight" /></button>
            }
            @if (step() === 3) {
              <button hlmBtn [disabled]="summary().create + summary().update === 0" (click)="run(w)">
                Import {{ summary().create + summary().update }} {{ w.recordLabelPlural.toLowerCase() }}
              </button>
            }
          </hlm-sheet-footer>
        </hlm-sheet-content>
      }
    </hlm-sheet>
  `,
})
export class ImportSheet {
  private readonly store = inject(Store);
  private readonly access = inject(Access);
  private readonly ui = inject(Ui);

  readonly w = this.access.activeWorkspace;
  readonly open = signal(false);
  readonly step = signal<1 | 2 | 3>(1);
  readonly file = signal<ParsedFile | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly dragging = signal(false);
  readonly mapping = signal<Record<string, number>>({});
  readonly dupMode = signal<DuplicateMode>('skip');
  readonly createContacts = signal(true);

  readonly targets = computed(() => {
    const w = this.w();
    return w ? targetsFor(w, { money: this.access.can('viewMoney'), reassign: this.access.can('reassign') }) : [];
  });

  readonly preview = computed(() => {
    const w = this.w(), f = this.file();
    if (!w || !f) return [];
    return buildPreview(f, {
      w, targets: this.targets(), mapping: this.mapping(), users: this.store.users(), contacts: this.store.state().contacts,
      existing: this.store.state().records.filter(r => r.wsId === w.id), duplicateMode: this.dupMode(), createContacts: this.createContacts(),
    });
  });

  readonly summary = computed(() => {
    const p = this.preview();
    const ready = p.filter(x => x.row);
    return {
      create: ready.filter(x => !x.row!.existingId).length, update: ready.filter(x => x.row!.existingId).length,
      skip: p.length - ready.length, warn: ready.filter(x => x.issues.length).length,
      contacts: new Set(ready.filter(x => x.newContact).map(x => x.newContact!.toLowerCase())).size,
    };
  });

  /** Problem rows first, so people see what needs attention. */
  readonly shownPreview = computed(() =>
    [...this.preview()].sort((a, b) => (b.issues.length > 0 ? 1 : 0) - (a.issues.length > 0 ? 1 : 0)).slice(0, 15));

  readonly activeRules = computed(() => {
    const w = this.w();
    return w ? this.store.state().rules.filter(r => r.wsId === w.id && r.enabled).length : 0;
  });

  constructor() {
    effect(() => {
      const on = this.ui.importSheet();
      untracked(() => {
        if (on) {
          this.reset();
          const pre = this.ui.importPrefill();
          if (pre) {
            this.ui.importPrefill.set(null);
            this.file.set(pre);
            this.mapping.set(guessMapping(pre.headers, this.targets()));
            this.step.set(2);
          }
        }
        this.open.set(on);
      });
    });
  }

  private reset() {
    this.step.set(1); this.file.set(null); this.error.set(''); this.busy.set(false);
    this.mapping.set({}); this.dupMode.set('skip'); this.createContacts.set(true);
  }

  onState(s: string) { if (s === 'closed') this.close(); }
  close() { this.ui.importSheet.set(false); }

  onPick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.load(f);
    input.value = '';
  }
  onDrop(e: DragEvent) {
    e.preventDefault(); this.dragging.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.load(f);
  }

  private async load(f: File) {
    this.error.set(''); this.busy.set(true);
    try {
      const parsed = await parseFile(f);
      this.file.set(parsed);
      this.mapping.set(guessMapping(parsed.headers, this.targets()));
      this.step.set(2);
    } catch (err) {
      this.error.set((err as Error).message || 'Could not read that file.');
    } finally { this.busy.set(false); }
  }

  setMap(key: string, v: string | number) { this.mapping.update(m => ({ ...m, [key]: Number(v) })); }

  sample(f: ParsedFile, key: string) {
    const i = this.mapping()[key];
    if (i == null || i < 0) return '';
    return f.rows.map(r => r[i]).filter(Boolean).slice(0, 2).join(', ');
  }

  template(w: Workspace) {
    const t = this.targets();
    downloadTemplate(w, t.map(x => x.label), t.map(x => {
      if (x.kind === 'stage') return w.stages[0].name;
      if (x.kind === 'priority') return 'medium';
      if (x.kind === 'dueDate') return '2026-12-31';
      if (x.kind === 'value') return '10000';
      if (x.kind === 'owner') return this.store.users()[0]?.name ?? '';
      return x.kind === 'title' ? 'Example ' + w.recordLabel.toLowerCase() : '';
    }));
  }

  run(w: Workspace) {
    const rows = this.preview().filter(p => p.row).map(p => p.row!);
    const snapshot = this.store.state();
    const res = this.store.importRecords(w.id, rows, this.file()!.name);
    this.close();
    const parts = [res.created && res.created + ' created', res.updated && res.updated + ' updated', res.rules && res.rules + ' automation(s) ran'].filter(Boolean);
    toast.success('Import finished: ' + parts.join(', '), { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } });
  }

  stageName = (w: Workspace, id?: string) => (id ? stageOf(w, id).name : w.stages[0].name);
}
