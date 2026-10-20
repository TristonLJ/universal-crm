import { Injectable, inject, signal } from '@angular/core';
import { FileStore, loadPdfjs } from './files';
import { FileMeta } from './models';
import { Sheet, detectHeader, tidy, writeSheets } from './sheets';
import { Ui } from './ui.service';

/* Finds tables in documents and turns them into spreadsheets. Same idea as the Python tool in
   word-pdf-editor: work out rows from where words sit vertically, and columns from where cells
   line up across rows. Works on PDFs with text, on scans and photos (via OCR), and on Word tables. */

export interface Box { t: string; x0: number; y0: number; x1: number; y1: number; }
interface Cell { t: string; x0: number; x1: number; }
interface Line { cells: Cell[]; y0: number; y1: number; }

export const canExtractTables = (name: string) => /\.(pdf|docx|png|jpe?g|webp|bmp|gif)$/i.test(name);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

// ---------- words on a page -> tables ----------
/** Group word boxes into text lines (top to bottom), then into cells split at wide gaps. */
function toLines(boxes: Box[], medH: number): Line[] {
  const sorted = [...boxes].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows: { cy: number; items: Box[] }[] = [];
  for (const b of sorted) {
    const cy = (b.y0 + b.y1) / 2, row = rows[rows.length - 1];
    if (row && Math.abs(cy - row.cy) <= medH * 0.6) { row.items.push(b); row.cy = row.items.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / row.items.length; }
    else rows.push({ cy, items: [b] });
  }
  return rows.map(r => {
    const items = r.items.sort((a, b) => a.x0 - b.x0), cells: Cell[] = [];
    for (const w of items) {
      const last = cells[cells.length - 1];
      if (last && w.x0 - last.x1 <= medH * 0.9) { last.t += ' ' + w.t; last.x1 = Math.max(last.x1, w.x1); }
      else cells.push({ t: w.t, x0: w.x0, x1: w.x1 });
    }
    return { cells, y0: Math.min(...items.map(i => i.y0)), y1: Math.max(...items.map(i => i.y1)) };
  });
}

/** Rebuild the tables on one page from word positions. Paragraphs are left out. */
export function boxesToTables(boxes: Box[]): string[][][] {
  const clean = boxes.filter(b => b.t.trim() && b.x1 > b.x0 && b.y1 > b.y0);
  if (clean.length < 4) return [];
  const medH = median(clean.map(b => b.y1 - b.y0));
  const lines = toLines(clean, medH);

  // A table is a run of lines with 2+ cells (a lone cell is allowed between two table lines).
  const blocks: Line[][] = [];
  let cur: Line[] = [];
  const close = () => { if (cur.length) blocks.push(cur); cur = []; };
  lines.forEach((ln, i) => {
    const prev = cur[cur.length - 1];
    if (prev && ln.y0 - prev.y1 > medH * 2.5) close();
    const like = ln.cells.length >= 2;
    const sandwiched = ln.cells.length === 1 && cur.length > 0 && (lines[i + 1]?.cells.length ?? 0) >= 2 && lines[i + 1].y0 - ln.y1 <= medH * 2.5;
    if (like || sandwiched) cur.push(ln); else close();
  });
  close();

  const tables: string[][][] = [];
  for (const block of blocks) {
    const multi = block.filter(l => l.cells.length >= 2);
    if (multi.length < 2) continue;
    // Columns come from the most common cell count, so one wide heading cell cannot merge two columns.
    const counts = new Map<number, number>();
    multi.forEach(l => counts.set(l.cells.length, (counts.get(l.cells.length) ?? 0) + 1));
    const mode = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const spans = multi.filter(l => l.cells.length === mode).flatMap(l => l.cells).sort((a, b) => a.x0 - b.x0);
    const bands: { x0: number; x1: number }[] = [];
    for (const c of spans) {
      const b = bands[bands.length - 1];
      if (b && c.x0 <= b.x1) b.x1 = Math.max(b.x1, c.x1); else bands.push({ x0: c.x0, x1: c.x1 });
    }
    if (bands.length < 2) continue;
    const bandOf = (c: Cell) => {
      let best = 0, bestOverlap = -Infinity;
      bands.forEach((b, i) => { const o = Math.min(b.x1, c.x1) - Math.max(b.x0, c.x0); if (o > bestOverlap) { bestOverlap = o; best = i; } });
      return best;
    };
    const rows = block.map(l => {
      const row = bands.map(() => '');
      for (const c of l.cells) { const i = bandOf(c); row[i] = row[i] ? row[i] + ' ' + c.t : c.t; }
      return row;
    });
    const cells = rows.flat();
    if (rows.length >= 2 && cells.filter(c => c).length >= cells.length * 0.5) tables.push(rows);
  }
  return tables;
}

