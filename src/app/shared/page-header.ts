import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  template: `
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold tracking-tight">{{ title() }}</h2>
        @if (description()) { <p class="text-muted-foreground text-sm">{{ description() }}</p> }
      </div>
      <div class="flex flex-wrap items-center gap-2"><ng-content /></div>
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly description = input<string>('');
}
