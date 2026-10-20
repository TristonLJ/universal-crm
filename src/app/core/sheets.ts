import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import { toDate } from './import';

/* Spreadsheet engine: reads workbooks, tidies them up, sorts them and writes them back.
   Everything here is plain functions on plain data so it can be reused by the workbench,
   by recipes and by imports. Sorting and number cleaning follow the rules of the Python
   word-pdf-editor tool: numbers, then dates, then text; blanks always last; IDs stay text. */

export type Cell = string | number | boolean | Date | null;
export interface Sheet { name: string; rows: Cell[][]; hasHeader: boolean; }
export type ColType = 'number' | 'date' | 'text' | 'boolean' | 'empty';

const MAX_ROWS = 20000;

// ---------- reading and writing ----------
const isBlank = (v: Cell) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const rectangular = (rows: Cell[][]): Cell[][] => {
  const w = Math.max(0, ...rows.map(r => r.length));
  return rows.map(r => Array.from({ length: w }, (_, i) => (r[i] === undefined || r[i] === '' ? null : r[i])));
};

export async function readSheets(file: File): Promise<Sheet[]> {
  const n = file.name.toLowerCase();
  let out: { name: string; rows: Cell[][] }[];
  if (n.endsWith('.xlsx')) {
    const sheets = await readXlsxFile(file);
    out = (sheets as unknown as { sheet: string; data: unknown[][] }[]).map(s => ({ name: s.sheet, rows: s.data as Cell[][] }));
  } else {
    const res = Papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' });
    out = [{ name: file.name.replace(/\.[^.]+$/, '').slice(0, 31) || 'Sheet 1', rows: res.data as Cell[][] }];
  }
  const csv = !n.endsWith('.xlsx');
  return out.map(s => {
    const rows = rectangular(s.rows.slice(0, MAX_ROWS));
    const sheet = { name: s.name, rows, hasHeader: detectHeader(rows) };
    // CSV holds only text, so work out which columns are really numbers or dates (IDs stay text).
    return csv ? tidy(sheet, { trim: false, convert: true, dropBlank: false, dedupe: false }).sheet : sheet;
  });
}

const widthOf = (rows: Cell[][], c: number) =>
  Math.min(48, Math.max(8, ...rows.slice(0, 200).map(r => String(r[c] instanceof Date ? 'yyyy-mm-dd' : r[c] ?? '').length + 2)));

export async function writeSheets(sheets: Sheet[]): Promise<Blob> {
  const data = sheets.map(s => ({
    sheet: s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet',
    data: s.rows.map((row, ri) => row.map(v => {
      if (v === null || v === undefined || v === '') return null;
      const head = s.hasHeader && ri === 0;
      const style = head ? { fontWeight: 'bold' as const, backgroundColor: '#e4e4e7' } : {};
      if (v instanceof Date) return { value: v, type: Date, format: 'yyyy-mm-dd', ...style };
      if (typeof v === 'number') return { value: v, type: Number, ...style };
      if (typeof v === 'boolean') return { value: v, type: Boolean, ...style };
      return { value: String(v), type: String, ...style };
    })),
    columns: (s.rows[0] ?? []).map((_, c) => ({ width: widthOf(s.rows, c) })),
    stickyRowsCount: s.hasHeader ? 1 : 0,
  }));
  return writeXlsxFile(data as never).toBlob();
}

export const toCsv = (s: Sheet) => Papa.unparse(s.rows.map(r => r.map(v => v instanceof Date ? isoDate(v) : v ?? '')));

/** The bytes to store for edited sheets: CSV stays CSV (first sheet only), everything else becomes .xlsx. */
export async function sheetsToFile(name: string, sheets: Sheet[]): Promise<{ blob: Blob; name: string; truncated: boolean }> {
  if (/\.csv$/i.test(name)) return { blob: new Blob([toCsv(sheets[0])], { type: 'text/csv' }), name, truncated: sheets.length > 1 };
  return { blob: await writeSheets(sheets), name: name.replace(/\.[^.]+$/, '') + '.xlsx', truncated: false };
}

export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const show = (v: Cell) => v === null || v === undefined ? '' : v instanceof Date ? isoDate(v) : String(v);

