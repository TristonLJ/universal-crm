import { AppState, CrmRecord, Priority } from './models';
import { blankState, dayOffset, makeWorkspace, nowIso, uid } from './utils';

/* Mock company: 6 people across 5 roles, 5 workspaces, ~30 records. */
export function buildMockState(): AppState {
  const state = blankState();
  state.settings.currency = 'ZAR';

  const U = ([['Thandi Mokoena', 'ceo'], ['Sipho Dlamini', 'manager'], ['Nomsa Khumalo', 'finance'],
    ['Pieter van Wyk', 'it'], ['Ayanda Ndlovu', 'staff'], ['Lerato Sithole', 'staff']] as const)
    .map(([name, roleId]) => ({ id: uid(), name, roleId: roleId as string }));
  state.users = U;
  state.currentUserId = U[1].id;

  const C = ([['Amara Okafor', 'Northwind Traders'], ['Liam Botha', 'Bluegum Logistics'], ['Zanele Mahlangu', 'Karoo Foods'],
    ['Daniel Smit', 'Cape Fibre'], ['Fatima Patel', 'Lotus Retail'], ['Kabelo Molefe', 'Summit Mining']] as const)
    .map(([name, company], i) => ({
      id: uid(), name, company, email: name.split(' ')[0].toLowerCase() + '@example.com',
      phone: '+27 82 000 000' + i, notes: '',
    }));
  state.contacts = C;

  /* [title, stageIdx, ownerIdx|null, contactIdx|null, value, dueDays|null, priority, field values by index] */
  type Row = [string, number, number | null, number | null, number, number | null, Priority, (string | number)[]];
  const data: Record<string, Row[]> = {
    sales: [
      ['Website redesign', 1, 1, 0, 120000, 10, 'high', ['Referral', 'Web design', 'Send proposal']],
      ['Annual support contract', 2, 4, 1, 48000, 3, 'medium', ['Website', 'Support plan', 'Pricing call']],
      ['Fleet tracking pilot', 0, 5, 3, 15000, null, 'low', ['Cold outreach', 'Tracking', '']],
      ['Retail POS rollout', 3, 1, 4, 310000, -2, 'high', ['Event', 'POS', 'Final terms']],
      ['Mine safety training', 4, 4, 5, 86000, null, 'medium', ['Partner', 'Training', '']],
      ['Cold storage monitoring', 5, 5, 2, 54000, null, 'low', ['Website', 'IoT', '']],
      ['Fibre backup link', 1, 4, 3, 36000, 6, 'medium', ['Referral', 'Connectivity', 'Site survey']],
      ['Catering software', 0, null, 2, 22000, null, 'low', ['Website', 'Software', '']],
    ],
    recruitment: [
      ['Naledi Zulu', 2, 1, null, 0, 4, 'high', ['Accountant', 'LinkedIn', 420000, '']],
      ['Tshepo Mabaso', 1, 1, null, 0, 7, 'medium', ['Support agent', 'Job board', 240000, '']],
      ['Karabo Nel', 3, 1, null, 0, 2, 'high', ['Developer', 'Referral', 560000, '']],
      ['Megan Jacobs', 0, null, null, 0, null, 'low', ['Developer', 'Job board', 520000, '']],
      ['Sibusiso Cele', 4, 1, null, 0, null, 'medium', ['Sales rep', 'Agency', 300000, '']],
      ['Anele Radebe', 5, 1, null, 0, null, 'low', ['Support agent', 'Walk-in', 230000, '']],
    ],
    support: [
      ['Invoice shows wrong VAT', 1, 4, 0, 0, 1, 'high', ['Billing', 'Email', 'T-1001']],
      ['Cannot reset password', 0, 5, 1, 0, 0, 'medium', ['Account', 'Chat', 'T-1002']],
      ['Delivery delayed 5 days', 2, 4, 2, 0, -1, 'high', ['Delivery', 'Phone', 'T-1003']],
      ['App crashes on login', 1, 3, 3, 0, 2, 'high', ['Technical', 'WhatsApp', 'T-1004']],
      ['Update billing address', 3, 5, 4, 0, null, 'low', ['Billing', 'Email', 'T-0998']],
      ['Feature request: export', 4, 4, 5, 0, null, 'low', ['Other', 'Email', 'T-0990']],
    ],
    projects: [
      ['Office network upgrade', 2, 3, null, 85000, 14, 'high', ['Head office', 85000, dayOffset(-5), 'Replace switches and APs']],
      ['Q4 warehouse audit', 1, 1, null, 40000, 21, 'medium', ['Warehouse', 40000, dayOffset(7), 'Stock count and reconciliation']],
      ['Brand refresh', 0, 5, null, 120000, null, 'low', ['Marketing', 120000, '', '']],
      ['Payroll system migration', 3, 2, null, 150000, -3, 'high', ['Finance', 150000, dayOffset(-30), 'Move to new provider']],
      ['Fleet service plan', 4, 1, null, 30000, null, 'medium', ['Operations', 30000, dayOffset(-20), '']],
    ],
    procurement: [
      ['20 laptops', 2, 3, null, 380000, 5, 'high', ['TechSource', 'IT', 'PO-5521']],
      ['Office furniture', 1, 1, null, 64000, 9, 'medium', ['Workspace Co', 'Admin', '']],
      ['Server licences', 3, 3, null, 92000, 1, 'high', ['Licence Hub', 'IT', 'PO-5530']],
      ['Safety equipment', 4, 1, null, 27000, null, 'medium', ['SafeGear', 'Operations', 'PO-5502']],
      ['Printer toner', 0, 4, null, 4500, 12, 'low', ['', 'Admin', '']],
    ],
  };

  Object.entries(data).forEach(([tpl, rows]) => {
    const w = makeWorkspace(tpl);
    state.workspaces.push(w);
    rows.forEach(([title, stage, owner, contact, value, due, priority, fv]) => {
      const r: CrmRecord = {
        id: uid(), wsId: w.id, title, stageId: w.stages[stage].id,
        ownerId: owner == null ? '' : U[owner].id, contactId: contact == null ? '' : C[contact].id,
        value: value || null, dueDate: due == null ? '' : dayOffset(due), priority,
        fields: Object.fromEntries(w.fields.map((f, i) => [f.id, fv[i] ?? ''])),
        createdAt: nowIso(), updatedAt: nowIso(), stageChangedAt: nowIso(),
      };
      state.records.push(r);
      state.activities.push({ id: uid(), recordId: r.id, type: 'stage', text: 'Created in ' + w.stages[0].name, at: nowIso() });
    });
  });

  // Example automations so the feature is visible out of the box.
  const sales = state.workspaces.find(w => w.template === 'sales')!;
  state.rules.push(
    { id: uid(), wsId: sales.id, name: 'Big deals are high priority', enabled: true, trigger: 'changed',
      conditions: [{ field: 'value', op: 'gt', value: '100000' }], actions: [{ type: 'setPriority', value: 'high' }] },
    { id: uid(), wsId: sales.id, name: 'Website leads go to Lerato', enabled: true, trigger: 'created',
      conditions: [{ field: 'field:' + sales.fields[0].id, op: 'is', value: 'Website' }],
      actions: [{ type: 'setOwner', value: U[5].id }, { type: 'addTask', value: 'Call within 1 day', days: 1 }] },
  );

  const byTitle = (t: string) => state.records.find(r => r.title === t)!;
  ([['Retail POS rollout', 'Send revised quote', -1, 1], ['Fibre backup link', 'Book site visit', 3, 4],
    ['Delivery delayed 5 days', 'Call courier', 0, 4], ['20 laptops', 'Confirm budget with finance', 2, 2],
    ['Payroll system migration', 'Sign off cut-over plan', -2, 2], ['Karabo Nel', 'Prepare offer letter', 1, 1],
    ['App crashes on login', 'Check server logs', 1, 3]] as const).forEach(([rec, title, due, owner]) => {
    const r = byTitle(rec);
    state.tasks.push({ id: uid(), wsId: r.wsId, recordId: r.id, title, due: dayOffset(due), done: false, assigneeId: U[owner].id });
  });

  state.activeWorkspaceId = state.workspaces[0].id;
  return state;
}
