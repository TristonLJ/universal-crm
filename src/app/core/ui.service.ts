import { Injectable, signal } from '@angular/core';
import type { ParsedFile } from './import';

/** Which overlay is open. The shell renders them once; pages just ask. */
@Injectable({ providedIn: 'root' })
export class Ui {
  readonly recordSheet = signal<{ id?: string; stageId?: string } | null>(null);
  readonly contactSheet = signal<{ id?: string } | null>(null);
  readonly paletteOpen = signal(false);
  readonly importSheet = signal(false);
  readonly workbench = signal<string | null>(null);
  readonly sendFile = signal<string | null>(null);
  readonly viewer = signal<string | null>(null);
  /** Rows handed to the import screen from the workbench, skipping the file-choosing step. */
  readonly importPrefill = signal<ParsedFile | null>(null);

  openRecord(id?: string, stageId?: string) { this.recordSheet.set({ id, stageId }); }
  /** Spreadsheets open in the workbench, everything else in the viewer. */
  openFile(f: { id: string; name: string }) { /\.(xlsx|csv)$/i.test(f.name) ? this.workbench.set(f.id) : this.viewer.set(f.id); }
  openWorkbench(fileId: string) { this.workbench.set(fileId); }
  openContact(id?: string) { this.contactSheet.set({ id }); }
}