// ---------- reading what a piece of text means ----------
/** "R 12 500,50", "(300)", "15%" -> numbers. IDs with leading zeros and 16+ digit numbers stay text (null). */
export function parseNumeric(text: string): number | null {
  let s = text.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  const minus = () => { s = s.replace(/^[-−]\s*/, () => { neg = true; return ''; }); };
  minus();
  s = s.replace(/^(?:ZAR|USD|EUR|GBP|R|[$€£¥])\s*/i, '');
  minus();
  let pct = false;
  if (s.endsWith('%')) { pct = true; s = s.slice(0, -1).trim(); }
  if (!/^\d[\d\s,.']*$/.test(s)) return null;
  if (/\s/.test(s) && !/^\d{1,3}(\s\d{3})+([.,]\d+)?$/.test(s)) return null;
  s = s.replace(/[\s']/g, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length > 15) return null;
  if (digits.length > 1 && digits[0] === '0' && !/^0[.,]/.test(s)) return null;
  const hasC = s.includes(','), hasD = s.includes('.');
  let t: string;
  if (hasC && hasD) {
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const grp = dec === ',' ? '.' : ',';
    t = s.split(grp).join('').replace(dec, '.');
  } else if (hasC) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) t = s.replace(/,/g, '');
    else if (/^\d+,\d{1,2}$/.test(s)) t = s.replace(',', '.');
    else return null;
  } else if (hasD) {
    if ((s.match(/\./g) ?? []).length > 1) { if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null; t = s.replace(/\./g, ''); }
    else t = s;
  } else t = s;
  const v = Number(t);
  if (isNaN(v)) return null;
  return (neg ? -v : v) / (pct ? 100 : 1);
}

const MONTH = /^(?:\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})$/;
/** Only clear date shapes count; "Room 5" must not turn into a date. */
export function parseDateText(text: string): Date | null {
  const s = text.trim();
  if (!s) return null;
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T ].*)?$/.test(s) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(s)) {
    const iso = toDate(s.slice(0, 10).replace(/T.*/, ''));
    return iso ? new Date(iso + 'T00:00:00') : null;
  }
  if (MONTH.test(s)) { const t = Date.parse(s); return isNaN(t) ? null : new Date(new Date(t).setHours(0, 0, 0, 0)); }
  return null;
}

/** Interpret something typed into a cell. */
export function parseCell(text: string, colType: ColType): Cell {
  const t = text.trim();
  if (!t) return null;
  if (colType === 'text') return t;
  const d = colType === 'number' ? null : parseDateText(t);
  if (d) return d;
  const n = colType === 'date' ? null : parseNumeric(t);
  return n ?? t;
}

// ---------- looking at a sheet ----------
export function columnTypes(s: Sheet): ColType[] {
  const first = s.hasHeader ? 1 : 0;
  return (s.rows[0] ?? []).map((_, c) => {
    const k = { number: 0, date: 0, text: 0, boolean: 0 };
    let filled = 0;
    for (let r = first; r < s.rows.length; r++) {
      const v = s.rows[r][c];
      if (isBlank(v)) continue;
      filled++;
      if (typeof v === 'number') k.number++;
      else if (v instanceof Date) k.date++;
      else if (typeof v === 'boolean') k.boolean++;
      else k.text++;
    }
    if (!filled) return 'empty';
    return (Object.entries(k).find(([, n]) => n / filled >= 0.8)?.[0] ?? 'text') as ColType;
  });
}

/** First row is a header when it is all text and the rows below look different (or it has no gaps and no numbers). */
export function detectHeader(rows: Cell[][]): boolean {
  if (rows.length < 2) return false;
  const h = rows[0];
  const filled = h.filter(v => !isBlank(v));
  if (filled.length < Math.ceil(h.length / 2)) return false;
  if (filled.some(v => typeof v !== 'string' || parseNumeric(v) !== null || parseDateText(v) !== null)) return false;
  return true;
}

export const colLetter = (i: number) => { let s = '', n = i + 1; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };

export const headerOf = (s: Sheet, c: number) => s.hasHeader && !isBlank(s.rows[0]?.[c]) ? show(s.rows[0][c]) : 'Column ' + colLetter(c);

// ---------- tidying ----------
export interface TidyOptions { trim: boolean; convert: boolean; dropBlank: boolean; dedupe: boolean; }
export const DEFAULT_TIDY: TidyOptions = { trim: true, convert: true, dropBlank: true, dedupe: false };
const ID_HEADER = /\b(id|phone|tel|telephone|mobile|cell|account|acc|ref|reference|code|zip|postal|vat|reg|sku|barcode|passport|idnumber)\b/i;

