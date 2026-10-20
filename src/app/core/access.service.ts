import { Injectable, computed, inject } from '@angular/core';
import { Action, CrmRecord, NavKey, Workspace } from './models';
import { Store } from './store.service';

/** Permission helpers. Everything role-related in the UI goes through here. */
@Injectable({ providedIn: 'root' })
export class Access {
  private readonly store = inject(Store);

  readonly role = this.store.currentRole;

  readonly home = computed<NavKey>(() => {
    const r = this.role();
    return r.nav.includes(r.home) ? r.home : r.nav[0] ?? 'dashboard';
  });

  readonly visibleWorkspaces = computed(() => {
    const t = this.role().workspaceTemplates;
    return this.store.workspaces().filter(w => !t || t.includes(w.template));
  });

  readonly activeWorkspace = computed<Workspace | null>(() => {
    const v = this.visibleWorkspaces();
    return v.find(w => w.id === this.store.state().activeWorkspaceId) ?? v[0] ?? null;
  });

  can = (a: Action) => this.role().actions.includes(a);
  navAllowed = (k: NavKey) => this.role().nav.includes(k);

  recordVisible = (r: CrmRecord) =>
    this.role().recordScope !== 'own' || r.ownerId === this.store.state().currentUserId;

  /** Records of one workspace that the current role may see. */
  recordsOf(wsId: string): CrmRecord[] {
    return this.store.state().records.filter(r => r.wsId === wsId && this.recordVisible(r));
  }

  /** Money is hidden everywhere for roles without "viewMoney". */
  money(n: number | string | null | undefined): string {
    if (n === '' || n == null || isNaN(Number(n)) || !this.can('viewMoney')) return '';
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: this.store.state().settings.currency || 'USD', maximumFractionDigits: 0,
    }).format(Number(n));
  }

  /** Short form for chart labels, e.g. R1.2M. Empty when money is hidden. */
  moneyCompact(n: number | null | undefined): string {
    if (n == null || !this.can('viewMoney')) return '';
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: this.store.state().settings.currency || 'USD', notation: 'compact', maximumFractionDigits: 1,
    }).format(n);
  }

  visibleFields(w: Workspace) {
    return w.fields.filter(f => f.type !== 'money' || this.can('viewMoney'));
  }
}
