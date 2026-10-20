import { Injectable, computed, signal } from '@angular/core';
import { ActivityType, AppState, Contact, CrmRecord, Priority, Role, Rule, Task, User, Workspace } from './models';
import { applyRules } from './rules';
import { buildMockState } from './mock-data';
import { ROLE_PRESETS } from './roles';
import { blankState, makeWorkspace, migrate, nowIso, uid } from './utils';

/** One spreadsheet row, already matched to stages, people and contacts. Undefined means "not in the file". */
export interface ImportRow {
  existingId?: string; title: string; stageId?: string; ownerId?: string;
  contactId?: string; contactNew?: string; value?: number | null; dueDate?: string; priority?: Priority;
  fields: Record<string, unknown>;
}

/** Single source of truth. State lives in one signal and is persisted to
 *  localStorage on every change (same format as the vanilla build, so JSON
 *  backups are interchangeable). */
@Injectable({ providedIn: 'root' })
export class Store {
  private readonly KEY = 'universal-crm:v2';

  readonly state = signal<AppState>(this.load());

  readonly users = computed(() => this.state().users);
  readonly roles = computed(() => this.state().roles);
  readonly workspaces = computed(() => this.state().workspaces);
  readonly currentUser = computed(() => {
    const s = this.state();
    return s.users.find(u => u.id === s.currentUserId) ?? s.users[0];
  });
  readonly currentRole = computed(() => {
    const s = this.state();
    return s.roles.find(r => r.id === this.currentUser().roleId) ?? s.roles[0];
  });

  // ---- persistence ----
  private load(): AppState {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { console.warn('Could not read saved data', e); }
    const s = buildMockState();
    this.persist(s);
    return s;
  }

  private persist(s: AppState) {
    try { localStorage.setItem(this.KEY, JSON.stringify(s)); }
    catch { alert('Could not save: browser storage is full or blocked.'); }
  }

  /** Apply a change to a copy of the state, then publish and persist it. */
  mutate(fn: (s: AppState) => void) {
    const s = structuredClone(this.state());
    fn(s);
    this.state.set(s);
    this.persist(s);
  }

  // ---- lookups ----
  userName = (id: string) => this.state().users.find(u => u.id === id)?.name ?? '';
  contactName = (id: string) => this.state().contacts.find(c => c.id === id)?.name ?? '';
  workspace = (id: string) => this.state().workspaces.find(w => w.id === id);
  roleName = (id: string) => this.state().roles.find(r => r.id === id)?.name ?? '';

  private stageName(s: AppState, wsId: string, stageId: string) {
    return s.workspaces.find(w => w.id === wsId)?.stages.find(x => x.id === stageId)?.name ?? '?';
  }

  // ---- people & roles ----
  setUser(id: string) { this.mutate(s => { s.currentUserId = id; }); }

  addUser(name: string, roleId: string) { this.mutate(s => { s.users.push({ id: uid(), name, roleId }); }); }
  updateUser(id: string, patch: Partial<User>) {
    this.mutate(s => { const u = s.users.find(x => x.id === id); if (u) Object.assign(u, patch); });
  }
  deleteUser(id: string): boolean {
    const s0 = this.state();
    if (s0.users.length < 2 || id === s0.currentUserId) return false;
    this.mutate(s => {
      s.users = s.users.filter(u => u.id !== id);
      s.records.forEach(r => { if (r.ownerId === id) r.ownerId = ''; });
      s.tasks.forEach(t => { if (t.assigneeId === id) t.assigneeId = ''; });
    });
    return true;
  }
  updateRole(id: string, fn: (r: Role) => void) {
    this.mutate(s => { const r = s.roles.find(x => x.id === id); if (r) fn(r); });
  }
  resetRoles() { this.mutate(s => { s.roles = structuredClone(ROLE_PRESETS); }); }

  // ---- workspaces ----
  setActive(id: string) { this.mutate(s => { s.activeWorkspaceId = id; }); }
  addWorkspace(tpl: string, name?: string) {
    this.mutate(s => { const w = makeWorkspace(tpl, name); s.workspaces.push(w); s.activeWorkspaceId = w.id; });
  }
  updateWorkspace(id: string, fn: (w: Workspace) => void) {
    this.mutate(s => { const w = s.workspaces.find(x => x.id === id); if (w) fn(w); });
  }
  setCurrency(code: string) { this.mutate(s => { s.settings.currency = code; }); }
  removeWorkspace(id: string) {
    this.mutate(s => {
      const recIds = new Set(s.records.filter(r => r.wsId === id).map(r => r.id));
      s.records = s.records.filter(r => r.wsId !== id);
      s.activities = s.activities.filter(a => !recIds.has(a.recordId));
      s.tasks = s.tasks.filter(t => t.wsId !== id);
      s.files = s.files.filter(f => !recIds.has(f.recordId));
      s.messages = s.messages.filter(m => !recIds.has(m.thread.slice(4)));
      s.workspaces = s.workspaces.filter(w => w.id !== id);
      s.rules = s.rules.filter(r => r.wsId !== id);
      if (!s.workspaces.length) s.workspaces.push(makeWorkspace('blank'));
      if (!s.workspaces.some(w => w.id === s.activeWorkspaceId)) s.activeWorkspaceId = s.workspaces[0].id;
    });
  }

