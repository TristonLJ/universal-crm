import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';
import { Contact, CrmRecord, FieldType, Priority, User, Workspace } from './models';
import type { ImportRow } from './store.service';

export interface ParsedFile { name: string; headers: string[]; rows: string[][]; }

const MAX_ROWS = 5000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cell = (v: unknown): string => v == null ? '' : v instanceof Date ? iso(v) : String(v).trim();

/** Read an .xlsx or .csv file into a header row plus data rows (all values as text). */
export async function parseFile(file: File): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  let raw: unknown[][];
  if (lower.endsWith('.xlsx')) {
    const sheets = await readXlsxFile(file);     // one entry per worksheet; we use the first
    raw = (sheets[0]?.data ?? []) as unknown as unknown[][];
  } else if (lower.endsWith('.csv') || lower.endsWith('.txt') || file.type === 'text/csv') {
    const res = Papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' });
    raw = res.data;
  } else {
    throw new Error('Please choose an Excel (.xlsx) or CSV (.csv) file. Older .xls files: open them in Excel and save as .xlsx first.');
  }
  const rows = raw.map(r => r.map(cell)).filter(r => r.some(c => c !== ''));
  if (rows.length < 2) throw new Error('The file needs a header row and at least one data row.');
  if (rows.length - 1 > MAX_ROWS) throw new Error('That file has more than ' + MAX_ROWS + ' rows. Split it into smaller files.');
  const headers = rows[0].map((h, i) => h || 'Column ' + (i + 1));
  return { name: file.name, headers, rows: rows.slice(1) };
}

// ---------- targets & mapping ----------
export type TargetKind = 'title' | 'stage' | 'owner' | 'contact' | 'value' | 'dueDate' | 'priority' | 'custom';
export interface ImportTarget { key: string; label: string; kind: TargetKind; required?: boolean; fieldId?: string; fieldType?: FieldType; aliases: string[]; }

/** Everything a workspace can receive from a file, limited to what the current role may set. */
export function targetsFor(w: Workspace, can: { money: boolean; reassign: boolean }): ImportTarget[] {
  const t: ImportTarget[] = [
    { key: 'title', label: 'Name', kind: 'title', required: true, aliases: ['name', 'title', w.recordLabel, 'client', 'customer', 'candidate', 'full name', 'subject', 'company'] },
    { key: 'stage', label: 'Stage', kind: 'stage', aliases: ['stage', 'status', 'step', 'phase', 'pipeline'] },
    { key: 'contact', label: 'Contact', kind: 'contact', aliases: ['contact', 'contact name', 'person', 'customer name', 'client name'] },
    { key: 'dueDate', label: 'Due date', kind: 'dueDate', aliases: ['due', 'due date', 'deadline', 'date', 'follow up', 'follow-up'] },
    { key: 'priority', label: 'Priority', kind: 'priority', aliases: ['priority', 'urgency', 'importance'] },
  ];
  if (can.reassign) t.splice(2, 0, { key: 'owner', label: 'Owner', kind: 'owner', aliases: ['owner', 'assigned', 'assigned to', 'assignee', 'agent', 'salesperson', 'rep', 'responsible'] });
  if (can.money) t.push({ key: 'value', label: 'Value', kind: 'value', aliases: ['value', 'amount', 'price', 'total', 'revenue', 'budget', 'worth'] });
  for (const f of w.fields) {
    if (f.type === 'money' && !can.money) continue;
    t.push({ key: 'f:' + f.id, label: f.label, kind: 'custom', fieldId: f.id, fieldType: f.type, aliases: [f.label] });
  }
  return t;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** For each target, the index of the file column that probably matches (or -1). Each column is used once. */
export function guessMapping(headers: string[], targets: ImportTarget[]): Record<string, number> {
  const H = headers.map(norm), used = new Set<number>(), out: Record<string, number> = {};
  for (const exact of [true, false]) {
    for (const t of targets) {
      if (out[t.key] !== undefined && out[t.key] >= 0) continue;
      const names = [t.label, ...t.aliases].map(norm);
      const i = H.findIndex((h, idx) => !used.has(idx) && h !== '' && names.some(n => exact ? h === n : (h.includes(n) || n.includes(h))));
      if (i >= 0) { out[t.key] = i; used.add(i); } else if (out[t.key] === undefined) out[t.key] = -1;
    }
  }
  return out;
}

// ---------- value normalisers ----------
export function toDate(s: string): string | null {
  const v = s.trim();
  if (!v) return '';
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(v);   // day first (South Africa, UK, most of the world)
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  const t = Date.parse(v);
  return isNaN(t) ? null : iso(new Date(t));
}
function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? iso(dt) : null;
}

