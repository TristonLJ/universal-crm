import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import type { ApexOptions } from 'apexcharts';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { Access } from '../core/access.service';
import { Priority } from '../core/models';
import { Store } from '../core/store.service';
import { Ui } from '../core/ui.service';
import { dayOffset, stageOf, sumValues, today } from '../core/utils';
import { AppChart, ChartTokens } from '../shared/chart';
import { PageHeader } from '../shared/page-header';
import { StatCard } from '../shared/stat-card';

const PRIORITY_COLORS: Record<Priority, string> = { high: '#ef4444', medium: '#f59e0b', low: '#94a3b8' };
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, NgIcon, HlmButtonImports, HlmCardImports, PageHeader, StatCard, AppChart],
  template: `
    @if (data(); as d) {
      <app-page-header [title]="d.w.name" description="Where things stand right now.">
        @if (access.can('create')) {
          <button hlmBtn (click)="ui.openRecord()"><ng-icon name="lucidePlus" /> New {{ d.w.recordLabel.toLowerCase() }}</button>
        }
      </app-page-header>

      <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <app-stat-card [label]="'Open ' + d.w.recordLabelPlural.toLowerCase()" [value]="d.open.length" [sub]="access.money(d.openValue) || null" icon="lucideBriefcase" />
        <app-stat-card label="Won" [value]="d.won.length" [sub]="access.money(d.wonValue) || null" icon="lucideCheck" tone="text-emerald-600" />
        <app-stat-card label="Win rate" [value]="d.rate" [sub]="d.closed + ' closed'" icon="lucideStar" tone="text-amber-500" />
        <app-stat-card label="Overdue" [value]="d.overdue" [sub]="d.overdueTasks + ' tasks, ' + d.overdueRecs + ' ' + d.w.recordLabelPlural.toLowerCase()" icon="lucideCircleAlert" [tone]="d.overdue ? 'text-destructive' : 'text-muted-foreground'" />
        @if (access.can('reassign')) {
          <app-stat-card label="Unassigned" [value]="d.unassigned" sub="open, no owner" icon="lucideUsers" />
        }
      </div>

      <div class="grid gap-4 lg:grid-cols-5">
        <!-- pipeline -->
        <div hlmCard class="lg:col-span-3">
          <div hlmCardHeader class="flex flex-row items-start justify-between gap-2">
            <div><h3 hlmCardTitle>Pipeline</h3><p hlmCardDescription>{{ d.w.recordLabelPlural }} per stage</p></div>
            @if (access.can('viewMoney')) {
              <div class="bg-muted inline-flex rounded-lg p-0.5">
                <button hlmBtn size="xs" [variant]="metric() === 'count' ? 'outline' : 'ghost'" (click)="metric.set('count')">Count</button>
                <button hlmBtn size="xs" [variant]="metric() === 'value' ? 'outline' : 'ghost'" (click)="metric.set('value')">Value</button>
              </div>
            }
          </div>
          <div hlmCardContent><app-chart [build]="pipeline()" [height]="300" /></div>
        </div>

        <!-- win rate -->
        <div hlmCard class="lg:col-span-2">
          <div hlmCardHeader><h3 hlmCardTitle>Win rate</h3><p hlmCardDescription>Won vs lost, all time</p></div>
          <div hlmCardContent>
            <app-chart [build]="winRate()" [height]="230" />
            <div class="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
              <div><div class="text-lg font-semibold text-emerald-600">{{ d.won.length }}</div><div class="text-muted-foreground text-xs">Won</div></div>
              <div><div class="text-lg font-semibold text-red-500">{{ d.lost }}</div><div class="text-muted-foreground text-xs">Lost</div></div>
              <div><div class="text-lg font-semibold">{{ d.open.length }}</div><div class="text-muted-foreground text-xs">Still open</div></div>
            </div>
          </div>
        </div>

        <!-- due load -->
        <div hlmCard class="lg:col-span-3">
          <div hlmCardHeader><h3 hlmCardTitle>Due-date load</h3><p hlmCardDescription>Open {{ d.w.recordLabelPlural.toLowerCase() }} due over the next two weeks, by priority</p></div>
          <div hlmCardContent><app-chart [build]="dueLoad()" [height]="280" /></div>
        </div>

        <!-- priority mix -->
        <div hlmCard class="lg:col-span-2">
          <div hlmCardHeader><h3 hlmCardTitle>Priority mix</h3><p hlmCardDescription>How urgent the open work is</p></div>
          <div hlmCardContent><app-chart [build]="priorityMix()" [height]="280" /></div>
        </div>

        <!-- workload -->
        <div hlmCard class="lg:col-span-3">
          <div hlmCardHeader><h3 hlmCardTitle>Workload</h3><p hlmCardDescription>Open work per person, by priority</p></div>
          <div hlmCardContent><app-chart [build]="workload()" [height]="workloadHeight()" /></div>
        </div>

        <!-- attention -->
        <div hlmCard class="lg:col-span-2">
          <div hlmCardHeader><h3 hlmCardTitle>Needs attention</h3><p hlmCardDescription>Overdue or without an owner</p></div>
          <div hlmCardContent>
            @for (r of d.attention; track r.id) {
              <button type="button" class="hover:bg-muted -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 py-2 text-left" (click)="ui.openRecord(r.id)">
                <span class="truncate text-sm font-medium">{{ r.title }}</span>
                <span class="text-xs whitespace-nowrap" [class.text-destructive]="r.dueDate && r.dueDate < today" [class.text-muted-foreground]="!(r.dueDate && r.dueDate < today)">
                  {{ r.dueDate && r.dueDate < today ? 'Due ' + (r.dueDate | date: 'd MMM') : 'Unassigned' }}
                </span>
              </button>
            } @empty { <p class="text-muted-foreground py-6 text-center text-sm">Nothing needs attention.</p> }
          </div>
        </div>

        <div hlmCard class="lg:col-span-5">
          <div hlmCardHeader><h3 hlmCardTitle>Recent activity</h3></div>
          <div hlmCardContent class="divide-y">
            @for (a of d.recent; track a.a.id) {
              <button type="button" class="hover:bg-muted -mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 px-2 py-2 text-left text-sm" (click)="ui.openRecord(a.rec.id)">
                <span><strong class="mr-1.5">{{ a.rec.title }}</strong><span class="text-muted-foreground">{{ a.a.text }}</span></span>
                <span class="text-muted-foreground text-xs whitespace-nowrap">{{ a.a.at | date: 'd MMM, HH:mm' }}</span>
              </button>
            } @empty { <p class="text-muted-foreground py-6 text-center text-sm">Nothing yet.</p> }
          </div>
        </div>
      </div>
    }
  `,
})
export class DashboardPage {
  readonly access = inject(Access);
  readonly ui = inject(Ui);
  private readonly store = inject(Store);
  readonly today = today();
  readonly metric = signal<'count' | 'value'>('count');

