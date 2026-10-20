import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { Access } from '../core/access.service';
import { downloadFile } from '../core/download';
import { Action, FieldType, NavKey, Role, StageKind, Workspace } from '../core/models';
import { ACTION_LABELS, NAV_ITEMS } from '../core/roles';
import { Store } from '../core/store.service';
import { TEMPLATES } from '../core/templates';
import { today, uid } from '../core/utils';
import { PageHeader } from '../shared/page-header';
import { AutomationsPanel } from './automations';

const FIELD_TYPES: { v: FieldType; l: string }[] = [
  { v: 'text', l: 'Text' }, { v: 'longtext', l: 'Long text' }, { v: 'number', l: 'Number' }, { v: 'money', l: 'Money' },
  { v: 'date', l: 'Date' }, { v: 'select', l: 'Dropdown' }, { v: 'email', l: 'Email' }, { v: 'phone', l: 'Phone' }, { v: 'url', l: 'Link' },
];

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule, NgIcon, HlmButtonImports, HlmCardImports, HlmCheckboxImports, HlmInputImports, HlmLabelImports,
    HlmNativeSelectImports, HlmTabsImports, PageHeader, AutomationsPanel,
  ],
  template: `
    <app-page-header title="Settings" description="Shape workspaces, people and permissions." />

    <hlm-tabs [tab]="activeTab()" (tabActivated)="tab.set($event)">
      <hlm-tabs-list class="mb-2">
        @if (access.can('configure')) {
          <button hlmTabsTrigger="workspace">Workspace</button>
          <button hlmTabsTrigger="automations">Automations</button>
        }
        @if (access.can('admin')) {
          <button hlmTabsTrigger="people">People</button>
          <button hlmTabsTrigger="roles">Roles</button>
          <button hlmTabsTrigger="data">Data</button>
        }
      </hlm-tabs-list>
    </hlm-tabs>

    <!-- WORKSPACE -->
    @if (activeTab() === 'workspace' && access.activeWorkspace(); as w) {
      <div class="space-y-6">
        <div hlmCard>
          <div hlmCardHeader><h3 hlmCardTitle>New workspace</h3><p hlmCardDescription>One per team, branch or process. Pick a template ({{ templates.length }} to choose from); you can change everything afterwards.</p></div>
          <div hlmCardContent class="flex flex-wrap gap-2">
            <hlm-native-select class="min-w-64 flex-1" [(ngModel)]="newTpl">
              @for (t of templates; track t[0]) { <option hlmNativeSelectOption [value]="t[0]">{{ t[1].name }} - {{ t[1].description }}</option> }
            </hlm-native-select>
            <input hlmInput class="w-56" placeholder="Name (optional)" [(ngModel)]="newName">
            <button hlmBtn (click)="createWorkspace()"><ng-icon name="lucidePlus" /> Create</button>
          </div>
        </div>

        <div hlmCard>
          <div hlmCardHeader><h3 hlmCardTitle>General</h3><p hlmCardDescription>How this workspace talks about its records.</p></div>
          <div hlmCardContent class="grid gap-4 sm:grid-cols-2">
            <div class="grid gap-1.5"><label hlmLabel>Workspace name</label>
              <input hlmInput [value]="w.name" (change)="setWs(w, 'name', val($event))"></div>
            <div class="grid gap-1.5"><label hlmLabel>Currency (ISO code)</label>
              <input hlmInput maxlength="3" [value]="store.state().settings.currency" (change)="setCurrency(val($event))"></div>
            <div class="grid gap-1.5"><label hlmLabel>One record is a...</label>
              <input hlmInput [value]="w.recordLabel" (change)="setWs(w, 'recordLabel', val($event))"></div>
            <div class="grid gap-1.5"><label hlmLabel>Many records are...</label>
              <input hlmInput [value]="w.recordLabelPlural" (change)="setWs(w, 'recordLabelPlural', val($event))"></div>
          </div>
        </div>

        <div hlmCard>
          <div hlmCardHeader><h3 hlmCardTitle>Pipeline stages</h3><p hlmCardDescription>The steps a record moves through. Mark which ones mean won or lost for the stats.</p></div>
          <div hlmCardContent class="space-y-2">
            @for (s of w.stages; track s.id; let i = $index) {
              <div class="flex flex-wrap items-center gap-2">
                <input type="color" class="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1" [value]="s.color"
                       (change)="setStage(w, i, 'color', val($event))" aria-label="Colour">
                <input hlmInput class="min-w-40 flex-1" [value]="s.name" (change)="setStage(w, i, 'name', val($event))" aria-label="Stage name">
                <hlm-native-select class="w-44" [ngModel]="s.kind" (ngModelChange)="setStage(w, i, 'kind', $event)" aria-label="Stage type">
                  <option hlmNativeSelectOption value="open">In progress</option>
                  <option hlmNativeSelectOption value="won">Won / success</option>
                  <option hlmNativeSelectOption value="lost">Lost / closed</option>
                </hlm-native-select>
                <button hlmBtn variant="outline" size="icon" [disabled]="i === 0" (click)="moveStage(w, i, -1)" aria-label="Move up">↑</button>
                <button hlmBtn variant="outline" size="icon" [disabled]="i === w.stages.length - 1" (click)="moveStage(w, i, 1)" aria-label="Move down">↓</button>
                <button hlmBtn variant="ghost" size="icon" (click)="deleteStage(w, i)" aria-label="Delete stage"><ng-icon name="lucideTrash2" /></button>
              </div>
            }
            <button hlmBtn variant="outline" (click)="addStage(w)"><ng-icon name="lucidePlus" /> Add stage</button>
          </div>
        </div>

        <div hlmCard>
          <div hlmCardHeader><h3 hlmCardTitle>Custom fields</h3><p hlmCardDescription>Extra details to capture on every record.</p></div>
          <div hlmCardContent class="space-y-2">
            @for (f of w.fields; track f.id; let i = $index) {
              <div class="flex flex-wrap items-center gap-2">
                <input hlmInput class="min-w-40 flex-1" [value]="f.label" (change)="setField(w, i, 'label', val($event))" aria-label="Field label">
                <hlm-native-select class="w-40" [ngModel]="f.type" (ngModelChange)="setField(w, i, 'type', $event)" aria-label="Field type">
                  @for (t of fieldTypes; track t.v) { <option hlmNativeSelectOption [value]="t.v">{{ t.l }}</option> }
                </hlm-native-select>
                @if (f.type === 'select') {
                  <input hlmInput class="min-w-40 flex-1" placeholder="Option 1, Option 2" [value]="f.options.join(', ')" (change)="setField(w, i, 'options', val($event))" aria-label="Options">
                }
                <button hlmBtn variant="ghost" size="icon" (click)="deleteField(w, i)" aria-label="Delete field"><ng-icon name="lucideTrash2" /></button>
              </div>
            } @empty { <p class="text-muted-foreground text-sm">No custom fields yet.</p> }
            <button hlmBtn variant="outline" (click)="addField(w)"><ng-icon name="lucidePlus" /> Add field</button>
          </div>
        </div>
      </div>
    }

    <!-- AUTOMATIONS -->
    @if (activeTab() === 'automations') { <app-automations /> }

    <!-- PEOPLE -->
    @if (activeTab() === 'people') {
      <div hlmCard class="mt-4">
        <div hlmCardHeader><h3 hlmCardTitle>People</h3><p hlmCardDescription>Everyone here appears in the "Viewing as" menu and the Owner dropdown.</p></div>
        <div hlmCardContent class="space-y-2">
          @for (u of store.users(); track u.id) {
            <div class="flex flex-wrap items-center gap-2">
              <input hlmInput class="min-w-40 flex-1" [value]="u.name" (change)="store.updateUser(u.id, { name: val($event) || u.name })" aria-label="Name">
              <hlm-native-select class="w-52" [ngModel]="u.roleId" (ngModelChange)="store.updateUser(u.id, { roleId: $event })" aria-label="Role">
                @for (r of store.roles(); track r.id) { <option hlmNativeSelectOption [value]="r.id">{{ r.name }}</option> }
              </hlm-native-select>
              <button hlmBtn variant="ghost" size="icon" (click)="deleteUser(u.id)" aria-label="Delete person"><ng-icon name="lucideTrash2" /></button>
            </div>
          }
          <button hlmBtn variant="outline" (click)="addUser()"><ng-icon name="lucidePlus" /> Add person</button>
        </div>
      </div>
    }

    <!-- ROLES -->
    @if (activeTab() === 'roles') {
      <div hlmCard class="mt-4">
        <div hlmCardHeader><h3 hlmCardTitle>Roles and permissions</h3>
          <p hlmCardDescription>Choose which screens, workspaces and actions each role gets. This changes the interface only; it is not security.</p></div>
        <div hlmCardContent class="space-y-3">
          @for (r of store.roles(); track r.id) {
            <details class="rounded-lg border p-4" [open]="openRole() === r.id" (toggle)="onToggle(r.id, $event)">
              <summary class="cursor-pointer font-medium">{{ r.name }}
                <span class="text-muted-foreground ml-2 text-xs font-normal">{{ r.nav.length }} screens · {{ r.actions.length }} permissions · {{ r.recordScope === 'own' ? 'own records' : 'all records' }}</span>
              </summary>
              <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <div class="grid gap-1.5"><label hlmLabel>Role name</label>
                  <input hlmInput [value]="r.name" (change)="setRole(r, 'name', val($event))"></div>
                <div class="grid gap-1.5"><label hlmLabel>Landing screen</label>
                  <hlm-native-select [ngModel]="r.home" (ngModelChange)="setRole(r, 'home', $event)">
                    @for (n of navItems; track n.key) { @if (r.nav.includes(n.key)) { <option hlmNativeSelectOption [value]="n.key">{{ n.label }}</option> } }
                  </hlm-native-select></div>
                <div class="grid gap-1.5"><label hlmLabel>Records visible</label>
                  <hlm-native-select [ngModel]="r.recordScope" (ngModelChange)="setRole(r, 'recordScope', $event)">
                    <option hlmNativeSelectOption value="all">All records</option>
                    <option hlmNativeSelectOption value="own">Only records they own</option>
                  </hlm-native-select></div>
                <div class="grid gap-1.5"><label hlmLabel>Workspaces</label>
                  <hlm-native-select [ngModel]="r.workspaceTemplates ? 'limited' : 'all'" (ngModelChange)="setRole(r, 'workspaces', $event)">
                    <option hlmNativeSelectOption value="all">All workspaces</option>
                    <option hlmNativeSelectOption value="limited">Only these types</option>
                  </hlm-native-select></div>
              </div>

              @if (r.workspaceTemplates; as tpls) {
                <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                  @for (t of templates; track t[0]) {
                    <label class="flex items-center gap-2 text-sm"><hlm-checkbox [checked]="tpls.includes(t[0])" (checkedChange)="toggleRole(r, 'tpl', t[0], $event)" /> {{ t[1].name }}</label>
                  }
                </div>
              }

              <h4 class="text-muted-foreground mt-5 mb-2 text-xs font-semibold tracking-wide uppercase">Screens</h4>
              <div class="flex flex-wrap gap-x-5 gap-y-2">
                @for (n of navItems; track n.key) {
                  <label class="flex items-center gap-2 text-sm"><hlm-checkbox [checked]="r.nav.includes(n.key)" (checkedChange)="toggleRole(r, 'nav', n.key, $event)" /> {{ n.label }}</label>
                }
              </div>

              <h4 class="text-muted-foreground mt-5 mb-2 text-xs font-semibold tracking-wide uppercase">Can do</h4>
              <div class="flex flex-wrap gap-x-5 gap-y-2">
                @for (a of actions; track a[0]) {
                  <label class="flex items-center gap-2 text-sm"><hlm-checkbox [checked]="r.actions.includes(a[0])" (checkedChange)="toggleRole(r, 'action', a[0], $event)" /> {{ a[1] }}</label>
                }
              </div>
            </details>
          }
          <button hlmBtn variant="outline" (click)="resetRoles()">Reset roles to defaults</button>
        </div>
      </div>
    }

    <!-- DATA -->
    @if (activeTab() === 'data') {
      <div class="mt-4 space-y-6">
        <div hlmCard>
          <div hlmCardHeader><h3 hlmCardTitle>Backup and demo data</h3><p hlmCardDescription>Data lives in this browser. Export regularly.</p></div>
          <div hlmCardContent class="flex flex-wrap gap-2">
            <button hlmBtn variant="outline" (click)="exportAll()"><ng-icon name="lucideDownload" /> Export everything (JSON)</button>
            <button hlmBtn variant="outline" (click)="file.click()">Import backup</button>
            <input #file type="file" accept="application/json" hidden (change)="importFile($event)">
            <button hlmBtn variant="outline" (click)="loadMock()">Load mock company data</button>
          </div>
        </div>

        <div hlmCard class="border-destructive/40">
          <div hlmCardHeader><h3 hlmCardTitle class="text-destructive">Danger zone</h3></div>
          <div hlmCardContent class="flex flex-wrap gap-2">
            <button hlmBtn variant="destructive" (click)="deleteWorkspace()">Delete this workspace</button>
            <button hlmBtn variant="destructive" (click)="eraseAll()">Erase everything</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class SettingsPage {
  readonly store = inject(Store);
  readonly access = inject(Access);
  private readonly router = inject(Router);

  readonly fieldTypes = FIELD_TYPES;
  readonly navItems = NAV_ITEMS;
  readonly templates = Object.entries(TEMPLATES);
  readonly actions = Object.entries(ACTION_LABELS) as [Action, string][];

  readonly tab = signal('');
  readonly openRole = signal<string | null>(null);
  newTpl = 'sales';
  newName = '';

  /** The chosen tab, falling back to the first one this role is allowed to see. */
  readonly activeTab = computed(() => {
    const allowed = [...(this.access.can('configure') ? ['workspace', 'automations'] : []), ...(this.access.can('admin') ? ['people', 'roles', 'data'] : [])];
    return allowed.includes(this.tab()) ? this.tab() : allowed[0] ?? 'workspace';
  });

  val = (e: Event) => (e.target as HTMLInputElement).value.trim();
  private toggle<T>(arr: T[], v: T, on: boolean) { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i >= 0) arr.splice(i, 1); }

  onToggle(id: string, e: Event) {
    if ((e.target as HTMLDetailsElement).open) this.openRole.set(id);
    else if (this.openRole() === id) this.openRole.set(null);
  }

  // ---- workspace structure ----
  setWs(w: Workspace, key: 'name' | 'recordLabel' | 'recordLabelPlural', v: string) {
    if (v) this.store.updateWorkspace(w.id, x => { x[key] = v; });
  }

  setCurrency(raw: string) {
    const c = raw.toUpperCase();
    try { new Intl.NumberFormat(undefined, { style: 'currency', currency: c }); this.store.setCurrency(c); }
    catch { toast.error('Unknown currency code.'); }
  }

  setStage(w: Workspace, i: number, key: 'name' | 'color' | 'kind', v: string) {
    if (!v) return;
    this.store.updateWorkspace(w.id, x => { if (key === 'kind') x.stages[i].kind = v as StageKind; else x.stages[i][key] = v; });
  }
  addStage(w: Workspace) { this.store.updateWorkspace(w.id, x => { x.stages.push({ id: uid(), name: 'New stage', color: '#64748b', kind: 'open' }); }); }
  moveStage(w: Workspace, i: number, d: -1 | 1) { this.store.updateWorkspace(w.id, x => { x.stages.splice(i + d, 0, x.stages.splice(i, 1)[0]); }); }
  deleteStage(w: Workspace, i: number) {
    const s = w.stages[i];
    if (w.stages.length < 2) return void toast.error('A workspace needs at least one stage.');
    if (this.store.state().records.some(r => r.wsId === w.id && r.stageId === s.id)) {
      return void toast.error('Move the records out of "' + s.name + '" before deleting it.');
    }
    this.store.updateWorkspace(w.id, x => { x.stages.splice(i, 1); });
  }

  setField(w: Workspace, i: number, key: 'label' | 'type' | 'options', v: string) {
    this.store.updateWorkspace(w.id, x => {
      const f = x.fields[i];
      if (key === 'options') f.options = v.split(',').map(o => o.trim()).filter(Boolean);
      else if (key === 'type') f.type = v as FieldType;
      else if (v) f.label = v;
    });
  }
  addField(w: Workspace) { this.store.updateWorkspace(w.id, x => { x.fields.push({ id: uid(), label: 'New field', type: 'text', options: [] }); }); }
  deleteField(w: Workspace, i: number) {
    if (confirm('Delete field "' + w.fields[i].label + '"? Its values are kept in backups but hidden.')) {
      this.store.updateWorkspace(w.id, x => { x.fields.splice(i, 1); });
    }
  }

  createWorkspace() {
    this.store.addWorkspace(this.newTpl, this.newName.trim());
    this.newName = '';
    toast.success('Workspace created');
    this.router.navigate(['/board']);
  }

  // ---- people & roles ----
  addUser() { const rs = this.store.roles(); this.store.addUser('New person', rs[rs.length - 1].id); }
  deleteUser(id: string) {
    if (!this.store.deleteUser(id)) toast.error("You can't delete the person you are viewing as, or the last person.");
  }

  setRole(r: Role, key: 'name' | 'home' | 'recordScope' | 'workspaces', v: string) {
    this.store.updateRole(r.id, x => {
      if (key === 'name') { if (v) x.name = v; }
      else if (key === 'home') x.home = v as NavKey;
      else if (key === 'recordScope') x.recordScope = v === 'own' ? 'own' : 'all';
      else x.workspaceTemplates = v === 'all' ? null : (x.workspaceTemplates ?? []);
    });
  }

  toggleRole(r: Role, kind: 'tpl' | 'nav' | 'action', value: string, on: boolean) {
    this.store.updateRole(r.id, x => {
      if (kind === 'tpl') this.toggle(x.workspaceTemplates ?? (x.workspaceTemplates = []), value, on);
      else if (kind === 'action') this.toggle(x.actions, value as Action, on);
      else {
        this.toggle(x.nav, value as NavKey, on);
        if (!x.nav.includes(x.home)) x.home = x.nav[0] ?? 'dashboard';
      }
    });
  }

  resetRoles() { if (confirm('Reset all roles to the defaults?')) { this.store.resetRoles(); toast.success('Roles reset'); } }

  // ---- data ----
  exportAll() {
    downloadFile('crm-backup-' + today() + '.json', JSON.stringify(this.store.state(), null, 2), 'application/json');
    toast.success('Backup downloaded');
  }

  async importFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (confirm('Replace ALL current data with this backup?')) { this.store.replaceAll(data); toast.success('Backup restored'); this.router.navigate(['/', this.access.home()]); }
    } catch (err) { toast.error('Import failed: ' + (err as Error).message); }
    input.value = '';
  }

  loadMock() {
    if (confirm('Replace ALL data with the mock company (6 people, 5 workspaces)?')) {
      this.store.loadMock();
      this.router.navigate(['/', this.access.home()]);
    }
  }

  deleteWorkspace() {
    const w = this.access.activeWorkspace();
    if (!w) return;
    const last = this.store.workspaces().length < 2;
    const msg = last ? 'This is the last workspace; it will be replaced by an empty one. Continue?' : 'Delete workspace "' + w.name + '" and all its records?';
    if (confirm(msg)) this.store.removeWorkspace(w.id);
  }

  eraseAll() {
    if (confirm('Erase ALL data in this browser?')) { this.store.reset(); this.router.navigate(['/', this.access.home()]); }
  }
}