// ---------- reading each kind of file ----------
type Progress = (msg: string) => void;

async function pdfTables(blob: Blob, progress: Progress): Promise<{ tables: { label: string; rows: string[][] }[]; notes: string[] }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const out: { label: string; rows: string[][] }[] = [], notes: string[] = [];
  let ocr: Ocr | null = null;
  try {
    const doc = await task.promise;
    const pages = Math.min(doc.numPages, 30);
    if (doc.numPages > pages) notes.push(`Only the first ${pages} of ${doc.numPages} pages were read.`);
    for (let p = 1; p <= pages; p++) {
      progress(`Reading page ${p} of ${pages}...`);
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const boxes: Box[] = [];
      for (const it of content.items as any[]) {
        if (!('str' in it) || !it.str.trim()) continue;
        const x = it.transform[4], base = vp.height - it.transform[5], h = it.height || Math.abs(it.transform[3]) || 10;
        boxes.push({ t: it.str.trim(), x0: x, x1: x + (it.width || it.str.length * h * 0.5), y0: base - h, y1: base });
      }
      let found: string[][][];
      if (boxes.length) found = boxesToTables(boxes);
      else {   // no text layer: it is a scan, so draw the page and read it with OCR
        progress(`Page ${p} is a scan, reading it with OCR...`);
        const vp2 = page.getViewport({ scale: Math.min(4, Math.max(2.5, 2000 / vp.width)) });   // about 2000 px wide: small print needs the detail
        const canvas = document.createElement('canvas');
        canvas.width = vp2.width; canvas.height = vp2.height;
        await page.render({ canvas, viewport: vp2 } as never).promise;
        ocr ??= await Ocr.create(progress);
        found = boxesToTables(await ocr.read(eraseLines(canvas)));
        notes.push(`Page ${p} had no text, so it was read by OCR. Check the numbers.`);
      }
      found.forEach((rows, i) => out.push({ label: `P${p}-T${i + 1}`, rows }));
    }
  } finally { await ocr?.close(); task.destroy(); }
  return { tables: out, notes };
}

async function docxTables(blob: Blob): Promise<{ label: string; rows: string[][] }[]> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return [...doc.querySelectorAll('table')].map((t, i) => ({
    label: 'Table ' + (i + 1),
    rows: [...t.querySelectorAll('tr')].map(tr => {
      const row: string[] = [];
      tr.querySelectorAll('th,td').forEach(td => {
        row.push((td.textContent ?? '').replace(/\s+/g, ' ').trim());
        for (let k = 1; k < (Number(td.getAttribute('colspan')) || 1); k++) row.push('');
      });
      return row;
    }).filter(r => r.some(c => c)),
  })).filter(t => t.rows.length >= 2);
}

async function imageTables(blob: Blob, progress: Progress) {
  progress('Preparing the image...');
  const canvas = await imageToCanvas(blob);
  const ocr = await Ocr.create(progress);
  try { return boxesToTables(await ocr.read(eraseLines(canvas))); } finally { await ocr.close(); }
}

/** Entry point: tables found in a PDF, Word file, scan or photo, as sheets ready for the Workbench. */
export async function extractTables(blob: Blob, name: string, progress: Progress = () => undefined): Promise<{ sheets: Sheet[]; notes: string[] }> {
  const n = name.toLowerCase();
  let found: { label: string; rows: string[][] }[] = [], notes: string[] = [];
  if (n.endsWith('.pdf')) ({ tables: found, notes } = await pdfTables(blob, progress));
  else if (n.endsWith('.docx')) found = await docxTables(blob);
  else {
    found = (await imageTables(blob, progress)).map((rows, i) => ({ label: 'Table ' + (i + 1), rows }));
    if (found.length) notes.push('Read from a picture with OCR. Check the numbers before you rely on them.');
  }
  const sheets = found.map(t => {
    const width = Math.max(...t.rows.map(r => r.length));
    const rows = t.rows.map(r => Array.from({ length: width }, (_, i) => r[i] || null));
    const base: Sheet = { name: t.label, rows, hasHeader: detectHeader(rows) };
    return tidy(base, { trim: true, convert: true, dropBlank: true, dedupe: false }).sheet;
  });
  return { sheets, notes };
}