  // ---- records ----
  saveRecord(rec: CrmRecord): string {
    let id = rec.id;
    this.mutate(s => {
      const ex = s.records.find(r => r.id === rec.id);
      if (!ex) {
        const r = { ...rec, id: uid(), createdAt: nowIso(), updatedAt: nowIso(), stageChangedAt: nowIso() };
        s.records.push(r); id = r.id;
        s.activities.push({ id: uid(), recordId: r.id, type: 'stage', text: 'Created in ' + this.stageName(s, r.wsId, r.stageId), at: nowIso() });
        applyRules(s, r, 'created');
      } else {
        const moved = ex.stageId !== rec.stageId;
        Object.assign(ex, rec, { updatedAt: nowIso(), stageChangedAt: moved ? nowIso() : ex.stageChangedAt });
        if (moved) s.activities.push({ id: uid(), recordId: ex.id, type: 'stage', text: 'Moved to ' + this.stageName(s, ex.wsId, ex.stageId), at: nowIso() });
        applyRules(s, ex, 'changed');
      }
    });
    return id;
  }

  // ---- automations ----
  saveRule(rule: Rule) {
    this.mutate(s => {
      const i = s.rules.findIndex(r => r.id === rule.id);
      if (i >= 0) s.rules[i] = rule; else s.rules.push(rule);
    });
  }
  deleteRule(id: string) { this.mutate(s => { s.rules = s.rules.filter(r => r.id !== id); }); }

  /** Apply the workspace's "changed" rules to every record it already has. Returns how many records were touched. */
  runRulesNow(wsId: string): number {
    let touched = 0;
    this.mutate(s => {
      for (const r of s.records.filter(x => x.wsId === wsId)) if (applyRules(s, r, 'changed')) touched++;
    });
    return touched;
  }

  // ---- import ----
  /** Create (or update) many records at once from a spreadsheet, creating missing contacts and running rules. */
  importRecords(wsId: string, rows: ImportRow[], source: string): { created: number; updated: number; rules: number } {
    const result = { created: 0, updated: 0, rules: 0 };
    this.mutate(s => {
      const contactId = (name?: string) => {
        if (!name) return undefined;
        const key = name.trim().toLowerCase();
        let c = s.contacts.find(x => x.name.toLowerCase() === key);
        if (!c) { c = { id: uid(), name: name.trim(), company: '', email: '', phone: '', notes: 'Created by import' }; s.contacts.push(c); }
        return c.id;
      };
      const w = s.workspaces.find(x => x.id === wsId);
      if (!w) return;
      for (const row of rows) {
        const cid = row.contactId ?? contactId(row.contactNew);
        const ex = row.existingId ? s.records.find(r => r.id === row.existingId) : undefined;
        if (ex) {
          if (row.stageId) ex.stageId = row.stageId;
          if (row.ownerId !== undefined) ex.ownerId = row.ownerId;
          if (cid) ex.contactId = cid;
          if (row.value != null) ex.value = row.value;
          if (row.dueDate) ex.dueDate = row.dueDate;
          if (row.priority) ex.priority = row.priority;
          Object.assign(ex.fields, row.fields);
          ex.updatedAt = nowIso();
          s.activities.push({ id: uid(), recordId: ex.id, type: 'note', text: 'Updated from import "' + source + '"', at: nowIso() });
          result.rules += applyRules(s, ex, 'changed');
          result.updated++;
        } else {
          const r: CrmRecord = {
            id: uid(), wsId, title: row.title, stageId: row.stageId ?? w.stages[0].id,
            ownerId: row.ownerId ?? s.currentUserId, contactId: cid ?? '', value: row.value ?? null,
            dueDate: row.dueDate ?? '', priority: row.priority ?? 'medium', fields: { ...row.fields },
            createdAt: nowIso(), updatedAt: nowIso(), stageChangedAt: nowIso(),
          };
          s.records.push(r);
          s.activities.push({ id: uid(), recordId: r.id, type: 'stage', text: 'Imported from "' + source + '" into ' + this.stageName(s, wsId, r.stageId), at: nowIso() });
          result.rules += applyRules(s, r, 'created');
          result.created++;
        }
      }
    });
    return result;
  }

