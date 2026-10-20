import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { FileStore, loadPdfjs } from '../core/files';
import { FileMeta } from '../core/models';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { fileSize } from './file-size';
import { TableTool, canExtractTables } from '../core/tables';

type Kind = 'loading' | 'image' | 'pdf' | 'doc' | 'text' | 'none' | 'error';
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const TEXT = /\.(txt|md|json|xml|log|eml|html?|yml|yaml|ini|ts|js|css)$/i;
const MAX_PAGES = 40;
const MAX_TEXT = 300_000;

/** Word file to simple HTML. Links are limited to web and mail addresses and open in a new tab. */
async function wordToHtml(blob: Blob): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
  const doc = new DOMParser().parseFromString(value, 'text/html');
  doc.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') ?? '';
    if (/^(https?:|mailto:|#)/i.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
    else a.removeAttribute('href');
  });
  return doc.body.innerHTML || '<p>This document is empty.</p>';
}

/** Preview a stored file without leaving the app: PDFs, images and text. Other types offer a download. */
@Component({
  selector: 'app-file-viewer',
  imports: [NgIcon, HlmSheetImports, HlmButtonImports],
  template: `
    <hlm-sheet side="right" [state]="file() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      @if (file(); as f) {
        <hlm-sheet-content *hlmSheetPortal="let ctx" class="w-full gap-0 data-[side=right]:w-[95vw] data-[side=right]:sm:max-w-4xl">
          <hlm-sheet-header class="border-b">
            <h3 hlmSheetTitle class="truncate pr-8">{{ f.name }}</h3>
            <p hlmSheetDescription>{{ size(f.size) }}{{ f.version && f.version > 1 ? ' · version ' + f.version : '' }}{{ kind() === 'pdf' && pages().length ? ' · ' + pages().length + (more() ? '+' : '') + ' pages' : '' }}</p>
          </hlm-sheet-header>

          <div class="bg-muted/30 flex-1 overflow-y-auto p-4">
            @switch (kind()) {
              @case ('loading') { <p class="text-muted-foreground py-16 text-center text-sm">Opening...</p> }
              @case ('image') { <img [src]="url()" [alt]="f.name" class="mx-auto max-h-full max-w-full rounded-lg border bg-white shadow-sm"> }
              @case ('pdf') {
                <div class="mx-auto flex max-w-3xl flex-col gap-4">
                  @for (p of pages(); track $index) { <img [src]="p" [alt]="'Page ' + ($index + 1)" class="w-full rounded-lg border bg-white shadow-sm"> }
                  @if (rendering()) { <p class="text-muted-foreground py-4 text-center text-sm">Loading more pages...</p> }
                  @if (more()) { <p class="text-muted-foreground py-2 text-center text-sm">Showing the first {{ pages().length }} pages. Download the file to see the rest.</p> }
                </div>
              }
              @case ('doc') {
                <article class="mx-auto max-w-3xl rounded-lg border bg-white p-8 text-sm leading-relaxed text-black shadow-sm sm:p-12
                                [&_a]:text-blue-700 [&_a]:underline [&_h1]:mt-4 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold
                                [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_img]:my-3 [&_img]:max-w-full [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6
                                [&_p]:my-2 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-neutral-300 [&_td]:p-2 [&_td]:align-top
                                [&_th]:border [&_th]:border-neutral-300 [&_th]:bg-neutral-100 [&_th]:p-2 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
                         [innerHTML]="html()"></article>
                <p class="text-muted-foreground mx-auto mt-3 max-w-3xl text-center text-xs">Simplified preview: fonts, colours and page layout are not shown. Download the file to see it exactly.</p>
              }
              @case ('text') { <pre class="bg-background mx-auto max-w-3xl overflow-x-auto rounded-lg border p-4 text-sm whitespace-pre-wrap">{{ text() }}</pre> }
              @case ('none') {
                <div class="text-muted-foreground flex flex-col items-center gap-3 py-20 text-center text-sm">
                  <ng-icon name="lucideFile" class="size-10" />
                  <p>There is no preview for this type of file.<br>Download it to open it in its own program.</p>
                </div>
              }
              @case ('error') { <p class="text-destructive py-16 text-center text-sm">{{ error() }}</p> }
            }
          </div>

          <hlm-sheet-footer class="border-t sm:flex-row sm:justify-between">
            <button hlmBtn variant="outline" (click)="download(f)"><ng-icon name="lucideDownload" /> Download</button>
            <div class="flex flex-wrap gap-2">
              @if (kind() === 'pdf' || kind() === 'image') { <button hlmBtn variant="outline" (click)="newTab(f)"><ng-icon name="lucideExternalLink" /> Open in new tab</button> }
              @if (canTables(f.name)) {
                <button hlmBtn variant="outline" [disabled]="!!tables.status()" (click)="extract(f)">
                  <ng-icon name="lucideTable2" /> {{ tables.status()?.id === f.id ? tables.status()!.msg : 'Extract tables' }}
                </button>
              }
              <button hlmBtn variant="outline" (click)="send(f)"><ng-icon name="lucideSend" /> Send...</button>
              <button hlmBtn (click)="close()">Close</button>
            </div>
          </hlm-sheet-footer>
        </hlm-sheet-content>
      }
    </hlm-sheet>
  `,
})
export class FileViewer {
  private readonly store = inject(Store);
  private readonly files = inject(FileStore);
  private readonly ui = inject(Ui);

