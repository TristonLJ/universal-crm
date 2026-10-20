import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSheetImports } from '@spartan-ng/helm/sheet';
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';
import { Access } from '../core/access.service';
import { Contact } from '../core/models';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';

interface Draft { c: Contact; existing: boolean; editable: boolean; }

@Component({
  selector: 'app-contact-sheet',
  imports: [FormsModule, NgIcon, HlmSheetImports, HlmButtonImports, HlmInputImports, HlmLabelImports, HlmTextareaImports],
  template: `
    <hlm-sheet side="right" [state]="open() ? 'open' : 'closed'" (stateChanged)="onState($event)">
      @if (draft(); as d) {
        <hlm-sheet-content *hlmSheetPortal="let ctx" class="w-full gap-0 data-[side=right]:sm:max-w-md">
          <hlm-sheet-header class="border-b">
            <h3 hlmSheetTitle>{{ !d.editable ? 'View contact' : d.existing ? 'Edit contact' : 'New contact' }}</h3>
            <p hlmSheetDescription>Contacts are shared by every workspace.</p>
          </hlm-sheet-header>

          <div class="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div class="grid gap-1.5"><label hlmLabel>Name *</label>
              <input hlmInput [class.border-destructive]="invalid()" [(ngModel)]="d.c.name" [disabled]="!d.editable"></div>
            <div class="grid grid-cols-2 gap-4">
              <div class="grid gap-1.5"><label hlmLabel>Company</label><input hlmInput [(ngModel)]="d.c.company" [disabled]="!d.editable"></div>
              <div class="grid gap-1.5"><label hlmLabel>Phone</label><input hlmInput type="tel" [(ngModel)]="d.c.phone" [disabled]="!d.editable"></div>
            </div>
            <div class="grid gap-1.5"><label hlmLabel>Email</label><input hlmInput type="email" [(ngModel)]="d.c.email" [disabled]="!d.editable"></div>
            <div class="grid gap-1.5"><label hlmLabel>Notes</label><textarea hlmTextarea rows="4" [(ngModel)]="d.c.notes" [disabled]="!d.editable"></textarea></div>

            @if (linked().length) {
              <div>
                <h4 class="mb-2 text-sm font-medium">Linked records</h4>
                <div class="divide-y rounded-md border">
                  @for (r of linked(); track r.id) {
                    <button type="button" class="hover:bg-muted flex w-full items-center justify-between px-3 py-2 text-left text-sm" (click)="openRecord(r.id)">
                      <span>{{ r.title }}</span>
                      <span class="text-muted-foreground text-xs">{{ store.workspace(r.wsId)?.name }}</span>
                    </button>
                  }
                </div>
              </div>
            }
          </div>

          <hlm-sheet-footer class="border-t sm:flex-row sm:justify-between">
            @if (d.existing && access.can('delete')) {
              <button hlmBtn variant="destructive" (click)="remove(d)"><ng-icon name="lucideTrash2" /> Delete</button>
            } @else { <span></span> }
            @if (d.editable) {
              <div class="flex gap-2">
                <button hlmBtn variant="outline" (click)="close()">Cancel</button>
                <button hlmBtn (click)="save(d)">Save</button>
              </div>
            } @else { <span class="text-muted-foreground self-center text-sm">Read-only for your role</span> }
          </hlm-sheet-footer>
        </hlm-sheet-content>
      }
    </hlm-sheet>
  `,
})
export class ContactSheet {
  readonly store = inject(Store);
  readonly access = inject(Access);
  private readonly ui = inject(Ui);

  readonly draft = signal<Draft | null>(null);
  readonly open = signal(false);
  readonly invalid = signal(false);

  constructor() {
    effect(() => {
      const req = this.ui.contactSheet();
      untracked(() => this.show(req));
    });
  }

  private show(req: { id?: string } | null) {
    if (!req) { this.open.set(false); return; }
    const ex = req.id ? this.store.state().contacts.find(c => c.id === req.id) : undefined;
    this.invalid.set(false);
    this.draft.set({
      c: ex ? { ...ex } : { id: '', name: '', company: '', email: '', phone: '', notes: '' },
      existing: !!ex, editable: ex ? this.access.can('edit') : this.access.can('create'),
    });
    this.open.set(true);
  }

  linked = () => {
    const id = this.draft()?.c.id;
    return id ? this.store.state().records.filter(r => r.contactId === id && this.access.recordVisible(r)) : [];
  };

  onState(s: string) { if (s === 'closed') this.close(); }
  close() { this.ui.contactSheet.set(null); }
  openRecord(id: string) { this.ui.contactSheet.set(null); setTimeout(() => this.ui.openRecord(id), 150); }

  save(d: Draft) {
    if (!d.c.name.trim()) { this.invalid.set(true); return; }
    d.c.name = d.c.name.trim();
    this.store.saveContact(d.c);
    toast.success('Contact saved');
    this.close();
  }

  remove(d: Draft) {
    const snapshot = this.store.state();
    this.store.deleteContact(d.c.id);
    this.close();
    toast('Deleted "' + d.c.name + '"', { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } });
  }
}
