import { Recipe } from './models';
import { Sheet, headerOf, sortRows, tidy } from './sheets';

/** Run a recipe's steps on every sheet of a workbook: tidy first, then sort by a named column. */
export function applyRecipe(sheets: Sheet[], r: Recipe): { sheets: Sheet[]; notes: string[] } {
  const notes: string[] = [];
  const out = sheets.map(s => {
    let cur = tidy(s, r.tidy).sheet;
    if (r.sortBy) {
      const cols = (cur.rows[0] ?? []).map((_, c) => headerOf(cur, c).toLowerCase());
      const col = cols.indexOf(r.sortBy.trim().toLowerCase());
      if (col >= 0) cur = sortRows(cur, [{ col, desc: r.sortDesc }]);
      else notes.push(`Sheet "${s.name}" has no "${r.sortBy}" column, so it was tidied but not sorted.`);
    }
    return cur;
  });
  return { sheets: out, notes };
}

/** Does this recipe run by itself on a file with this name? */
export const recipeMatches = (r: Recipe, fileName: string) =>
  !!r.match.trim() && fileName.toLowerCase().includes(r.match.trim().toLowerCase());
