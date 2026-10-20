import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { FileStore } from '../core/files';
import { SendMode } from '../core/models';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';

/** "Send to..." for a file: pick people, how to send it, and an optional note. */
@Component({
  selector: 'app-send-file',
  imports: [FormsModule, HlmSheetImports, HlmButtonImports, HlmCheckboxImports, HlmLabelImports, HlmNativeSelectImports, HlmTextareaImports],
  template: `
    <hlm-sheet side="right" [state]="file() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      @if (file(); as f) {
        <hlm-sheet-content *hlmSheetPortal="let ctx" class="w-full gap-0 data-[side=right]:sm:max-w-md">
          <hlm-sheet-header class="border-b">
            <h3 hlmSheetTitle>Send file</h3>
            <p hlmSheetDescription>{{ f.name }}</p>
          </hlm-sheet-header>

          <div class="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <div class="grid gap-1.5">
              <label hlmLabel>How</label>
              <hlm-native-select class="w-full" [ngModel]="mode()" (ngModelChange)="setMode($event)">
                <option hlmNativeSelectOption value="share">Share a copy (they can see it, you keep it)</option>
                <option hlmNativeSelectOption value="review">Ask for a review (they approve or return it)</option>
                <option hlmNativeSelectOption value="handover">Hand over (they now hold it)</option>
              </hlm-native-select>
            </div>

            <div class="grid gap-2">
              <label hlmLabel>{{ mode() === 'share' ? 'To (one or more people)' : 'To' }}</label>
              @for (g of groups(); track g.label) {
                <div class="text-muted-foreground text-xs font-medium uppercase">{{ g.label }}</div>
                @for (u of g.users; track u.id) {
                  <label class="flex items-center gap-2 text-sm">
                    <hlm-checkbox [checked]="picked().includes(u.id)" (checkedChange)="toggle(u.id, $event === true)" />
                    {{ u.name }} <span class="text-muted-foreground">{{ store.roleName(u.roleId) }}</span>
                  </label>
                }
              } @empty { <p class="text-muted-foreground text-sm">There is nobody else to send to. Add people in Settings.</p> }
            </div>

            <div class="grid gap-1.5">
              <label hlmLabel>Note (optional)</label>
              <textarea hlmTextarea rows="3" [(ngModel)]="note" placeholder="What should they do with it?"></textarea>
            </div>
            <p class="text-muted-foreground text-xs">They get a message with the file, a follow-up task, and the file appears under "Shared with me" in Files.</p>
          </div>

          <hlm-sheet-footer class="border-t sm:flex-row sm:justify-end">
            <button hlmBtn variant="outline" (click)="close()">Cancel</button>
            <button hlmBtn [disabled]="!picked().length || busy()" (click)="send()">Send</button>
          </hlm-sheet-footer>
        </hlm-sheet-content>
      }
    </hlm-sheet>
  `,
})
export class SendFile {
  readonly store = inject(Store);
  private readonly files = inject(FileStore);
  private readonly ui = inject(Ui);

  readonly file = computed(() => {
    const id = this.ui.sendFile();
    return id ? this.store.state().files.find(f => f.id === id) ?? null : null;
  });
  readonly mode = signal<SendMode>('share');
  readonly picked = signal<string[]>([]);
  readonly busy = signal(false);
  note = '';

  /** Managers and executives first, then everyone else. */
  readonly groups = computed(() => {
    const me = this.store.currentUser().id;
    const others = this.store.users().filter(u => u.id !== me);
    const lead = others.filter(u => ['ceo', 'manager'].includes(u.roleId));
    const rest = others.filter(u => !lead.includes(u));
    return [{ label: 'Managers and executives', users: lead }, { label: 'Colleagues', users: rest }].filter(g => g.users.length);
  });

  constructor() {
    effect(() => {
      if (this.ui.sendFile()) untracked(() => { this.mode.set('share'); this.picked.set([]); this.note = ''; });
    });
  }

  setMode(m: SendMode) { this.mode.set(m); if (m !== 'share') this.picked.update(p => p.slice(0, 1)); }
  toggle(id: string, on: boolean) {
    this.picked.update(p => this.mode() === 'share' ? (on ? [...p, id] : p.filter(x => x !== id)) : (on ? [id] : []));
  }

  async send() {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    const names = this.picked().map(id => this.store.userName(id)).join(', ');
    await this.files.send(f.id, this.picked(), this.mode(), this.note);
    this.busy.set(false);
    toast.success('Sent to ' + names);
    this.close();
  }

  onState(s: string) { if (s === 'closed') this.close(); }
  close() { this.ui.sendFile.set(null); }
}
