import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { Access } from '../core/access.service';
import { ConditionOp, Rule, RuleAction, RuleActionType, RuleCondition, RuleTrigger } from '../core/models';
import { Store } from '../core/store.service';
import { uid } from '../core/utils';

type Kind = 'text' | 'number' | 'date' | 'stage' | 'priority' | 'owner' | 'contact' | 'select';
interface FieldDef { key: string; label: string; kind: Kind; options?: string[]; }

const OP_LABELS: Record<ConditionOp, string> = {
  is: 'is', isNot: 'is not', contains: 'contains', gt: 'is more than', lt: 'is less than', empty: 'is empty', notEmpty: 'is filled in',
};
const ACTION_LABELS: Record<RuleActionType, string> = {
  setStage: 'Move to stage', setPriority: 'Set priority', setOwner: 'Assign to', setField: 'Set a field', addTask: 'Add a follow-up task', addNote: 'Add a note',
};

@Component({
  selector: 'app-automations',
  imports: [FormsModule, NgTemplateOutlet, NgIcon, HlmButtonImports, HlmCardImports, HlmCheckboxImports, HlmInputImports, HlmNativeSelectImports],
  template: `
    @if (w(); as w) {
      <div class="mt-4 space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <p class="text-muted-foreground max-w-2xl text-sm">
            Automations sort and fill in {{ w.recordLabelPlural.toLowerCase() }} for you. They run when something is created or imported from a file, and when it changes.
            Example: <em>When Source is Website, assign to Lerato and add a task "Call within 1 day".</em>
          </p>
          <div class="flex flex-wrap gap-2">
            <button hlmBtn variant="outline" (click)="runNow(w.id, w.recordLabelPlural)" [disabled]="!rules().length"><ng-icon name="lucideZap" /> Apply to existing</button>
            <button hlmBtn (click)="addRule(w.id)"><ng-icon name="lucidePlus" /> New automation</button>
          </div>
        </div>

        @for (r of rules(); track r.id) {
          <div hlmCard [class.opacity-60]="!r.enabled">
            <div hlmCardHeader class="flex flex-row flex-wrap items-center gap-3">
              <hlm-checkbox [checked]="r.enabled" (checkedChange)="setRule(r, 'enabled', $event)" aria-label="Enabled" />
              <input hlmInput class="min-w-48 flex-1 font-medium" [value]="r.name" (change)="setRule(r, 'name', val($event))" aria-label="Automation name">
              <hlm-native-select class="w-60" [ngModel]="r.trigger" (ngModelChange)="setRule(r, 'trigger', $event)" aria-label="Runs when">
                <option hlmNativeSelectOption value="changed">When created, imported or changed</option>
                <option hlmNativeSelectOption value="created">Only when created or imported</option>
              </hlm-native-select>
              <button hlmBtn variant="ghost" size="icon" (click)="remove(r)" aria-label="Delete automation"><ng-icon name="lucideTrash2" /></button>
            </div>

            <div hlmCardContent class="grid gap-6 lg:grid-cols-2">
              <!-- WHEN -->
              <div>
                <h4 class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">When all of these are true</h4>
                @for (c of r.conditions; track $index; let i = $index) {
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <hlm-native-select class="w-40" [ngModel]="c.field" (ngModelChange)="setCond(r, i, 'field', $event)" aria-label="Field">
                      @for (f of fieldDefs(); track f.key) { <option hlmNativeSelectOption [value]="f.key">{{ f.label }}</option> }
                    </hlm-native-select>
                    <hlm-native-select class="w-36" [ngModel]="c.op" (ngModelChange)="setCond(r, i, 'op', $event)" aria-label="Condition">
                      @for (o of opsFor(c.field); track o) { <option hlmNativeSelectOption [value]="o">{{ opLabel(c.field, o) }}</option> }
                    </hlm-native-select>
                    @if (c.op !== 'empty' && c.op !== 'notEmpty') {
                      <ng-container [ngTemplateOutlet]="valueEditor" [ngTemplateOutletContext]="{ kind: kindOf(c.field), options: optionsOf(c.field), value: c.value, set: condSetter(r, i) }" />
                    }
                    <button hlmBtn variant="ghost" size="icon-sm" (click)="delCond(r, i)" aria-label="Remove condition"><ng-icon name="lucideX" /></button>
                  </div>
                } @empty { <p class="text-muted-foreground mb-2 text-sm">No conditions: applies to every {{ w.recordLabel.toLowerCase() }}.</p> }
                <button hlmBtn variant="outline" size="sm" (click)="addCond(r)"><ng-icon name="lucidePlus" /> Add condition</button>
              </div>

              <!-- THEN -->
              <div>
                <h4 class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Then do this</h4>
                @for (a of r.actions; track $index; let i = $index) {
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <hlm-native-select class="w-48" [ngModel]="a.type" (ngModelChange)="setActType(r, i, $event)" aria-label="Action">
                      @for (t of actionTypes; track t[0]) { <option hlmNativeSelectOption [value]="t[0]">{{ t[1] }}</option> }
                    </hlm-native-select>

                    @switch (a.type) {
                      @case ('setField') {
                        <hlm-native-select class="w-36" [ngModel]="'field:' + a.field" (ngModelChange)="setAct(r, i, 'field', $event)" aria-label="Field to set">
                          @for (f of customFields(); track f.key) { <option hlmNativeSelectOption [value]="f.key">{{ f.label }}</option> }
                        </hlm-native-select>
                        <ng-container [ngTemplateOutlet]="valueEditor" [ngTemplateOutletContext]="{ kind: kindOf('field:' + a.field), options: optionsOf('field:' + a.field), value: a.value, set: actSetter(r, i) }" />
                      }
                      @case ('addTask') {
                        <input hlmInput class="min-w-40 flex-1" placeholder="Task, e.g. Call the client" [value]="a.value" (change)="setAct(r, i, 'value', val($event))" aria-label="Task title">
                        <input hlmInput type="number" class="w-24" placeholder="Days" [value]="a.days ?? ''" (change)="setAct(r, i, 'days', val($event))" aria-label="Due in days" title="Due in this many days (blank = no date)">
                      }
                      @case ('addNote') {
                        <input hlmInput class="min-w-40 flex-1" placeholder="Note text" [value]="a.value" (change)="setAct(r, i, 'value', val($event))" aria-label="Note">
                      }
                      @default {
                        <ng-container [ngTemplateOutlet]="valueEditor" [ngTemplateOutletContext]="{ kind: actKind(a.type), options: [], value: a.value, set: actSetter(r, i) }" />
                      }
                    }
                    <button hlmBtn variant="ghost" size="icon-sm" (click)="delAct(r, i)" aria-label="Remove action"><ng-icon name="lucideX" /></button>
                  </div>
                }
                <button hlmBtn variant="outline" size="sm" (click)="addAct(r)"><ng-icon name="lucidePlus" /> Add action</button>
              </div>
            </div>
          </div>
        } @empty {
          <div class="text-muted-foreground rounded-xl border border-dashed py-14 text-center text-sm">
            No automations for {{ w.name }} yet. Click "New automation" to create one.
          </div>
        }
      </div>

      <!-- shared editor for a value, depending on what kind of thing it is -->
      <ng-template #valueEditor let-kind="kind" let-options="options" let-value="value" let-set="set">
        @switch (kind) {
          @case ('stage') {
            <hlm-native-select class="w-44" [ngModel]="value" (ngModelChange)="set($event)">
              <option hlmNativeSelectOption value="">Choose...</option>
              @for (s of w.stages; track s.id) { <option hlmNativeSelectOption [value]="s.id">{{ s.name }}</option> }
            </hlm-native-select>
          }
          @case ('priority') {
            <hlm-native-select class="w-32" [ngModel]="value" (ngModelChange)="set($event)">
              <option hlmNativeSelectOption value="">Choose...</option>
              <option hlmNativeSelectOption value="high">High</option><option hlmNativeSelectOption value="medium">Medium</option><option hlmNativeSelectOption value="low">Low</option>
            </hlm-native-select>
          }
          @case ('owner') {
            <hlm-native-select class="w-44" [ngModel]="value" (ngModelChange)="set($event)">
              <option hlmNativeSelectOption value="">Choose...</option>
              @for (u of store.users(); track u.id) { <option hlmNativeSelectOption [value]="u.id">{{ u.name }}</option> }
            </hlm-native-select>
          }
          @case ('contact') {
            <hlm-native-select class="w-44" [ngModel]="value" (ngModelChange)="set($event)">
              <option hlmNativeSelectOption value="">Choose...</option>
              @for (c of store.state().contacts; track c.id) { <option hlmNativeSelectOption [value]="c.id">{{ c.name }}</option> }
            </hlm-native-select>
          }
          @case ('select') {
            <hlm-native-select class="w-44" [ngModel]="value" (ngModelChange)="set($event)">
              <option hlmNativeSelectOption value="">Choose...</option>
              @for (o of options; track o) { <option hlmNativeSelectOption [value]="o">{{ o }}</option> }
            </hlm-native-select>
          }
          @case ('date') { <input hlmInput type="date" class="w-40" [value]="value" (change)="set(val($event))"> }
          @case ('number') { <input hlmInput type="number" class="w-32" [value]="value" (change)="set(val($event))"> }
          @default { <input hlmInput class="w-44" [value]="value" (change)="set(val($event))"> }
        }
      </ng-template>
    }
  `,
})
export class AutomationsPanel {
  readonly store = inject(Store);
  private readonly access = inject(Access);

