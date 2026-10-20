import { Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { Tour, TourStep } from '../core/tour.service';

const PAD = 8, CARD_W = 360, CARD_H = 250, GAP = 14, MARGIN = 16;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Dims the page, lights up the thing being explained and shows a card next to it. */
@Component({
  selector: 'app-tour',
  imports: [NgIcon, HlmButtonImports],
  template: `
    @if (tour.step(); as s) {
      <!-- the transparent layer stops clicks reaching the page while the tour runs -->
      <div class="fixed inset-0 z-[9998]" (click)="$event.stopPropagation()"></div>

      @if (hole(); as h) {
        <div class="ring-primary pointer-events-none fixed z-[9998] rounded-xl ring-2 transition-all duration-300"
             [style.left.px]="h.left" [style.top.px]="h.top" [style.width.px]="h.width" [style.height.px]="h.height"
             style="box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.6)"></div>
      } @else {
        <div class="pointer-events-none fixed inset-0 z-[9998] bg-black/60"></div>
      }

      <div class="bg-popover text-popover-foreground fixed z-[9999] rounded-xl border p-5 shadow-2xl transition-all duration-300"
           role="dialog" aria-live="polite" [attr.aria-label]="s.title"
           [style.width.px]="cardW()" [style.left.px]="pos().left" [style.top.px]="pos().top">
        <div class="text-muted-foreground mb-1 text-xs">{{ s.invite ? 'Guided tour' : 'Step ' + (tour.index() + 1) + ' of ' + tour.steps().length }}</div>
        <h3 class="mb-2 text-lg font-semibold tracking-tight">{{ s.title }}</h3>
        <p class="text-muted-foreground text-sm leading-relaxed">{{ s.body(tour.who()) }}</p>

        @if (!s.invite) {
          <div class="mt-4 flex gap-1" aria-hidden="true">
            @for (x of tour.steps(); track x.id; let i = $index) {
              <span class="h-1.5 flex-1 rounded-full" [class]="i <= tour.index() ? 'bg-primary' : 'bg-muted'"></span>
            }
          </div>
        }

        <div class="mt-4 flex items-center justify-between gap-2">
          @if (s.invite) {
            <button hlmBtn variant="ghost" size="sm" (click)="tour.end()">Not now</button>
            <button hlmBtn (click)="tour.next()">Take the tour <ng-icon name="lucideArrowRight" /></button>
          } @else {
            <button hlmBtn variant="ghost" size="sm" (click)="tour.end()">{{ tour.isLast() ? '' : 'Skip tour' }}</button>
            <div class="flex gap-2">
              @if (tour.index() > 0) { <button hlmBtn variant="outline" size="sm" (click)="tour.back()"><ng-icon name="lucideArrowLeft" /> Back</button> }
              <button hlmBtn size="sm" (click)="tour.next()">{{ tour.isLast() ? 'Finish' : 'Next' }} @if (!tour.isLast()) { <ng-icon name="lucideArrowRight" /> }</button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class TourOverlay {
  readonly tour = inject(Tour);
  private readonly router = inject(Router);

  private readonly target = signal<DOMRect | null>(null);
  private readonly view = signal({ w: innerWidth, h: innerHeight });

  readonly cardW = computed(() => Math.min(CARD_W, this.view().w - MARGIN * 2));

  /** The lit-up area: the target's box with a little breathing room. */
  readonly hole = computed(() => {
    const r = this.target();
    return r ? { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } : null;
  });

  /** Where the card goes: beside sidebar items, below or above other things, or in the middle when there is no target. */
  readonly pos = computed(() => {
    const { w, h } = this.view(), cw = this.cardW(), r = this.target();
    const clampX = (x: number) => Math.max(MARGIN, Math.min(x, w - cw - MARGIN));
    const clampY = (y: number) => Math.max(MARGIN, Math.min(y, h - CARD_H - MARGIN));
    if (!r) return { left: (w - cw) / 2, top: Math.max(MARGIN, (h - CARD_H) / 2) };
    if (r.right < w * 0.35 && r.width < 360 && w - r.right > cw + MARGIN * 2) return { left: r.right + PAD + GAP, top: clampY(r.top - 20) };
    if (r.bottom + PAD + GAP + CARD_H < h) return { left: clampX(r.left), top: r.bottom + PAD + GAP };
    if (r.top - PAD - GAP - CARD_H > 0) return { left: clampX(r.left), top: r.top - PAD - GAP - CARD_H };
    return { left: clampX(r.left + r.width / 2 - cw / 2), top: h - CARD_H - MARGIN };   // target fills the screen: card floats at the bottom
  });

  constructor() {
    effect(() => {
      const s = this.tour.step();
      untracked(() => this.focus(s));
    });
  }

  /** Go to the right screen, wait for the target to appear, scroll it into view and measure it. */
  private async focus(s: TourStep | null, navigate = true) {
    if (!s) { this.target.set(null); return; }
    if (navigate && s.route && !this.router.url.startsWith(s.route)) await this.router.navigateByUrl(s.route);
    let el: Element | null = null;
    if (s.target) {
      for (let i = 0; i < 25 && !el; i++) {
        el = [...document.querySelectorAll(`[data-tour="${s.target}"]`)].find(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }) ?? null;
        if (!el) await sleep(100);
      }
    }
    if (this.tour.step() !== s) return;   // moved on while waiting
    if (el) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); await sleep(60); }
    this.view.set({ w: innerWidth, h: innerHeight });
    this.target.set(el ? el.getBoundingClientRect() : null);
  }

  @HostListener('window:resize') onResize() { if (this.tour.active()) this.focus(this.tour.step(), false); }
  @HostListener('window:keydown', ['$event']) onKey(e: KeyboardEvent) {
    if (!this.tour.active()) return;
    if (e.key === 'Escape') { e.stopPropagation(); this.tour.end(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.tour.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.tour.back(); }
  }
}
