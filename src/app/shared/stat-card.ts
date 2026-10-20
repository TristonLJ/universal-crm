import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { HlmCardImports } from '@spartan-ng/helm/card';

@Component({
  selector: 'app-stat-card',
  imports: [HlmCardImports, NgIcon],
  template: `
    <div hlmCard class="h-full gap-2 py-4">
      <div hlmCardHeader class="flex flex-row items-center justify-between pb-0">
        <span class="text-muted-foreground text-sm font-medium">{{ label() }}</span>
        <ng-icon [name]="icon()" [class]="'size-4 ' + tone()" />
      </div>
      <div hlmCardContent>
        <div class="text-3xl font-semibold tracking-tight">{{ value() }}</div>
        @if (sub()) { <p class="text-muted-foreground mt-1 text-xs">{{ sub() }}</p> }
      </div>
    </div>
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly sub = input<string | null>(null);
  readonly icon = input('lucideBriefcase');
  readonly tone = input('text-muted-foreground');
}
