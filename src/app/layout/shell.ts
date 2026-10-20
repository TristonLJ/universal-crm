import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmKbdImports } from '@spartan-ng/helm/kbd';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { filter, map } from 'rxjs';
import { Access } from '../core/access.service';
import { NavKey } from '../core/models';
import { NAV_ITEMS, NavGroup } from '../core/roles';
import { FileStore } from '../core/files';
import { Messages } from '../core/messages';
import { Store } from '../core/store.service';
import { Theme } from '../core/theme.service';
import { Ui } from '../core/ui.service';
import { CommandPalette } from './command-palette';
import { RecordSheet } from '../shared/record-sheet';
import { ContactSheet } from '../shared/contact-sheet';
import { ImportSheet } from '../shared/import-sheet';
import { Workbench } from '../shared/workbench';
import { SendFile } from '../shared/send-file';
import { FileViewer } from '../shared/file-viewer';
import { Tour } from '../core/tour.service';
import { TourOverlay } from './tour';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, NgIcon, HlmSidebarImports, HlmButtonImports, HlmDropdownMenuImports,
    HlmAvatarImports, HlmBadgeImports, HlmSeparatorImports, HlmKbdImports, HlmToasterImports,
    CommandPalette, RecordSheet, ContactSheet, ImportSheet, Workbench, SendFile, FileViewer, TourOverlay,
  ],
  template: `
    <div hlmSidebarWrapper>
      <hlm-sidebar collapsible="icon">
        <div hlmSidebarHeader>
          @if (access.activeWorkspace(); as w) {
            <button hlmSidebarMenuButton size="lg" data-tour="workspace" [hlmDropdownMenuTrigger]="workspaceMenu" tooltip="Switch workspace">
              <span class="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                <ng-icon name="lucideBriefcase" />
              </span>
              <span class="grid flex-1 text-left leading-tight">
                <span class="truncate font-semibold">{{ w.name }}</span>
                <span class="text-muted-foreground truncate text-xs">Universal CRM</span>
              </span>
              <ng-icon name="lucideChevronsUpDown" class="ml-auto" />
            </button>
          }
        </div>

        <div hlmSidebarContent>
          @for (g of groups(); track g.label) {
            <div hlmSidebarGroup>
              <div hlmSidebarGroupLabel>{{ g.label }}</div>
              <div hlmSidebarGroupContent>
                <ul hlmSidebarMenu>
                  @for (i of g.items; track i.key) {
                    <li hlmSidebarMenuItem>
                      <a hlmSidebarMenuButton [attr.data-tour]="'nav-' + i.key" [routerLink]="['/', i.key]" routerLinkActive #rla="routerLinkActive"
                         [isActive]="rla.isActive" [tooltip]="i.label">
                        <ng-icon [name]="i.icon" />
                        <span>{{ i.label }}</span>
                        @if (i.key === 'messages' && msgs.totalUnread()) {
                          <span class="ml-auto rounded-full px-1.5 text-xs font-medium text-white" [class]="msgs.totalMentions() ? 'bg-red-600' : 'bg-primary'">{{ msgs.totalUnread() }}</span>
                        }
                      </a>
                    </li>
                  }
                </ul>
              </div>
            </div>
          }
        </div>

        <div hlmSidebarFooter>
          <button hlmSidebarMenuButton size="lg" data-tour="viewing-as" [hlmDropdownMenuTrigger]="userMenu" tooltip="Switch person">
            <hlm-avatar size="sm"><span hlmAvatarFallback>{{ initials(store.currentUser().name) }}</span></hlm-avatar>
            <span class="grid flex-1 text-left leading-tight">
              <span class="truncate font-medium">{{ store.currentUser().name }}</span>
              <span class="text-muted-foreground truncate text-xs">{{ access.role().name }}</span>
            </span>
            <ng-icon name="lucideChevronsUpDown" class="ml-auto" />
          </button>
        </div>
      </hlm-sidebar>

      <main hlmSidebarInset>
        <header class="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <button hlmSidebarTrigger></button>
          <hlm-separator orientation="vertical" class="mx-1 h-5" />
          <h1 class="text-sm font-medium">{{ title() }}</h1>

          <div class="ml-auto flex items-center gap-2">
            <button hlmBtn variant="outline" size="sm" data-tour="search" class="text-muted-foreground hidden w-56 justify-start sm:inline-flex"
                    (click)="ui.paletteOpen.set(true)">
              <ng-icon name="lucideSearch" />
              <span class="flex-1 text-left">Search or jump to...</span>
              <kbd hlmKbd>Ctrl K</kbd>
            </button>
            <button hlmBtn variant="outline" size="icon-sm" class="sm:hidden" aria-label="Search" (click)="ui.paletteOpen.set(true)">
              <ng-icon name="lucideSearch" />
            </button>

            <button hlmBtn variant="outline" size="sm" aria-label="Take the tour" (click)="tour.start()">
              <ng-icon name="lucideCompass" /> <span class="hidden md:inline">Tour</span>
            </button>

            <span hlmBadge variant="secondary" class="hidden md:inline-flex">{{ access.role().name }}</span>

            <button hlmBtn variant="outline" size="icon-sm" [hlmDropdownMenuTrigger]="themeMenu" aria-label="Colour theme">
              <ng-icon [name]="theme.mode() === 'dark' ? 'lucideMoon' : theme.mode() === 'light' ? 'lucideSun' : 'lucideMonitor'" />
            </button>
          </div>
        </header>

        <div class="mx-auto w-full max-w-7xl p-4 md:p-6">
          @if (access.activeWorkspace()) { <router-outlet /> }
          @else { <p class="text-muted-foreground py-16 text-center">Your role has no access to any workspace. Ask an admin.</p> }
        </div>
      </main>
    </div>

    <ng-template #workspaceMenu>
      <hlm-dropdown-menu class="w-60">
        <hlm-dropdown-menu-label>Workspaces</hlm-dropdown-menu-label>
        <hlm-dropdown-menu-separator />
        @for (x of access.visibleWorkspaces(); track x.id) {
          <button hlmDropdownMenuItem (click)="store.setActive(x.id)">
            <span class="flex-1">{{ x.name }}</span>
            @if (x.id === access.activeWorkspace()?.id) { <ng-icon name="lucideCheck" /> }
          </button>
        }
        @if (access.can('configure')) {
          <hlm-dropdown-menu-separator />
          <button hlmDropdownMenuItem (click)="newWorkspace()"><ng-icon name="lucidePlus" /> New workspace...</button>
        }
      </hlm-dropdown-menu>
    </ng-template>

    <ng-template #userMenu>
      <hlm-dropdown-menu class="w-64">
        <hlm-dropdown-menu-label>Viewing as</hlm-dropdown-menu-label>
        <hlm-dropdown-menu-separator />
        @for (u of store.users(); track u.id) {
          <button hlmDropdownMenuItem (click)="switchUser(u.id)">
            <span class="flex-1">{{ u.name }}<span class="text-muted-foreground ml-2 text-xs">{{ store.roleName(u.roleId) }}</span></span>
            @if (u.id === store.currentUser().id) { <ng-icon name="lucideCheck" /> }
          </button>
        }
      </hlm-dropdown-menu>
    </ng-template>

    <ng-template #themeMenu>
      <hlm-dropdown-menu class="w-36">
        <button hlmDropdownMenuItem (click)="theme.mode.set('light')"><ng-icon name="lucideSun" /> Light</button>
        <button hlmDropdownMenuItem (click)="theme.mode.set('dark')"><ng-icon name="lucideMoon" /> Dark</button>
        <button hlmDropdownMenuItem (click)="theme.mode.set('system')"><ng-icon name="lucideMonitor" /> System</button>
      </hlm-dropdown-menu>
    </ng-template>

    <hlm-toaster />
    <app-command-palette />
    <app-record-sheet />
    <app-contact-sheet />
    <app-import-sheet />
    <app-workbench />
    <app-send-file />
    <app-file-viewer />
    <app-tour />
  `,
})
export class Shell {
  readonly store = inject(Store);
  readonly access = inject(Access);
  readonly theme = inject(Theme);
  readonly ui = inject(Ui);
  readonly msgs = inject(Messages);
  readonly tour = inject(Tour);
  private readonly router = inject(Router);