// ---------- OCR ----------
async function imageToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(3, Math.max(1, 1800 / bmp.width));   // small pictures are enlarged: OCR likes about 300 dpi
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** OCR cannot read through the ruling lines of a table, so long straight dark lines are painted white first. */
export function eraseLines(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d')!, w = c.width, h = c.height;
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const dark = (x: number, y: number) => { const i = (y * w + x) * 4; return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) < 140; };
  const wipe = (x: number, y: number) => { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; };
  const hMin = w * 0.2, vMin = h * 0.1;
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && dark(x, y)) run++;
      else { if (run >= hMin) for (let k = x - run; k < x; k++) { wipe(k, y); if (y > 0) wipe(k, y - 1); if (y < h - 1) wipe(k, y + 1); } run = 0; }
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y <= h; y++) {
      if (y < h && dark(x, y)) run++;
      else { if (run >= vMin) for (let k = y - run; k < y; k++) { wipe(x, k); if (x > 0) wipe(x - 1, k); if (x < w - 1) wipe(x + 1, k); } run = 0; }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

class Ocr {
  private constructor(private readonly worker: import('tesseract.js').Worker) {}

  /** The English language data is downloaded the first time (about 10 MB) and then kept by the browser. */
  static async create(progress: Progress) {
    const { createWorker } = await import('tesseract.js');
    progress('Starting the text reader (the first time it downloads language data)...');
    const worker = await createWorker('eng', 1, {
      logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') progress(`Reading text... ${Math.round(m.progress * 100)}%`); },
    });
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' });
    return new Ocr(worker);
  }

  async read(canvas: HTMLCanvasElement): Promise<Box[]> {
    const { data } = await this.worker.recognize(canvas, {}, { blocks: true });
    const boxes: Box[] = [];
    for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
      // Leftover bits of the table's border are read as "|" or "_": drop them from the edges of words.
      const t = w.text.replace(/^[|¦_[\]]+|[|¦_[\]]+$/g, '').trim();
      if (w.confidence >= 10 && t) boxes.push({ t, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
    }
    return boxes;
  }

  close() { return this.worker.terminate(); }
}

// ---------- the button behind "Extract tables" ----------
@Injectable({ providedIn: 'root' })
export class TableTool {
  private readonly files = inject(FileStore);
  private readonly ui = inject(Ui);
  /** What is running right now, for the buttons to show. */
  readonly status = signal<{ id: string; msg: string } | null>(null);

  /** Read the tables out of a stored file, save them as a new spreadsheet next to it and open that in the Workbench. */
  async run(f: FileMeta): Promise<{ ok: boolean; message: string }> {
    if (this.status()) return { ok: false, message: 'Another file is still being read. Wait for it to finish.' };
    this.status.set({ id: f.id, msg: 'Starting...' });
    try { return await this.work(f, msg => this.status.set({ id: f.id, msg })); } finally { this.status.set(null); }
  }

  private async work(f: FileMeta, progress: Progress): Promise<{ ok: boolean; message: string }> {
    const blob = await this.files.getBlob(f.id);
    if (!blob) return { ok: false, message: 'The file data is missing from this browser.' };
    let res: { sheets: Sheet[]; notes: string[] };
    try { res = await extractTables(blob, f.name, progress); }
    catch (e) { return { ok: false, message: 'Could not read tables from this file: ' + (e instanceof Error ? e.message : 'unknown error') }; }
    if (!res.sheets.length) {
      return { ok: false, message: `No tables found in ${f.name}. They need rows and columns of text. For photos, make sure the table is straight, sharp and well lit.` };
    }
    const xlsx = await writeSheets(res.sheets);
    const name = f.name.replace(/\.[^.]+$/, '') + ' (tables).xlsx';
    const added = await this.files.add([new File([xlsx], name, { type: xlsx.type })], f.recordId);
    if (!added.added[0]) return { ok: false, message: 'Could not save the spreadsheet.' };
    this.ui.openWorkbench(added.added[0].id);
    return { ok: true, message: `Found ${res.sheets.length} table${res.sheets.length === 1 ? '' : 's'}, saved as "${name}". ${res.notes.join(' ')}`.trim() };
  }
}