  readonly w = this.access.activeWorkspace;
  readonly actionTypes = Object.entries(ACTION_LABELS) as [RuleActionType, string][];

  readonly rules = computed(() => {
    const w = this.w();
    return w ? this.store.state().rules.filter(r => r.wsId === w.id) : [];
  });

  /** Everything a condition can look at in this workspace, limited to what the role may see. */
  readonly fieldDefs = computed<FieldDef[]>(() => {
    const w = this.w();
    if (!w) return [];
    const out: FieldDef[] = [
      { key: 'title', label: 'Name', kind: 'text' }, { key: 'stageId', label: 'Stage', kind: 'stage' },
      { key: 'priority', label: 'Priority', kind: 'priority' }, { key: 'ownerId', label: 'Owner', kind: 'owner' },
      { key: 'contactId', label: 'Contact', kind: 'contact' }, { key: 'dueDate', label: 'Due date', kind: 'date' },
    ];
    if (this.access.can('viewMoney')) out.splice(5, 0, { key: 'value', label: 'Value', kind: 'number' });
    return [...out, ...this.customFields()];
  });

  readonly customFields = computed<FieldDef[]>(() => {
    const w = this.w();
    return w ? this.access.visibleFields(w).map(f => ({
      key: 'field:' + f.id, label: f.label, options: f.options,
      kind: f.type === 'number' || f.type === 'money' ? 'number' : f.type === 'date' ? 'date' : f.type === 'select' ? 'select' : 'text',
    } as FieldDef)) : [];
  });