  readonly groups = computed(() => {
    const out: { label: NavGroup; items: typeof NAV_ITEMS }[] = [];
    for (const i of NAV_ITEMS.filter(n => this.access.navAllowed(n.key))) {
      let g = out.find(x => x.label === i.group);
      if (!g) { g = { label: i.group, items: [] }; out.push(g); }
      g.items.push(i);
    }
    return out;
  });

  private readonly url = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url });

  readonly title = computed(() => {
    const key = this.url().split('?')[0].replace(/^\/+/, '');
    return NAV_ITEMS.find(i => i.key === key)?.label ?? '';
  });

  constructor() {
    inject(FileStore).cleanup();
    setTimeout(() => this.tour.offerOnce(), 1200);   // first visit only
    // If the role changes while on a screen it no longer has, go to its home screen.
    effect(() => {
      const key = this.url().split('?')[0].replace(/^\/+/, '') as NavKey;
      if (NAV_ITEMS.some(i => i.key === key) && !this.access.navAllowed(key)) {
        this.router.navigate(['/', this.access.home()]);
      }
    });
  }

  newWorkspace() { this.router.navigate(['/settings']); }

  initials = (name: string) => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  switchUser(id: string) {
    this.store.setUser(id);
    this.router.navigate(['/', this.access.home()]);
  }
}
