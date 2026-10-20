import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly KEY = 'universal-crm-theme';
  readonly mode = signal<ThemeMode>(this.read());
  /** True while the dark palette is active (charts read this to recolour themselves). */
  readonly isDark = signal(false);

  constructor() {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = this.mode() === 'dark' || (this.mode() === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      this.isDark.set(dark);
    };
    effect(() => { apply(); try { localStorage.setItem(this.KEY, this.mode()); } catch { /* ignore */ } });
    media.addEventListener('change', apply);
  }

  private read(): ThemeMode {
    try { const v = localStorage.getItem(this.KEY); if (v === 'light' || v === 'dark' || v === 'system') return v; } catch { /* ignore */ }
    return 'system';
  }
}
