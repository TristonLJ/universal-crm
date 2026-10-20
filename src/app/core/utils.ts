import { AppState, CrmRecord, Stage, Workspace } from './models';
import { ROLE_PRESETS } from './roles';
import { TEMPLATES } from './templates';

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const nowIso = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function makeWorkspace(tplKey: string, name?: string): Workspace {
  const t = TEMPLATES[tplKey] ?? TEMPLATES['blank'];
  return {
    id: uid(), name: name || t.name, template: tplKey,
    recordLabel: t.recordLabel, recordLabelPlural: t.recordLabelPlural,
    stages: t.stages.map(s => ({ id: uid(), ...s })),
    fields: t.fields.map(f => ({ id: uid(), options: [], ...f })),
  };
}

export function blankState(): AppState {
  const u = { id: uid(), name: 'You', roleId: 'it' };
  return {
    version: 2, settings: { currency: 'USD' }, activeWorkspaceId: null,
    users: [u], currentUserId: u.id, roles: structuredClone(ROLE_PRESETS),
    workspaces: [], contacts: [], records: [], activities: [], tasks: [], rules: [], files: [], messages: [], recipes: [],
  };
}

/** Bring old or imported data up to the current shape. */
export function migrate(obj: any): AppState {
  const s: AppState = { ...blankState(), ...obj, version: 2 };
  if (!Array.isArray(s.roles) || !s.roles.length) s.roles = structuredClone(ROLE_PRESETS);
  if (!Array.isArray(s.users) || !s.users.length) s.users = [{ id: uid(), name: 'You', roleId: 'it' }];
  if (!s.users.some(u => u.id === s.currentUserId)) s.currentUserId = s.users[0].id;
  if (!Array.isArray(s.rules)) s.rules = [];
  if (!Array.isArray(s.files)) s.files = [];
  if (!Array.isArray(s.messages)) s.messages = [];
  if (!Array.isArray(s.recipes)) s.recipes = [];
  if (!s.settings.messagesNav) {   // one-off: give existing roles the Messages screen
    s.roles.forEach(r => { if (!r.nav.includes('messages')) r.nav.splice(Math.min(1, r.nav.length), 0, 'messages'); });
    s.settings.messagesNav = true;
  }
  if (!s.settings.filesNav) {   // one-off: give existing roles the new Files screen next to List
    s.roles.forEach(r => { if (r.nav.includes('list') && !r.nav.includes('files')) r.nav.push('files'); });
    s.settings.filesNav = true;
  }
  s.tasks.forEach(t => { if (t.assigneeId === undefined) t.assigneeId = ''; });
  s.records.forEach(r => { if (r.ownerId === undefined) r.ownerId = ''; });
  return s;
}

export const stageOf = (w: Workspace, id: string): Stage =>
  w.stages.find(s => s.id === id) ?? { id: '', name: '?', color: '#999', kind: 'open' };

export const sumValues = (rs: CrmRecord[]) => rs.reduce((t, r) => t + (Number(r.value) || 0), 0);