export function toNumber(s: string): number | null {
  let v = s.replace(/[^\d.,-]/g, '');
  if (!v || v === '-') return null;
  if (v.includes(',') && !v.includes('.') && /,\d{1,2}$/.test(v)) v = v.replace(',', '.');   // 1234,50 -> 1234.50
  else v = v.replace(/,/g, '');
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function toPriority(s: string): Priority | null {
  const v = s.trim().toLowerCase();
  if (['h', 'high', 'urgent', 'critical', '1'].includes(v)) return 'high';
  if (['m', 'med', 'medium', 'normal', '2'].includes(v)) return 'medium';
  if (['l', 'low', 'minor', '3'].includes(v)) return 'low';
  return null;
}

// ---------- preview ----------
export interface PreviewRow {
  line: number; title: string; row: ImportRow | null; issues: string[];
  duplicateOf?: string; newContact?: string;
}
export type DuplicateMode = 'skip' | 'update' | 'create';

export interface BuildContext {
  w: Workspace; targets: ImportTarget[]; mapping: Record<string, number>;
  users: User[]; contacts: Contact[]; existing: CrmRecord[]; duplicateMode: DuplicateMode; createContacts: boolean;
}

/** Turn file rows into import rows, noting anything that needed a guess, a default, or can't be used. */
export function buildPreview(file: ParsedFile, ctx: BuildContext): PreviewRow[] {
  const { w, targets, mapping } = ctx;
  const get = (cells: string[], key: string) => { const i = mapping[key]; return i >= 0 && i != null ? (cells[i] ?? '').trim() : ''; };
  const seen = new Map<string, string>();
  for (const r of ctx.existing) seen.set(r.title.trim().toLowerCase(), r.id);
  const out: PreviewRow[] = [];

  file.rows.forEach((cells, idx) => {
    const issues: string[] = [];
    const title = get(cells, 'title');
    const line = idx + 2;
    if (!title) { out.push({ line, title: '(no name)', row: null, issues: ['No name - row skipped'] }); return; }

    const row: ImportRow = { title, fields: {} };
    let newContact: string | undefined;

    for (const t of targets) {
      const raw = get(cells, t.key);
      if (!raw || t.kind === 'title') continue;
      switch (t.kind) {
        case 'stage': {
          const st = w.stages.find(s => norm(s.name) === norm(raw)) ?? w.stages.find(s => norm(s.name).includes(norm(raw)) || norm(raw).includes(norm(s.name)));
          if (st) row.stageId = st.id; else issues.push('Unknown stage "' + raw + '" - will use ' + w.stages[0].name);
          break;
        }
        case 'owner': {
          const n = norm(raw);
          const u = ctx.users.find(x => norm(x.name) === n) ?? ctx.users.find(x => norm(x.name).includes(n) || n.includes(norm(x.name.split(' ')[0])));
          if (u) row.ownerId = u.id; else { row.ownerId = ''; issues.push('Unknown owner "' + raw + '" - left unassigned'); }
          break;
        }
        case 'contact': {
          const n = norm(raw);
          const c = ctx.contacts.find(x => norm(x.name) === n) ?? ctx.contacts.find(x => x.company && norm(x.company) === n);
          if (c) row.contactId = c.id;
          else if (ctx.createContacts) { row.contactNew = raw; newContact = raw; }
          else issues.push('Unknown contact "' + raw + '" - not linked');
          break;
        }
        case 'value': {
          const n = toNumber(raw);
          if (n == null) issues.push('Value "' + raw + '" is not a number - ignored'); else row.value = n;
          break;
        }
        case 'dueDate': {
          const d = toDate(raw);
          if (d == null) issues.push('Date "' + raw + '" not understood - ignored'); else if (d) row.dueDate = d;
          break;
        }
        case 'priority': {
          const p = toPriority(raw);
          if (p) row.priority = p; else issues.push('Priority "' + raw + '" not understood - using medium');
          break;
        }
        case 'custom': {
          const ft = t.fieldType;
          const f = w.fields.find(x => x.id === t.fieldId)!;
          if (ft === 'number' || ft === 'money') {
            const n = toNumber(raw);
            if (n == null) issues.push(t.label + ' "' + raw + '" is not a number - ignored'); else row.fields[f.id] = n;
          } else if (ft === 'date') {
            const d = toDate(raw);
            if (d == null) issues.push(t.label + ' date not understood - ignored'); else row.fields[f.id] = d;
          } else if (ft === 'select') {
            const opt = f.options.find(o => norm(o) === norm(raw));
            if (opt) row.fields[f.id] = opt; else { row.fields[f.id] = raw; issues.push(t.label + ' "' + raw + '" is not in the list - kept as typed'); }
          } else row.fields[f.id] = raw;
          break;
        }
      }
    }

    const key = title.toLowerCase();
    const dupId = seen.get(key);
    if (dupId) {
      if (ctx.duplicateMode === 'skip') { out.push({ line, title, row: null, issues: [...issues, 'Already exists - skipped'], duplicateOf: dupId }); return; }
      if (ctx.duplicateMode === 'update') row.existingId = dupId;
    } else seen.set(key, 'file-row-' + line);

    out.push({ line, title, row, issues, duplicateOf: dupId, newContact });
  });
  return out;
}
