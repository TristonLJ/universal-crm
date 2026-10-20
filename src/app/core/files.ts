import { Injectable, inject } from '@angular/core';
import readXlsxFile from 'read-excel-file/browser';
import { Access } from './access.service';
import { toDate, toNumber } from './import';
import { CrmRecord, FileMeta, Recipe, SendMode } from './models';
import { dmThread } from './messages';
import { applyRecipe, recipeMatches } from './recipes';
import { Sheet, isSheetFile, readSheets, sheetsToFile } from './sheets';
import { Store } from './store.service';
import { nowIso, uid } from './utils';

const DB = 'universal-crm-files';
const TEXT_CAP = 20000;
export const MAX_FILE_MB = 25;

/** Bytes live in IndexedDB (localStorage is far too small); the list of files lives in the app state. */
@Injectable({ providedIn: 'root' })
export class FileStore {
  private readonly store = inject(Store);
  private readonly access = inject(Access);
  private dbp?: Promise<IDBDatabase>;

  private db(): Promise<IDBDatabase> {
    return this.dbp ??= new Promise((res, rej) => {
      const q = indexedDB.open(DB, 1);
      q.onupgradeneeded = () => q.result.createObjectStore('blobs');
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise((res, rej) => {
      const r = fn(db.transaction('blobs', mode).objectStore('blobs'));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async getBlob(id: string): Promise<Blob | undefined> { return this.tx('readonly', s => s.get(id)); }
  private putBlob(id: string, b: Blob) { return this.tx('readwrite', s => s.put(b, id)); }
  private delBlob(id: string) { return this.tx('readwrite', s => s.delete(id)); }

  /** Add files. With no target record, each file is filed automatically when its name or text matches one record. */
  async add(files: File[], recordId = ''): Promise<{ added: FileMeta[]; auto: number; rejected: string[]; recipesRun: number }> {
    const added: FileMeta[] = [], rejected: string[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) { rejected.push(f.name + ' (over ' + MAX_FILE_MB + ' MB)'); continue; }
      const text = await extractText(f).catch(() => '');
      const meta: FileMeta = {
        id: uid(), recordId, name: f.name, mime: f.type || '', size: f.size, addedAt: nowIso(),
        addedBy: this.store.currentUser().id, text, filedBy: recordId ? 'manual' : '',
      };
      if (!recordId) {
        const hit = this.match(meta);
        if (hit) { meta.recordId = hit.id; meta.filedBy = 'auto'; }
      }
      await this.putBlob(meta.id, f);
      added.push(meta);
    }
    if (added.length) this.store.mutate(s => {
      s.files.push(...added);
      for (const m of added) if (m.recordId) s.activities.push({ id: uid(), recordId: m.recordId, type: 'note', text: (m.filedBy === 'auto' ? 'File filed automatically: ' : 'File attached: ') + m.name, at: nowIso() });
    });
    // Recipes that match by file name run now, so a dropped spreadsheet arrives already sorted.
    let recipesRun = 0;
    for (const m of added) {
      if (!isSheetFile(m.name)) continue;
      for (const r of this.store.state().recipes.filter(x => recipeMatches(x, m.name))) {
        if (await this.runRecipe(m.id, r).then(() => true, () => false)) recipesRun++;
      }
    }
    return { added, auto: added.filter(m => m.filedBy === 'auto').length, rejected, recipesRun };
  }

  /** Move a file to a record (or '' to unfile it). */
  file(id: string, recordId: string) {
    this.store.mutate(s => {
      const f = s.files.find(x => x.id === id);
      if (!f) return;
      f.recordId = recordId; f.filedBy = recordId ? 'manual' : '';
      if (recordId) s.activities.push({ id: uid(), recordId, type: 'note', text: 'File attached: ' + f.name, at: nowIso() });
    });
  }

  async remove(id: string) {
    this.store.mutate(s => { s.files = s.files.filter(f => f.id !== id); });
    // The blob stays until cleanup() so that "Undo" on a delete can bring the file back.
  }

  /** Delete stored bytes that no file refers to any more. Called once on start-up. */
  async cleanup() {
    try {
      const keys = await this.tx('readonly', s => s.getAllKeys());
      const live = new Set(this.store.state().files.map(f => f.id));
      for (const k of keys) if (!live.has(String(k).split('@')[0])) await this.delBlob(String(k));
    } catch { /* storage unavailable: nothing to clean */ }
  }

  /** Replace a file's contents with a new version, keeping the old one so it can be restored. */
  async saveVersion(id: string, blob: Blob, note: string, text = '') {
    const meta = this.store.state().files.find(f => f.id === id);
    const old = await this.getBlob(id);
    if (!meta || !old) throw new Error('The stored file is missing.');
    const v = meta.version ?? 1;
    await this.putBlob(id + '@' + v, old);
    await this.putBlob(id, blob);
    this.store.mutate(s => {
      const f = s.files.find(x => x.id === id);
      if (!f) return;
      (f.versions ??= []).push({ v, at: nowIso(), by: s.currentUserId, note, size: old.size });
      f.version = v + 1; f.size = blob.size; if (text) f.text = text.slice(0, TEXT_CAP);
      if (f.recordId) s.activities.push({ id: uid(), recordId: f.recordId, type: 'note', text: `File edited: ${f.name} (${note})`, at: nowIso() });
    });
  }

  async restoreVersion(id: string, v: number) {
    const b = await this.getBlob(id + '@' + v);
    if (!b) throw new Error('That version is no longer stored.');
    await this.saveVersion(id, b, 'Restored version ' + v);
  }

  /** Apply a recipe to a stored spreadsheet. The file becomes a new version; the original stays in its history. */
  async runRecipe(id: string, r: Recipe): Promise<string[]> {
    const f = this.store.state().files.find(x => x.id === id);
    if (!f) throw new Error('File not found.');
    const res = applyRecipe(await this.readStoredSheets(f), r);
    const out = await sheetsToFile(f.name, res.sheets);
    await this.saveVersion(id, out.blob, 'Recipe: ' + r.name);
    if (r.sendTo && r.sendTo !== this.store.currentUser().id) await this.send(id, [r.sendTo], 'share', 'Processed by recipe "' + r.name + '".');
    return res.notes;
  }

  // ---- sending files to people ----
  /** Share a copy, hand the file over, or ask for a review. Each person gets a direct message, a task and a note on the record. */
  async send(fileId: string, to: string[], mode: SendMode, note: string) {
    const me = this.store.currentUser().id;
    const f0 = this.store.state().files.find(f => f.id === fileId);
    const people = [...new Set(to)].filter(u => u && u !== me);
    if (!f0 || !people.length) return;
    const phrase = { share: 'shared a file with you', handover: 'handed a file over to you', review: 'asked you to review a file' }[mode];
    this.store.mutate(s => {
      const f = s.files.find(x => x.id === fileId)!;
      const rec = s.records.find(r => r.id === f.recordId);
      f.sharedWith = [...new Set([...(f.sharedWith ?? []), ...people])];
      if (mode === 'handover') f.heldBy = people[0];
      if (mode === 'review') f.review = { by: me, to: people[0], status: 'pending', note: note.trim(), at: nowIso() };
      const wsId = rec?.wsId ?? s.activeWorkspaceId ?? s.workspaces[0]?.id ?? '';
      const names = people.map(id => s.users.find(u => u.id === id)?.name ?? '').join(', ');
      for (const u of (mode === 'share' ? people : people.slice(0, 1))) {
        s.messages.push({ id: uid(), thread: dmThread(me, u), fromId: me, at: nowIso(), mentions: [u], readBy: [me], fileIds: [fileId],
          text: (note.trim() ? note.trim() + '\n' : '') + `(${phrase}: ${f.name})` });
        s.tasks.push({ id: uid(), wsId, recordId: f.recordId, title: (mode === 'review' ? 'Review file: ' : 'Look at file: ') + f.name, due: '', done: false, assigneeId: u });
      }
      if (f.recordId) s.activities.push({ id: uid(), recordId: f.recordId, type: 'note', at: nowIso(),
        text: { share: 'File shared with ', handover: 'File handed over to ', review: 'File sent for review to ' }[mode] + names + ': ' + f.name });
    });
  }

  /** The reviewer's answer. Tells the person who asked. */
  respond(fileId: string, status: 'approved' | 'returned', note: string) {
    const me = this.store.currentUser().id;
    this.store.mutate(s => {
      const f = s.files.find(x => x.id === fileId);
      if (!f?.review || f.review.to !== me) return;
      f.review = { ...f.review, status };
      s.messages.push({ id: uid(), thread: dmThread(me, f.review.by), fromId: me, at: nowIso(), mentions: [f.review.by], readBy: [me], fileIds: [fileId],
        text: (note.trim() ? note.trim() + '\n' : '') + `(${status === 'approved' ? 'approved' : 'returned for changes'}: ${f.name})` });
      if (f.recordId) s.activities.push({ id: uid(), recordId: f.recordId, type: 'note', at: nowIso(), text: `File ${status}: ${f.name}` });
      s.tasks.forEach(t => { if (t.assigneeId === me && t.title === 'Review file: ' + f.name) t.done = true; });
    });
  }

  /** The sheets inside a stored spreadsheet file. */
  async readStoredSheets(f: FileMeta): Promise<Sheet[]> {
    const b = await this.getBlob(f.id);
    if (!b) throw new Error('The stored file is missing.');
    return readSheets(new File([b], f.name, { type: f.mime }));
  }

  async open(f: FileMeta, download = false) {
    const b = await this.getBlob(f.id);
    if (!b) return false;
    const url = URL.createObjectURL(b);
    if (download) {
      const a = document.createElement('a'); a.href = url; a.download = f.name;
      document.body.append(a); a.click(); a.remove();
    } else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }

  /** The one record this file clearly belongs to, judged from its name and text, or null if unsure. */
  match(meta: Pick<FileMeta, 'name' | 'text'>): CrmRecord | null {
    const st = this.store.state();
    const name = norm(meta.name.replace(/\.[^.]+$/, '')), text = norm(meta.text.slice(0, 4000));
    const scored: { r: CrmRecord; score: number }[] = [];
    for (const r of st.records) {
      if (!this.access.recordVisible(r)) continue;
      const t = norm(r.title);
      let score = 0;
      if (t.length >= 3 && (' ' + name + ' ').includes(' ' + t + ' ')) score += 10;
      else if (t.length >= 3 && text.includes(t)) score += 4;
      const c = st.contacts.find(x => x.id === r.contactId);
      if (c) {
        const cn = norm(c.name);
        if (cn.length >= 3 && (' ' + name + ' ').includes(' ' + cn + ' ')) score += 3;
        if (c.email && meta.text.toLowerCase().includes(c.email.toLowerCase())) score += 3;
      }
      if (score) scored.push({ r, score });
    }
    scored.sort((a, b) => b.score - a.score);
    if (!scored.length || scored[0].score < 3) return null;
    if (scored[1] && scored[1].score === scored[0].score) return null;   // ambiguous: leave in the inbox
    return scored[0].r;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[_\-.()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- reading text out of files ----------
export async function extractText(f: File): Promise<string> {
  const n = f.name.toLowerCase();
  let out = '';
  if (n.endsWith('.pdf')) out = await pdfText(f);
  else if (n.endsWith('.xlsx')) {
    const sheets = await readXlsxFile(f);
    out = ((sheets[0]?.data ?? []) as unknown[][]).slice(0, 200).map(r => r.map(c => c ?? '').join('\t')).join('\n');
  } else if (f.type.startsWith('text/') || /\.(txt|csv|md|json|eml|html?)$/.test(n)) out = await f.text();
  return out.replace(/[ \t]+/g, ' ').trim().slice(0, TEXT_CAP);
}

async function pdfText(f: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) });
  const doc = await task.promise;
  let out = '';
  for (let i = 1; i <= Math.min(doc.numPages, 10) && out.length < TEXT_CAP; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it: any) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('') + '\n';
  }
  await task.destroy();
  return out;
}

// ---------- pre-filling a record from a file ----------
export interface Suggestion { title: string; email: string; phone: string; value: number | null; dueDate: string; }

export function suggestFromFile(meta: Pick<FileMeta, 'name' | 'text'>): Suggestion {
  const t = meta.text;
  const title = meta.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(t)?.[0] ?? '';
  const phone = /(?:\+\d{1,3}[\s-]?)?(?:\(?0\d{1,2}\)?[\s-]?)\d{3}[\s-]?\d{3,4}\b/.exec(t)?.[0].trim() ?? '';
  let value: number | null = null;
  for (const m of t.matchAll(/(?:R|\$|€|£|USD|ZAR|EUR|GBP)\s?(\d[\d\s,.]*\d|\d)/g)) {
    const n = toNumber(m[1].replace(/\s/g, ''));
    if (n != null && (value == null || n > value)) value = n;
  }
  let dueDate = '';
  const labelled = /(?:due|expiry|expires|deadline|valid until|closing)[^\d]{0,20}(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/i.exec(t);
  const any = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\b/.exec(t);
  const d = labelled?.[1] ?? any?.[1];
  if (d) dueDate = toDate(d) ?? '';
  return { title, email, phone, value, dueDate };
}
