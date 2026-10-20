import { Component, inject, input, output, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { FileStore } from '../core/files';
import { FileMeta } from '../core/models';

/** Drop files here (or click) to store them. Pass a recordId to attach to that record; leave it empty to auto-file. */
@Component({
  selector: 'app-file-drop',
  imports: [NgIcon],
  template: `
    <div class="border-border text-muted-foreground hover:bg-muted/50 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 text-center text-sm transition-colors"
         [class]="compact() ? 'py-4' : 'py-8'" [class.bg-muted]="over()"
         (click)="picker.click()" (dragover)="$event.preventDefault(); over.set(true)"
         (dragleave)="over.set(false)" (drop)="$event.preventDefault(); over.set(false); take($event.dataTransfer?.files)">
      <ng-icon name="lucideUpload" class="size-5" />
      <span>{{ busy() ? 'Reading files...' : label() }}</span>
      <input #picker type="file" multiple hidden (click)="$event.stopPropagation()" (change)="take($any($event.target).files); $any($event.target).value = ''">
    </div>
  `,
})
export class FileDrop {
  private readonly files = inject(FileStore);
  readonly recordId = input('');
  readonly compact = input(false);
  readonly label = input('Drop files here or click to choose. PDFs, Excel and text are read and filed automatically.');
  readonly added = output<FileMeta[]>();
  readonly over = signal(false);
  readonly busy = signal(false);

  async take(list?: FileList | null) {
    if (!list?.length) return;
    const picked = [...list];   // the FileList empties when the input is reset
    this.busy.set(true);
    try {
      const r = await this.files.add(picked, this.recordId());
      if (r.added.length) {
        const unfiled = r.added.length - r.auto;
        toast.success(r.added.length + (r.added.length === 1 ? ' file added' : ' files added')
          + (this.recordId() ? '' : r.auto ? ', ' + r.auto + ' filed automatically' + (unfiled ? ', ' + unfiled + ' in the inbox' : '') : ', waiting in the inbox'));
        if (r.recipesRun) toast.success(r.recipesRun + (r.recipesRun === 1 ? ' recipe' : ' recipes') + ' ran on your spreadsheet automatically');
        this.added.emit(r.added);
      }
      if (r.rejected.length) toast.error('Skipped: ' + r.rejected.join(', '));
    } catch { toast.error('Could not store the files. Is browser storage blocked or full?'); }
    finally { this.busy.set(false); }
  }
}