  readonly file = computed<FileMeta | null>(() => {
    const id = this.ui.viewer();
    return id ? this.store.state().files.find(f => f.id === id) ?? null : null;
  });
  readonly kind = signal<Kind>('loading');
  readonly url = signal('');
  readonly text = signal('');
  readonly html = signal('');
  readonly pages = signal<string[]>([]);
  readonly more = signal(false);
  readonly rendering = signal(false);
  readonly error = signal('');
  size = fileSize;
  readonly tables = inject(TableTool);
  canTables = canExtractTables;

  async extract(f: FileMeta) {
    const r = await this.tables.run(f);
    if (r.ok) { toast.success(r.message); this.close(); } else toast.error(r.message);
  }

  private run = 0;   // guards against a slow load finishing after the viewer moved on

  constructor() {
    effect(() => {
      const f = this.file();
      untracked(() => this.load(f));
    });
  }

  private reset() {
    if (this.url()) URL.revokeObjectURL(this.url());
    this.url.set(''); this.text.set(''); this.html.set(''); this.pages.set([]); this.more.set(false); this.rendering.set(false); this.error.set('');
  }

  private async load(f: FileMeta | null) {
    const me = ++this.run;
    this.reset();
    if (!f) return;
    this.kind.set('loading');
    try {
      const blob = await this.files.getBlob(f.id);
      if (me !== this.run) return;
      if (!blob) { this.fail('The file data is missing from this browser.'); return; }
      const n = f.name.toLowerCase();
      if (IMAGE.test(n) || blob.type.startsWith('image/')) {
        this.url.set(URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'image/' + n.split('.').pop() })));
        this.kind.set('image');
      } else if (n.endsWith('.pdf')) {
        this.kind.set('pdf');
        await this.renderPdf(blob, me);
      } else if (n.endsWith('.docx')) {
        const html = await wordToHtml(blob);
        if (me !== this.run) return;
        this.html.set(html);
        this.kind.set('doc');
      } else if (TEXT.test(n) || blob.type.startsWith('text/')) {
        const t = await blob.text();
        if (me !== this.run) return;
        this.text.set(t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + '\n\n... (the rest is not shown, download the file to read it all)' : t);
        this.kind.set('text');
      } else this.kind.set('none');
    } catch (e) {
      if (me === this.run) this.fail(e instanceof Error ? e.message : 'Could not open this file.');
    }
  }

  private fail(msg: string) { this.error.set(msg); this.kind.set('error'); }

  /** Draw each page to an image, one at a time, so the first page shows up straight away. */
  private async renderPdf(blob: Blob, me: number) {
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    try {
      const doc = await task.promise;
      this.rendering.set(true);
      const count = Math.min(doc.numPages, MAX_PAGES);
      this.more.set(doc.numPages > count);
      for (let i = 1; i <= count; i++) {
        if (me !== this.run) return;
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvas, viewport: vp } as never).promise;
        if (me !== this.run) return;
        this.pages.update(p => [...p, canvas.toDataURL('image/jpeg', 0.85)]);
      }
    } finally {
      if (me === this.run) this.rendering.set(false);
      task.destroy();
    }
  }

  async download(f: FileMeta) { if (!(await this.files.open(f, true))) toast.error('The file data is missing from this browser.'); }
  async newTab(f: FileMeta) { if (!(await this.files.open(f))) toast.error('The file data is missing from this browser.'); }
  send(f: FileMeta) { this.close(); this.ui.sendFile.set(f.id); }

  onState(s: string) { if (s === 'closed') this.close(); }
  close() { this.run++; this.reset(); this.ui.viewer.set(null); }
}
