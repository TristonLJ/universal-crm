import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { ApexOptions } from 'apexcharts';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { Access } from '../core/access.service';
import { Store } from '../core/store.service';
import { stageOf, sumValues, today } from '../core/utils';
import { AppChart, CHART_COLORS, ChartTokens } from '../shared/chart';
import { PageHeader } from '../shared/page-header';
import { StatCard } from '../shared/stat-card';

@Component({
  selector: 'app-company',
  imports: [HlmCardImports, HlmTableImports, PageHeader, StatCard, AppChart],
  template: `
    <app-page-header title="Company overview" description="Every workspace you can see, side by side." />

    <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <app-stat-card label="Open items" [value]="d().allOpen.length" [sub]="access.money(d().openValue) || null" icon="lucideBriefcase" />
      <app-stat-card label="Won" [value]="d().won" [sub]="access.money(d().wonValue) || null" icon="lucideCheck" tone="text-emerald-600" />
      <app-stat-card label="Overdue" [value]="d().overdue" [sub]="'across ' + d().rows.length + ' workspaces'" icon="lucideCircleAlert" [tone]="d().overdue ? 'text-destructive' : 'text-muted-foreground'" />
      <app-stat-card label="Unassigned" [value]="d().unassigned" sub="open, no owner" icon="lucideUsers" />
    </div>

    <div class="mb-6 grid gap-4 lg:grid-cols-5">
      <div hlmCard class="lg:col-span-3">
        <div hlmCardHeader><h3 hlmCardTitle>Workspaces compared</h3><p hlmCardDescription>Open, won and lost per workspace</p></div>
        <div hlmCardContent><app-chart [build]="compare()" [height]="300" /></div>
      </div>
      <div hlmCard class="lg:col-span-2">
        <div hlmCardHeader>
          <h3 hlmCardTitle>{{ access.can('viewMoney') ? 'Open value by workspace' : 'Open items by workspace' }}</h3>
          <p hlmCardDescription>Where the pipeline sits</p>
        </div>
        <div hlmCardContent><app-chart [build]="share()" [height]="300" /></div>
      </div>
      <div hlmCard class="lg:col-span-5">
        <div hlmCardHeader><h3 hlmCardTitle>Who works where</h3><p hlmCardDescription>Open work per person, split by workspace</p></div>
        <div hlmCardContent><app-chart [build]="people()" [height]="peopleHeight()" /></div>
      </div>
    </div>

    <div hlmCard>
      <div hlmCardHeader><h3 hlmCardTitle>Workspaces</h3><p hlmCardDescription>Click a row to open its board.</p></div>
      <div hlmCardContent>
        <div hlmTableContainer>
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh>Workspace</th><th hlmTh>Open</th>
                @if (access.can('viewMoney')) { <th hlmTh>Open value</th> }
                <th hlmTh>Won</th>
                @if (access.can('viewMoney')) { <th hlmTh>Won value</th> }
                <th hlmTh>Win rate</th><th hlmTh>Overdue</th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (r of d().rows; track r.w.id) {
                <tr hlmTr class="cursor-pointer" (click)="open(r.w.id)">
                  <td hlmTd class="font-medium">{{ r.w.name }}</td>
                  <td hlmTd>{{ r.open.length }}</td>
                  @if (access.can('viewMoney')) { <td hlmTd>{{ r.openValue ? access.money(r.openValue) : '-' }}</td> }
                  <td hlmTd>{{ r.won.length }}</td>
                  @if (access.can('viewMoney')) { <td hlmTd>{{ r.wonValue ? access.money(r.wonValue) : '-' }}</td> }
                  <td hlmTd>{{ r.rate === null ? '-' : r.rate + '%' }}</td>
                  <td hlmTd [class.text-destructive]="r.overdue" [class.font-semibold]="r.overdue">{{ r.overdue }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class CompanyPage {
  readonly access = inject(Access);
  private readonly store = inject(Store);
  private readonly router = inject(Router);

  readonly d = computed(() => {
    const rows = this.access.visibleWorkspaces().map(w => {
      const rs = this.access.recordsOf(w.id);
      const kind = (k: string) => rs.filter(r => stageOf(w, r.stageId).kind === k);
      const open = kind('open'), won = kind('won'), lost = kind('lost');
      return {
        w, open, won, lost, openValue: sumValues(open), wonValue: sumValues(won),
        rate: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null,
        overdue: open.filter(r => r.dueDate && r.dueDate < today()).length,
      };
    });
    const allOpen = rows.flatMap(r => r.open);
    return {
      rows, allOpen, unassigned: allOpen.filter(r => !r.ownerId).length,
      openValue: sumValues(allOpen), won: rows.reduce((t, r) => t + r.won.length, 0),
      wonValue: rows.reduce((t, r) => t + r.wonValue, 0), overdue: rows.reduce((t, r) => t + r.overdue, 0),
    };
  });

  /** Stacked columns: how each workspace splits into open / won / lost. */
  readonly compare = computed(() => {
    const rows = this.d().rows;
    return (_t: ChartTokens): ApexOptions => ({
      chart: { type: 'bar', stacked: true },
      series: [
        { name: 'Open', data: rows.map(r => r.open.length) },
        { name: 'Won', data: rows.map(r => r.won.length) },
        { name: 'Lost', data: rows.map(r => r.lost.length) },
      ],
      colors: ['#6366f1', '#10b981', '#ef4444'],
      plotOptions: { bar: { columnWidth: '48%', borderRadius: 5, borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last' } },
      xaxis: { categories: rows.map(r => r.w.name), axisBorder: { show: false }, axisTicks: { show: false }, labels: { trim: true, rotate: 0, style: { fontSize: '12px' } } },
      yaxis: { labels: { formatter: (v: number) => String(Math.round(v)) }, min: 0, forceNiceScale: true },
      dataLabels: { enabled: true, style: { colors: ['#fff'], fontWeight: 600 }, dropShadow: { enabled: false } },
      legend: { position: 'top', horizontalAlign: 'right' },
    });
  });

  /** Donut: share of open value (or open count when money is hidden) per workspace. */
  readonly share = computed(() => {
    const rows = this.d().rows;
    const byValue = this.access.can('viewMoney');
    const vals = rows.map(r => byValue ? r.openValue : r.open.length);
    return (t: ChartTokens): ApexOptions => ({
      chart: { type: 'donut' },
      series: vals, labels: rows.map(r => r.w.name), colors: CHART_COLORS,
      stroke: { width: 3, colors: [t.dark ? '#18181b' : '#ffffff'] },
      plotOptions: { pie: { donut: { size: '68%', labels: {
        show: true, name: { color: t.muted, fontSize: '13px' }, value: { color: t.fg, fontSize: '24px', fontWeight: 600,
          formatter: (v: string) => byValue ? this.access.moneyCompact(Number(v)) : v },
        total: { show: true, label: byValue ? 'Open value' : 'Open items', color: t.muted, fontSize: '13px',
          formatter: (w: { globals: { seriesTotals: number[] } }) => { const n = w.globals.seriesTotals.reduce((a, b) => a + b, 0); return byValue ? this.access.moneyCompact(n) : String(n); } },
      } } } },
      dataLabels: { enabled: false },
      legend: { position: 'bottom' },
      tooltip: { y: { formatter: (v: number) => byValue ? this.access.money(v) : v + ' open' } },
    });
  });

  private readonly peopleRows = computed(() => {
    const rows = this.d().rows;
    const all = rows.flatMap(r => r.open.map(rec => ({ rec, ws: r.w.name })));
    const people = this.store.users().map(u => ({ name: u.name, id: u.id }));
    const list = people.map(p => ({ name: p.name, items: all.filter(x => x.rec.ownerId === p.id) }));
    const un = all.filter(x => !x.rec.ownerId);
    if (un.length) list.push({ name: 'Unassigned', items: un });
    return list.filter(x => x.items.length).sort((a, b) => b.items.length - a.items.length);
  });
  readonly peopleHeight = computed(() => Math.max(180, this.peopleRows().length * 46 + 80));

  /** Horizontal stacked bars: each person's open work split by workspace. */
  readonly people = computed(() => {
    const list = this.peopleRows();
    const wsNames = this.d().rows.map(r => r.w.name);
    return (t: ChartTokens): ApexOptions => ({
      chart: { type: 'bar', stacked: true },
      series: wsNames.map(n => ({ name: n, data: list.map(p => p.items.filter(x => x.ws === n).length) })),
      colors: CHART_COLORS,
      plotOptions: { bar: { horizontal: true, barHeight: '58%', borderRadius: 4, borderRadiusWhenStacked: 'last', borderRadiusApplication: 'end' } },
      xaxis: { categories: list.map(p => p.name), labels: { formatter: (v: string) => String(Math.round(Number(v))) }, axisBorder: { show: false } },
      yaxis: { labels: { style: { colors: t.fg, fontSize: '13px' } } },
      legend: { position: 'top', horizontalAlign: 'right' },
    });
  });

  open(wsId: string) { this.store.setActive(wsId); this.router.navigate(['/board']); }
}
