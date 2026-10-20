import { AppState, CrmRecord, Rule, RuleCondition, RuleTrigger } from './models';
import { dayOffset, nowIso, uid } from './utils';

/** Value of a record field as a comparable string/number. */
function read(rec: CrmRecord, field: string): string | number {
  if (field.startsWith('field:')) return rec.fields[field.slice(6)] ?? '';
  switch (field) {
    case 'title': return rec.title;
    case 'stageId': return rec.stageId;
    case 'priority': return rec.priority;
    case 'ownerId': return rec.ownerId;
    case 'contactId': return rec.contactId;
    case 'value': return rec.value ?? '';
    case 'dueDate': return rec.dueDate;
    default: return '';
  }
}

const isBlank = (v: unknown) => v === '' || v == null;

export function conditionMatches(rec: CrmRecord, c: RuleCondition): boolean {
  const a = read(rec, c.field);
  if (c.op === 'empty') return isBlank(a);
  if (c.op === 'notEmpty') return !isBlank(a);
  const sa = String(a).trim().toLowerCase(), sv = String(c.value ?? '').trim().toLowerCase();
  switch (c.op) {
    case 'is': return sa === sv;
    case 'isNot': return sa !== sv;
    case 'contains': return sv !== '' && sa.includes(sv);
    case 'gt': case 'lt': {
      if (isBlank(a) || sv === '') return false;
      const na = Number(a), nv = Number(c.value);
      const bothNumbers = !isNaN(na) && !isNaN(nv);
      const cmp = bothNumbers ? na - nv : sa.localeCompare(sv);   // ISO dates compare correctly as strings
      return c.op === 'gt' ? cmp > 0 : cmp < 0;
    }
  }
  return false;
}

/**
 * Run the workspace's enabled rules against one record that lives inside `s` (call from within Store.mutate).
 * "created" rules run only when the record is new or imported; "changed" rules run on creation and every edit.
 * Actions are idempotent (set values, add a task only if missing), so repeated runs don't pile up.
 * Returns the number of rules that changed something.
 */
export function applyRules(s: AppState, rec: CrmRecord, trigger: RuleTrigger): number {
  const rules = s.rules.filter((r: Rule) => r.enabled && r.wsId === rec.wsId && (trigger === 'created' || r.trigger === 'changed'));
  const ws = s.workspaces.find(w => w.id === rec.wsId);
  let fired = 0;

  for (const rule of rules) {
    if (!rule.conditions.every(c => conditionMatches(rec, c))) continue;
    const changes: string[] = [];

    for (const a of rule.actions) {
      switch (a.type) {
        case 'setStage': {
          const st = ws?.stages.find(x => x.id === a.value);
          if (st && rec.stageId !== st.id) { rec.stageId = st.id; rec.stageChangedAt = nowIso(); changes.push('stage to ' + st.name); }
          break;
        }
        case 'setPriority':
          if ((a.value === 'low' || a.value === 'medium' || a.value === 'high') && rec.priority !== a.value) {
            rec.priority = a.value; changes.push('priority to ' + a.value);
          }
          break;
        case 'setOwner': {
          const u = s.users.find(x => x.id === a.value);
          if (u && rec.ownerId !== u.id) { rec.ownerId = u.id; changes.push('owner to ' + u.name); }
          break;
        }
        case 'setField': {
          const f = ws?.fields.find(x => x.id === a.field);
          if (f && String(rec.fields[f.id] ?? '') !== a.value) { rec.fields[f.id] = a.value; changes.push(f.label + ' to ' + a.value); }
          break;
        }
        case 'addTask':
          if (a.value.trim() && !s.tasks.some(t => t.recordId === rec.id && t.title === a.value)) {
            s.tasks.push({
              id: uid(), wsId: rec.wsId, recordId: rec.id, title: a.value, done: false,
              due: a.days != null && !isNaN(a.days) ? dayOffset(a.days) : '', assigneeId: rec.ownerId || s.currentUserId,
            });
            changes.push('task "' + a.value + '"');
          }
          break;
        case 'addNote':
          if (trigger === 'created' && a.value.trim()) {
            s.activities.push({ id: uid(), recordId: rec.id, type: 'note', text: a.value, at: nowIso() });
            changes.push('note');
          }
          break;
      }
    }

    if (changes.length) {
      fired++;
      rec.updatedAt = nowIso();
      s.activities.push({ id: uid(), recordId: rec.id, type: 'note', text: 'Automation "' + rule.name + '" set ' + changes.join(', '), at: nowIso() });
    }
  }
  return fired;
}
