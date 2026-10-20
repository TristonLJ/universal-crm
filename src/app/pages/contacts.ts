import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { Access } from '../core/access.service';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-contacts',
  imports: [FormsModule, NgIcon, HlmAvatarImports, HlmButtonImports, HlmEmptyImports, HlmInputImports, HlmTableImports, PageHeader],
  template: `
    <app-page-header title="Contacts" [description]="rows().length + ' people and companies, shared by every workspace'">
      <div class="relative">
        <ng-icon name="lucideSearch" class="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
        <input hlmInput type="search" class="w-56 pl-8" placeholder="Search..." [ngModel]="search()" (ngModelChange)="search.set($event)">
      </div>
      @if (access.can('create')) {
        <button hlmBtn (click)="ui.openContact()"><ng-icon name="lucidePlus" /> New contact</button>
      }
    </app-page-header>

    @if (rows().length) {
      <div class="rounded-xl border">
        <div hlmTableContainer>
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr><th hlmTh>Name</th><th hlmTh>Company</th><th hlmTh>Email</th><th hlmTh>Phone</th><th hlmTh class="text-right">Linked</th></tr>
            </thead>
            <tbody hlmTBody>
              @for (c of rows(); track c.c.id) {
                <tr hlmTr class="cursor-pointer" (click)="ui.openContact(c.c.id)">
                  <td hlmTd>
                    <div class="flex items-center gap-3">
                      <hlm-avatar size="sm"><span hlmAvatarFallback>{{ initials(c.c.name) }}</span></hlm-avatar>
                      <span class="font-medium">{{ c.c.name }}</span>
                    </div>
                  </td>
                  <td hlmTd>{{ c.c.company }}</td><td hlmTd>{{ c.c.email }}</td><td hlmTd>{{ c.c.phone }}</td>
                  <td hlmTd class="text-muted-foreground text-right">{{ c.linked }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @else {
      <div hlmEmpty>
        <div hlmEmptyHeader>
          <div hlmEmptyTitle>No contacts found</div>
          <p hlmEmptyDescription>{{ search() ? 'Try a different search.' : 'Add the people and companies you work with.' }}</p>
        </div>
        @if (access.can('create') && !search()) {
          <div hlmEmptyContent><button hlmBtn (click)="ui.openContact()">Add the first contact</button></div>
        }
      </div>
    }
  `,
})
export class ContactsPage {
  readonly access = inject(Access);
  readonly ui = inject(Ui);
  private readonly store = inject(Store);

  readonly search = signal('');

  readonly rows = computed(() => {
    const q = this.search().toLowerCase();
    const st = this.store.state();
    return st.contacts
      .filter(c => !q || (c.name + c.company + c.email + c.phone).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(c => ({ c, linked: st.records.filter(r => r.contactId === c.id && this.access.recordVisible(r)).length }));
  });

  initials = (name: string) => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}