  val = (e: Event) => (e.target as HTMLInputElement).value.trim();
  kindOf = (key: string): Kind => this.fieldDefs().find(f => f.key === key)?.kind ?? 'text';
  optionsOf = (key: string) => this.fieldDefs().find(f => f.key === key)?.options ?? [];
  actKind = (t: RuleActionType): Kind => t === 'setStage' ? 'stage' : t === 'setPriority' ? 'priority' : t === 'setOwner' ? 'owner' : 'text';

  opsFor(key: string): ConditionOp[] {
    const k = this.kindOf(key);
    if (k === 'text') return ['is', 'isNot', 'contains', 'empty', 'notEmpty'];
    if (k === 'number' || k === 'date') return ['is', 'gt', 'lt', 'empty', 'notEmpty'];
    return ['is', 'isNot', 'empty', 'notEmpty'];
  }
  opLabel(key: string, op: ConditionOp) {
    if (this.kindOf(key) === 'date') return op === 'gt' ? 'is after' : op === 'lt' ? 'is before' : OP_LABELS[op];
    return OP_LABELS[op];
  }

  // ---- editing: every change replaces the rule in the store ----
  private edit(r: Rule, fn: (c: Rule) => void) { const c = structuredClone(r); fn(c); this.store.saveRule(c); }