  moveRecord(id: string, stageId: string) {
    this.mutate(s => {
      const r = s.records.find(x => x.id === id);
      if (!r || r.stageId === stageId) return;
      r.stageId = stageId; r.updatedAt = nowIso(); r.stageChangedAt = nowIso();
      s.activities.push({ id: uid(), recordId: id, type: 'stage', text: 'Moved to ' + this.stageName(s, r.wsId, stageId), at: nowIso() });
      applyRules(s, r, 'changed');
    });
  }

  deleteRecord(id: string) {
    this.mutate(s => {
      s.records = s.records.filter(r => r.id !== id);
      s.activities = s.activities.filter(a => a.recordId !== id);
      s.tasks = s.tasks.filter(t => t.recordId !== id);
      s.files = s.files.filter(f => f.recordId !== id);
      s.messages = s.messages.filter(m => m.thread !== 'rec:' + id);
    });
  }

  addActivity(recordId: string, type: ActivityType, text: string) {
    this.mutate(s => {
      s.activities.push({ id: uid(), recordId, type, text, at: nowIso() });
      const r = s.records.find(x => x.id === recordId);
      if (r) r.updatedAt = nowIso();
    });
  }

  // ---- contacts ----
  saveContact(c: Contact) {
    this.mutate(s => {
      const ex = s.contacts.find(x => x.id === c.id);
      if (ex) Object.assign(ex, c); else s.contacts.push({ ...c, id: uid() });
    });
  }
  deleteContact(id: string) {
    this.mutate(s => {
      s.contacts = s.contacts.filter(c => c.id !== id);
      s.records.forEach(r => { if (r.contactId === id) r.contactId = ''; });
    });
  }

  // ---- tasks ----
  addTask(t: Partial<Task> & { wsId: string; title: string }) {
    this.mutate(s => {
      s.tasks.push({ id: uid(), done: false, recordId: '', due: '', assigneeId: s.currentUserId, ...t });
    });
  }
  setTaskDone(id: string, done: boolean) { this.mutate(s => { const t = s.tasks.find(x => x.id === id); if (t) t.done = done; }); }
  deleteTask(id: string) { this.mutate(s => { s.tasks = s.tasks.filter(t => t.id !== id); }); }

  // ---- quick actions, bulk actions and undo ----
  /** Put back an earlier state (used by "Undo" toasts). */
  restore(snapshot: AppState) { this.state.set(snapshot); this.persist(snapshot); }

  quickAdd(wsId: string, stageId: string, title: string) {
    this.saveRecord({
      id: '', wsId, title, stageId, ownerId: this.currentUser().id, contactId: '', value: null,
      dueDate: '', priority: 'medium', fields: {}, createdAt: '', updatedAt: '', stageChangedAt: '',
    });
  }
  bulkMove(ids: string[], stageId: string) { ids.forEach(id => this.moveRecord(id, stageId)); }
  bulkAssign(ids: string[], ownerId: string) {
    this.mutate(s => s.records.forEach(r => { if (ids.includes(r.id)) { r.ownerId = ownerId; r.updatedAt = nowIso(); } }));
  }
  bulkDelete(ids: string[]) {
    this.mutate(s => {
      s.records = s.records.filter(r => !ids.includes(r.id));
      s.activities = s.activities.filter(a => !ids.includes(a.recordId));
      s.tasks = s.tasks.filter(t => !ids.includes(t.recordId));
      s.files = s.files.filter(f => !ids.includes(f.recordId));
      s.messages = s.messages.filter(m => !ids.some(i => m.thread === 'rec:' + i));
    });
  }

  // ---- bulk ----
  replaceAll(obj: unknown) {
    const o = obj as Partial<AppState>;
    if (!o || !Array.isArray(o.workspaces) || !o.workspaces.length) throw new Error('Not a valid CRM backup file.');
    const s = migrate(o);
    if (!s.workspaces.some(w => w.id === s.activeWorkspaceId)) s.activeWorkspaceId = s.workspaces[0].id;
    this.state.set(s); this.persist(s);
  }
  loadMock() { const s = buildMockState(); this.state.set(s); this.persist(s); }
  reset() {
    const s = blankState();
    const w = makeWorkspace('blank');
    s.workspaces.push(w); s.activeWorkspaceId = w.id;
    this.state.set(s); this.persist(s);
  }
}