export function tidy(input: Sheet, o: TidyOptions): { sheet: Sheet; notes: string[] } {
  const notes: string[] = [];
  let rows = input.rows.map(r => [...r]);
  let hasHeader = input.hasHeader;
  if (o.trim) {
    let n = 0;
    rows = rows.map(r => r.map(v => {
      if (typeof v !== 'string') return v;
      const t = v.replace(/\s+/g, ' ').trim();
      if (t !== v) n++;
      return t === '' ? null : t;
    }));
    if (n) notes.push(`Cleaned extra spaces in ${n} cell${n === 1 ? '' : 's'}.`);
  }
  if (o.dropBlank) {
    const before = rows.length;
    rows = rows.filter((r, i) => (hasHeader && i === 0) || r.some(v => !isBlank(v)));
    const keep = (rows[0] ?? []).map((_, c) => rows.some(r => !isBlank(r[c])));
    const removedCols = keep.filter(k => !k).length;
    rows = rows.map(r => r.filter((_, c) => keep[c]));
    if (before - rows.length) notes.push(`Removed ${before - rows.length} empty row${before - rows.length === 1 ? '' : 's'}.`);
    if (removedCols) notes.push(`Removed ${removedCols} empty column${removedCols === 1 ? '' : 's'}.`);
  }
  let work: Sheet = { name: input.name, rows, hasHeader };
  const newHeader = detectHeader(rows);
  if (newHeader !== hasHeader && !hasHeader) { hasHeader = newHeader; work = { ...work, hasHeader }; notes.push('Treated the first row as the header.'); }
  if (o.convert) {
    const first = hasHeader ? 1 : 0;
    let nums = 0, dates = 0;
    (rows[0] ?? []).forEach((_, c) => {
      const textual = rows.slice(first).map(r => r[c]).filter(v => typeof v === 'string' && v.trim() !== '') as string[];
      const filled = rows.slice(first).filter(r => !isBlank(r[c])).length;
      if (!textual.length || !filled) return;
      const idCol = hasHeader && ID_HEADER.test(show(rows[0][c]));
      const numeric = idCol ? [] : textual.map(parseNumeric);
      const dated = textual.map(parseDateText);
      const numOk = numeric.length > 0 && numeric.filter(v => v !== null).length / filled >= 0.8;
      const dateOk = dated.filter(v => v !== null).length / filled >= 0.8;
      if (!numOk && !dateOk) return;
      for (let r = first; r < rows.length; r++) {
        const v = rows[r][c];
        if (typeof v !== 'string') continue;
        const out = numOk ? parseNumeric(v) : parseDateText(v);
        if (out !== null) { rows[r][c] = out; numOk ? nums++ : dates++; }
      }
    });
    if (nums) notes.push(`Turned ${nums} number${nums === 1 ? '' : 's'} written as text into real numbers.`);
    if (dates) notes.push(`Turned ${dates} date${dates === 1 ? '' : 's'} written as text into real dates.`);
  }
  if (o.dedupe) {
    const seen = new Set<string>(), first = hasHeader ? 1 : 0, before = rows.length;
    rows = rows.filter((r, i) => {
      if (i < first) return true;
      const k = JSON.stringify(r.map(v => v instanceof Date ? v.getTime() : typeof v === 'string' ? v.toLowerCase() : v));
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    if (before - rows.length) notes.push(`Removed ${before - rows.length} duplicate row${before - rows.length === 1 ? '' : 's'}.`);
  }
  if (!notes.length) notes.push('Nothing needed tidying.');
  return { sheet: { name: input.name, rows, hasHeader }, notes };
}

// ---------- sorting and grouping ----------
export interface SortKey { col: number; desc: boolean; }

const rank = (v: Cell) => typeof v === 'number' ? 0 : v instanceof Date ? 1 : typeof v === 'boolean' ? 3 : 2;
function compare(a: Cell, b: Cell): number {
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'number') return a - (b as number);
  if (a instanceof Date) return a.getTime() - (b as Date).getTime();
  if (typeof a === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Sort data rows by one or more columns. The header stays on top and blanks always go last. */
export function sortRows(s: Sheet, keys: SortKey[]): Sheet {
  if (!keys.length) return s;
  const first = s.hasHeader ? 1 : 0;
  const head = s.rows.slice(0, first), body = s.rows.slice(first).map((r, i) => ({ r, i }));
  body.sort((x, y) => {
    for (const k of keys) {
      const a = x.r[k.col], b = y.r[k.col], ba = isBlank(a), bb = isBlank(b);
      if (ba || bb) { if (ba && bb) continue; return ba ? 1 : -1; }
      const c = compare(a, b);
      if (c) return k.desc ? -c : c;
    }
    return x.i - y.i;
  });
  return { ...s, rows: [...head, ...body.map(x => x.r)] };
}

export const sortTabs = (sheets: Sheet[], desc = false) =>
  [...sheets].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) * (desc ? -1 : 1));

/** One new sheet per distinct value in a column, each keeping the header. */
export function splitBy(s: Sheet, col: number): Sheet[] {
  const first = s.hasHeader ? 1 : 0, groups = new Map<string, Cell[][]>();
  for (const r of s.rows.slice(first)) {
    const key = isBlank(r[col]) ? '(blank)' : show(r[col]).trim();
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const used = new Set<string>();
  return [...groups].map(([k, rows]) => {
    let name = k.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet', n = 2;
    while (used.has(name.toLowerCase())) name = name.slice(0, 28) + ' ' + n++;
    used.add(name.toLowerCase());
    return { name, hasHeader: s.hasHeader, rows: [...s.rows.slice(0, first), ...rows] };
  });
}

/** Add a total row under the numeric columns. */
export function addTotals(s: Sheet, fn: 'sum' | 'average'): Sheet {
  const types = columnTypes(s), first = s.hasHeader ? 1 : 0;
  const row: Cell[] = types.map((t, c) => {
    if (t !== 'number') return c === 0 ? (fn === 'sum' ? 'Total' : 'Average') : null;
    const nums = s.rows.slice(first).map(r => r[c]).filter((v): v is number => typeof v === 'number');
    const sum = nums.reduce((a, b) => a + b, 0);
    return fn === 'sum' ? sum : nums.length ? sum / nums.length : null;
  });
  return { ...s, rows: [...s.rows, row] };
}

export const isSheetFile = (name: string) => /\.(xlsx|csv)$/i.test(name);

export const emptyRow = (s: Sheet): Cell[] => (s.rows[0] ?? [null]).map(() => null);