  readonly data = computed(() => {
    const w = this.access.activeWorkspace();
    if (!w) return null;
    const st = this.store.state();
    const recs = this.access.recordsOf(w.id);
    const kind = (k: string) => recs.filter(r => stageOf(w, r.stageId).kind === k);
    const open = kind('open'), won = kind('won'), lost = kind('lost');
    const overdueTasks = st.tasks.filter(t => t.wsId === w.id && !t.done && t.due && t.due < today()).length;
    const overdueRecs = open.filter(r => r.dueDate && r.dueDate < today());
    const closed = won.length + lost.length;
    const byStage = w.stages.map(stage => {
      const rs = recs.filter(r => r.stageId === stage.id);
      return { stage, count: rs.length, value: sumValues(rs) };
    });
    const attention = open.filter(r => (r.dueDate && r.dueDate < today()) || !r.ownerId)
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 6);
    const recent = st.activities.map(a => ({ a, rec: recs.find(r => r.id === a.recordId)! })).filter(x => x.rec)
      .sort((x, y) => y.a.at.localeCompare(x.a.at)).slice(0, 6);
    return {
      w, recs, open, won, lost: lost.length, closed, overdueTasks, overdueRecs: overdueRecs.length, overdue: overdueTasks + overdueRecs.length,
      openValue: sumValues(open), wonValue: sumValues(won), winPct: closed ? Math.round(won.length / closed * 100) : 0,
      rate: closed ? Math.round(won.length / closed * 100) + '%' : '-',
      unassigned: open.filter(r => !r.ownerId).length, byStage, attention, recent,
    };
  });

  /** Horizontal funnel, one bar per stage in the stage's own colour. Toggle between count and value. */
  readonly pipeline = computed(() => {
    const d = this.data();
    const byValue = this.metric() === 'value' && this.access.can('viewMoney');
    const fmt = (v: number) => byValue ? this.access.moneyCompact(v) : String(v);
    return (t: ChartTokens): ApexOptions => !d ? {} : ({
      chart: { type: 'bar' },
      series: [{ name: byValue ? 'Value' : d.w.recordLabelPlural, data: d.byStage.map(s => byValue ? s.value : s.count) }],
      colors: d.byStage.map(s => s.stage.color),
      plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 6, borderRadiusApplication: 'end', barHeight: '64%' } },
      xaxis: { categories: d.byStage.map(s => s.stage.name), labels: { formatter: (v: string) => byValue ? this.access.moneyCompact(Number(v)) : String(Math.round(Number(v))) }, axisBorder: { show: false } },
      yaxis: { labels: { style: { colors: t.fg, fontSize: '13px' } } },
      dataLabels: { enabled: true, formatter: (v: number) => fmt(v), style: { colors: ['#fff'], fontWeight: 600 }, dropShadow: { enabled: false } },
      legend: { show: false },
      tooltip: { y: { formatter: (v: number) => byValue ? this.access.money(v) : v + ' ' + d.w.recordLabelPlural.toLowerCase() } },
    });
  });

  /** Radial gauge of won / (won + lost). */
  readonly winRate = computed(() => {
    const d = this.data();
    return (t: ChartTokens): ApexOptions => ({
      chart: { type: 'radialBar' },
      series: [d?.winPct ?? 0], labels: ['Win rate'], colors: ['#10b981'],
      stroke: { lineCap: 'round' },
      plotOptions: { radialBar: {
        startAngle: -120, endAngle: 120, hollow: { size: '62%' }, track: { background: t.track, strokeWidth: '100%' },
        dataLabels: {
          name: { offsetY: 22, color: t.muted, fontSize: '13px' },
          value: { offsetY: -14, color: t.fg, fontSize: '34px', fontWeight: 600, formatter: (v: number) => Math.round(v) + '%' },
        },
      } },
    });
  });

  /** Open records bucketed by due day (overdue first), stacked by priority. */
  readonly dueLoad = computed(() => {
    const d = this.data();
    const days = 14;
    const keys = ['overdue', ...Array.from({ length: days }, (_, i) => dayOffset(i))];
    const labels = keys.map((k, i) => i === 0 ? 'Overdue' : i === 1 ? 'Today'
      : new Date(k + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }));
    const counts = Object.fromEntries(PRIORITIES.map(p => [p, keys.map(() => 0)])) as Record<Priority, number[]>;
    for (const r of d?.open ?? []) {
      if (!r.dueDate) continue;
      const i = r.dueDate < today() ? 0 : keys.indexOf(r.dueDate);
      if (i >= 0) counts[r.priority][i]++;
    }
    return (t: ChartTokens): ApexOptions => ({
      chart: { type: 'bar', stacked: true },
      series: PRIORITIES.map(p => ({ name: cap(p), data: counts[p] })),
      colors: PRIORITIES.map(p => PRIORITY_COLORS[p]),
      plotOptions: { bar: { columnWidth: '58%', borderRadius: 4, borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last' } },
      xaxis: { categories: labels, labels: { rotate: -45, rotateAlways: false, style: { fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { formatter: (v: number) => String(Math.round(v)) }, forceNiceScale: true, min: 0 },
      legend: { position: 'top', horizontalAlign: 'right' },
      annotations: { xaxis: [{ x: 'Overdue', borderColor: 'transparent', fillColor: t.dark ? '#7f1d1d' : '#fee2e2', opacity: 0.25 }] },
    });
  });

  /** Donut of open records by priority with the total in the middle. */
  readonly priorityMix = computed(() => {
    const open = this.data()?.open ?? [];
    return (t: ChartTokens): ApexOptions => ({
      chart: { type: 'donut' },
      series: PRIORITIES.map(p => open.filter(r => r.priority === p).length),
      labels: PRIORITIES.map(cap), colors: PRIORITIES.map(p => PRIORITY_COLORS[p]),
      stroke: { width: 3, colors: [t.dark ? '#18181b' : '#ffffff'] },
      plotOptions: { pie: { donut: { size: '70%', labels: {
        show: true, name: { color: t.muted, fontSize: '13px' },
        value: { color: t.fg, fontSize: '28px', fontWeight: 600 },
        total: { show: true, label: 'Open', color: t.muted, fontSize: '13px', formatter: (w: { globals: { seriesTotals: number[] } }) => String(w.globals.seriesTotals.reduce((a, b) => a + b, 0)) },
      } } } },
      legend: { position: 'bottom' },
    });
  });

  private readonly workloadRows = computed(() => {
    const open = this.data()?.open ?? [];
    const rows = this.store.users().map(u => ({ name: u.name, recs: open.filter(r => r.ownerId === u.id) })).filter(x => x.recs.length);
    const un = open.filter(r => !r.ownerId);
    if (un.length) rows.push({ name: 'Unassigned', recs: un });
    return rows.sort((a, b) => b.recs.length - a.recs.length);
  });
  readonly workloadHeight = computed(() => Math.max(160, this.workloadRows().length * 48 + 70));

  /** Stacked horizontal bars: who is carrying what, split by priority. */
  readonly workload = computed(() => {
    const rows = this.workloadRows();
    return (t: ChartTokens): ApexOptions => ({
      chart: { type: 'bar', stacked: true },
      series: PRIORITIES.map(p => ({ name: cap(p), data: rows.map(r => r.recs.filter(x => x.priority === p).length) })),
      colors: PRIORITIES.map(p => PRIORITY_COLORS[p]),
      plotOptions: { bar: { horizontal: true, barHeight: '58%', borderRadius: 4, borderRadiusWhenStacked: 'last', borderRadiusApplication: 'end' } },
      xaxis: { categories: rows.map(r => r.name), labels: { formatter: (v: string) => String(Math.round(Number(v))) }, axisBorder: { show: false } },
      yaxis: { labels: { style: { colors: t.fg, fontSize: '13px' } } },
      legend: { position: 'top', horizontalAlign: 'right' },
    });
  });
}
