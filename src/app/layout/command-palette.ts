import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { HlmCommandImports } from '@spartan-ng/helm/command';
import { Access } from '../core/access.service';
import { NAV_ITEMS } from '../core/roles';
import { Store } from '../core/store.service';
import { Theme } from '../core/theme.service';
import { Ui } from '../core/ui.service';
import { Tour } from '../core/tour.service';

/** Ctrl/Cmd+K: jump to any screen, workspace, record, contact or person, or run a quick action. */
@Component({
  selector: 'app-command-palette',
  imports: [HlmCommandImports, NgIcon],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <hlm-command-dialog [state]="ui.paletteOpen() ? 'open' : 'closed'" (stateChange)="ui.paletteOpen.set($event === 'open')"
                        dialogContentClass="w-[34rem] max-w-[calc(100vw-2rem)]" title="Search" description="Jump to a screen, record or person">
      <hlm-command>
        <hlm-command-input placeholder="Type to search screens, records, contacts, people..." />
        <div *hlmCommandEmptyState hlmCommandEmpty>No results found.</div>
        <hlm-command-list class="max-h-96">
          <hlm-command-group>
            <hlm-command-group-label>Go to</hlm-command-group-label>
            @for (i of navItems(); track i.key) {
              <button hlm-command-item [value]="'Go to ' + i.label" (selected)="go(i.key)">
                <ng-icon [name]="i.icon" /> {{ i.label }}
              </button>
            }
          </hlm-command-group>

          @if (actions().length) {
            <hlm-command-separator />
            <hlm-command-group>
              <hlm-command-group-label>Actions</hlm-command-group-label>
              @for (a of actions(); track a.label) {
                <button hlm-command-item [value]="a.label" (selected)="run(a.run)"><ng-icon [name]="a.icon" /> {{ a.label }}</button>
              }
            </hlm-command-group>
          }

          @if (access.visibleWorkspaces().length > 1) {
            <hlm-command-separator />
            <hlm-command-group>
              <hlm-command-group-label>Workspaces</hlm-command-group-label>
              @for (w of access.visibleWorkspaces(); track w.id) {
                <button hlm-command-item [value]="'Workspace ' + w.name" (selected)="openWorkspace(w.id)">
                  <ng-icon name="lucideBriefcase" /> {{ w.name }}
                </button>
              }
            </hlm-command-group>
          }

          @if (records().length) {
            <hlm-command-separator />
            <hlm-command-group>
              <hlm-command-group-label>Records</hlm-command-group-label>
              @for (r of records(); track r.id) {
                <button hlm-command-item [value]="r.title + ' ' + r.ws" (selected)="openRecord(r.id)">
                  <ng-icon name="lucideArrowRight" /> {{ r.title }}
                  <span class="text-muted-foreground ml-auto text-xs">{{ r.ws }}</span>
                </button>
              }
            </hlm-command-group>
          }

          @if (store.state().contacts.length) {
            <hlm-command-separator />
            <hlm-command-group>
              <hlm-command-group-label>Contacts</hlm-command-group-label>
              @for (c of store.state().contacts; track c.id) {
                <button hlm-command-item [value]="'Contact ' + c.name + ' ' + c.company" (selected)="openContact(c.id)">
                  <ng-icon name="lucideContactRound" /> {{ c.name }}
                  <span class="text-muted-foreground ml-auto text-xs">{{ c.company }}</span>
                </button>
              }
            </hlm-command-group>
          }

          <hlm-command-separator />
          <hlm-command-group>
            <hlm-command-group-label>Switch person</hlm-command-group-label>
            @for (u of store.users(); track u.id) {
              <button hlm-command-item [value]="'Switch to ' + u.name + ' ' + store.roleName(u.roleId)" (selected)="switchUser(u.id)">
                <ng-icon name="lucideUserCog" /> {{ u.name }}
                <span class="text-muted-foreground ml-auto text-xs">{{ store.roleName(u.roleId) }}</span>
              </button>
            }
          </hlm-command-group>
        </hlm-command-list>
      </hlm-command>
    </hlm-command-dialog>
  `,
})
export class CommandPalette {
  readonly ui = inject(Ui);
  readonly access = inject(Access);
  readonly store = inject(Store);
  private readonly tour = inject(Tour);
  private readonly router = inject(Router);
  private readonly theme = inject(Theme);

  readonly navItems = computed(() => NAV_ITEMS.filter(i => this.access.navAllowed(i.key)));

  readonly records = computed(() => this.access.visibleWorkspaces().flatMap(w =>
    this.access.recordsOf(w.id).map(r => ({ id: r.id, title: r.title, ws: w.name }))).slice(0, 60));

  readonly actions = computed(() => {
    const a: { label: string; icon: string; run: () => void }[] = [];
    const w = this.access.activeWorkspace();
    if (w && this.access.can('create')) a.push({ label: 'New ' + w.recordLabel.toLowerCase(), icon: 'lucidePlus', run: () => this.ui.openRecord() });
    if (w && this.access.can('create')) a.push({ label: 'Import ' + w.recordLabelPlural.toLowerCase() + ' from Excel or CSV', icon: 'lucideUpload', run: () => this.ui.importSheet.set(true) });
    if (this.access.can('create')) a.push({ label: 'New contact', icon: 'lucidePlus', run: () => this.ui.openContact() });
    a.push({ label: 'Take the tour', icon: 'lucideCompass', run: () => this.tour.start() });
    a.push({ label: 'Toggle dark mode', icon: 'lucideMoon', run: () => this.theme.mode.set(document.documentElement.classList.contains('dark') ? 'light' : 'dark') });
    return a;
  });

  onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.ui.paletteOpen.update(v => !v);
    }
  }

  private close() { this.ui.paletteOpen.set(false); }
  go(key: string) { this.close(); this.router.navigate(['/', key]); }
  run(fn: () => void) { this.close(); setTimeout(fn, 150); }
  openRecord(id: string) { this.close(); setTimeout(() => this.ui.openRecord(id), 150); }
  openContact(id: string) { this.close(); setTimeout(() => this.ui.openContact(id), 150); }
  openWorkspace(id: string) { this.close(); this.store.setActive(id); this.router.navigate(['/board']); }
  switchUser(id: string) { this.close(); this.store.setUser(id); this.router.navigate(['/', this.access.home()]); }
}
