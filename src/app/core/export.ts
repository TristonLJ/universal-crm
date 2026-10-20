import writeXlsxFile from 'write-excel-file/browser';
import { CrmRecord, Workspace } from './models';
import { stageOf } from './utils';

interface ExportContext {
  w: Workspace; rows: CrmRecord[];
  userName: (id: string) => string; contactName: (id: string) => string;
  includeMoney: boolean; fields: Workspace['fields']; currency: string;
}

const toDate = (s: string) => (s ? new Date(s + 'T00:00:00') : null);

/** Download the rows as a formatted .xlsx (bold header, real dates, numbers and currency cells). */
export async function exportXlsx(ctx: ExportContext) {
  const { w, rows, fields } = ctx;
  const head = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#e4e4e7' });
  const money = '#,##0';
  const header = [head('Name'), head('Stage'), head('Contact'), head('Owner'), ...(ctx.includeMoney ? [head('Value')] : []),
    head('Due'), head('Priority'), ...fields.map(f => head(f.label)), head('Created')];

  const typed = (v: unknown, type: string) => {
    if (v === '' || v == null) return null;
    if (type === 'number') return { value: Number(v), type: Number };
    if (type === 'money') return { value: Number(v), type: Number, format: money };
    if (type === 'date') { const d = toDate(String(v)); return d ? { value: d, type: Date, format: 'yyyy-mm-dd' } : null; }
    return { value: String(v), type: String };
  };

  const data = [header, ...rows.map(r => {
    const due = toDate(r.dueDate);
    return [
      { value: r.title, type: String },
      { value: stageOf(w, r.stageId).name, type: String },
      ctx.contactName(r.contactId) ? { value: ctx.contactName(r.contactId), type: String } : null,
      ctx.userName(r.ownerId) ? { value: ctx.userName(r.ownerId), type: String } : null,
      ...(ctx.includeMoney ? [r.value != null ? { value: r.value, type: Number, format: money } : null] : []),
      due ? { value: due, type: Date, format: 'yyyy-mm-dd' } : null,
      { value: r.priority, type: String },
      ...fields.map(f => typed(r.fields[f.id], f.type)),
      { value: new Date(r.createdAt), type: Date, format: 'yyyy-mm-dd' },
    ];
  })];

  const widths = [{ width: 30 }, { width: 18 }, { width: 22 }, { width: 18 }, ...(ctx.includeMoney ? [{ width: 14 }] : []),
    { width: 13 }, { width: 10 }, ...fields.map(() => ({ width: 20 })), { width: 13 }];

  await writeXlsxFile(data as never, { columns: widths, stickyRowsCount: 1 } as never).toFile(
    w.name.replace(/\W+/g, '-').toLowerCase() + '.xlsx');
}

/** A starter file with the right headers and one example row, so people know what to prepare. */
export async function downloadTemplate(w: Workspace, headers: string[], example: string[]) {
  const data = [headers.map(h => ({ value: h, fontWeight: 'bold' as const, backgroundColor: '#e4e4e7' })),
    example.map(v => ({ value: v, type: String }))];
  await writeXlsxFile(data as never, { columns: headers.map(() => ({ width: 22 })) } as never).toFile(
    w.name.replace(/\W+/g, '-').toLowerCase() + '-import-template.xlsx');
}