  addRule(wsId: string) {
    const w = this.w()!;
    this.store.saveRule({
      id: uid(), wsId, name: 'New automation', enabled: true, trigger: 'changed',
      conditions: [{ field: 'priority', op: 'is', value: 'high' }],
      actions: [{ type: 'addTask', value: 'Follow up', days: 1 }],
    });
    toast('Automation added to ' + w.name);
  }
  remove(r: Rule) {
    const snapshot = this.store.state();
    this.store.deleteRule(r.id);
    toast('Deleted "' + r.name + '"', { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } });
  }

  setRule(r: Rule, key: 'name' | 'enabled' | 'trigger', v: unknown) {
    this.edit(r, c => {
      if (key === 'enabled') c.enabled = !!v;
      else if (key === 'trigger') c.trigger = v as RuleTrigger;
      else if (String(v)) c.name = String(v);
    });
  }

  addCond(r: Rule) { this.edit(r, c => c.conditions.push({ field: 'title', op: 'contains', value: '' })); }
  delCond(r: Rule, i: number) { this.edit(r, c => c.conditions.splice(i, 1)); }
  setCond(r: Rule, i: number, key: keyof RuleCondition, v: string) {
    this.edit(r, c => {
      const cond = c.conditions[i];
      if (key === 'field') { cond.field = v; cond.value = ''; if (!this.opsFor(v).includes(cond.op)) cond.op = this.opsFor(v)[0]; }
      else if (key === 'op') cond.op = v as ConditionOp;
      else cond.value = v;
    });
  }
  condSetter(r: Rule, i: number) { return (v: string) => this.setCond(r, i, 'value', v); }

  addAct(r: Rule) { this.edit(r, c => c.actions.push({ type: 'setPriority', value: 'high' })); }
  delAct(r: Rule, i: number) { this.edit(r, c => c.actions.splice(i, 1)); }
  setActType(r: Rule, i: number, t: string) {
    this.edit(r, c => {
      const fields = this.customFields();
      c.actions[i] = t === 'setField' ? { type: 'setField', field: fields[0]?.key.slice(6), value: '' }
        : t === 'addTask' ? { type: 'addTask', value: '', days: 1 } : { type: t as RuleActionType, value: '' };
    });
  }
  setAct(r: Rule, i: number, key: 'value' | 'field' | 'days', v: string) {
    this.edit(r, c => {
      const a: RuleAction = c.actions[i];
      if (key === 'days') a.days = v === '' ? undefined : Number(v);
      else if (key === 'field') { a.field = v.replace('field:', ''); a.value = ''; }
      else a.value = v;
    });
  }
  actSetter(r: Rule, i: number) { return (v: string) => this.setAct(r, i, 'value', v); }

  runNow(wsId: string, label: string) {
    const snapshot = this.store.state();
    const n = this.store.runRulesNow(wsId);
    toast(n ? n + ' ' + label.toLowerCase() + ' updated by automations' : 'Nothing needed changing',
      n ? { action: { label: 'Undo', onClick: () => this.store.restore(snapshot) } } : undefined);
  }
}
