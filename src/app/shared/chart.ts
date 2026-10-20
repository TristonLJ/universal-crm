import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import ApexCharts from 'apexcharts';
import type { ApexOptions } from 'apexcharts';
import { Theme } from '../core/theme.service';

/** Colours handed to each chart so it matches the current light/dark theme. */
export interface ChartTokens { fg: string; muted: string; grid: string; track: string; dark: boolean; }

export const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(out[k], over[k]);
  return out as T;
}

/** Thin ApexCharts wrapper: themed defaults, live updates when the data, role or theme changes. */
@Component({
  selector: 'app-chart',
  host: { class: 'block w-full' },
  template: '<div #host></div>',
})
export class AppChart {
  private readonly theme = inject(Theme);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  /** Build the chart options from theme tokens (so colours follow light/dark mode). */
  readonly build = input.required<(t: ChartTokens) => ApexOptions>();
  readonly height = input<number>(280);

  private readonly ready = signal(false);
  private chart?: ApexCharts;
  private lastWidth = 0;
  private resizeTimer?: ReturnType<typeof setTimeout>;

  private readonly tokens = computed<ChartTokens>(() => this.theme.isDark()
    ? { fg: '#fafafa', muted: '#a1a1aa', grid: '#27272a', track: '#27272a', dark: true }
    : { fg: '#18181b', muted: '#71717a', grid: '#e4e4e7', track: '#f4f4f5', dark: false });

  constructor() {
    afterNextRender(() => this.ready.set(true));

    effect(() => {
      if (!this.ready()) return;
      const t = this.tokens();
      const opts = deepMerge<ApexOptions>({
        chart: {
          height: this.height(), toolbar: { show: false }, background: 'transparent', foreColor: t.muted,
          fontFamily: 'inherit', animations: { enabled: true, speed: 450 }, zoom: { enabled: false },
          // Resizing is handled below (debounced) to avoid redraw loops when scrollbars appear.
          redrawOnParentResize: false, redrawOnWindowResize: false,
        },
        grid: { borderColor: t.grid, strokeDashArray: 4 },
        theme: { mode: t.dark ? 'dark' : 'light' },
        tooltip: { theme: t.dark ? 'dark' : 'light' },
        dataLabels: { enabled: false },
        legend: { labels: { colors: t.muted }, markers: { size: 6 }, itemMargin: { horizontal: 8 } },
        states: { hover: { filter: { type: 'lighten' } }, active: { filter: { type: 'none' } } },
        noData: { text: 'Nothing to chart yet', style: { color: t.muted } },
      }, this.build()(t));

      untracked(() => {
        if (!this.chart) {
          const el = this.host().nativeElement;
          this.lastWidth = Math.round(el.clientWidth);
          this.chart = new ApexCharts(el, opts);
          this.chart.render();
          this.watchResize(el);
        } else {
          this.chart.updateOptions(opts, false, true);
        }
      });
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.resizeTimer);
      this.observer?.disconnect();
      this.chart?.destroy();
    });
  }

  private observer?: ResizeObserver;

  /** Redraw at the new width, debounced, and only when the width really changed. */
  private watchResize(el: HTMLElement) {
    this.observer = new ResizeObserver(() => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        const w = Math.round(el.clientWidth);
        if (w > 0 && Math.abs(w - this.lastWidth) > 8) {
          this.lastWidth = w;
          this.chart?.updateOptions({ chart: { width: w } }, false, false);
        }
      }, 200);
    });
    this.observer.observe(el);
  }
}
