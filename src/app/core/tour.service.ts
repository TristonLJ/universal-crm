import { Injectable, computed, inject, signal } from '@angular/core';
import { Access } from './access.service';
import { NavKey } from './models';
import { Store } from './store.service';

export interface TourStep {
  id: string; title: string; body: (who: { name: string; role: string; workspace: string }) => string;
  /** Value of the data-tour attribute to point at. Without it (or if it is not on screen) the card is centred. */
  target?: string;
  /** Screen to be on for this step. */
  route?: string;
  /** The step is skipped for roles that do not have this screen. */
  needs?: NavKey;
  /** The first step: offers the tour instead of assuming it. */
  invite?: boolean;
}

const SEEN_KEY = 'universal-crm:tour-seen';

const STEPS: TourStep[] = [
  { id: 'welcome', invite: true, title: 'Welcome to Universal CRM',
    body: w => `One place for every team's work: sales, recruitment, support, projects, files and chat. You are looking at it as ${w.name} (${w.role}). This quick tour takes about two minutes, and you can stop whenever you like.` },
  { id: 'workspace', target: 'workspace', title: 'Workspaces',
    body: w => `Each team or branch gets its own workspace with its own pipeline, wording and fields. You are in "${w.workspace}" now. Click here to switch, or add a new one from a template (Sales, Recruitment, Support, Projects and more).` },
  { id: 'dashboard', target: 'nav-dashboard', route: '/dashboard', needs: 'dashboard', title: 'Dashboard',
    body: () => 'The numbers at a glance: open and won value, win rate, what is overdue, and what needs attention. Charts hide money values automatically from roles that should not see them.' },
  { id: 'board', target: 'board', route: '/board', needs: 'board', title: 'Board',
    body: () => 'Drag cards between stages as work moves along. Click a card to open it: details, tasks, chat, files and history all sit in one side panel. Every move has an Undo.' },
  { id: 'import', target: 'import', route: '/list', needs: 'list', title: 'List and Excel import',
    body: () => 'The List view is for searching, filtering, sorting and bulk changes. Import brings in an Excel or CSV file: it matches the columns for you and shows a preview before anything is created. Export gives you a formatted Excel file back.' },
  { id: 'messages', target: 'chat', route: '/messages', needs: 'messages', title: 'Messages',
    body: () => 'Company chat, direct messages and a chat on every record, so nobody has to leave for another app. Use @name to get someone\'s attention. A red badge in the menu means you were mentioned.' },
  { id: 'files', target: 'file-drop', route: '/files', needs: 'files', title: 'Files that file themselves',
    body: () => 'Drop contracts, quotes, CVs or spreadsheets here. PDFs, Excel and text files are read, then filed on the right record when the name or contents match. Click a file to preview it right here. Anything unmatched waits in the inbox, and "New record" can pre-fill a record from a file.' },
  { id: 'workbench', target: 'workbench', route: '/files', needs: 'files', title: 'The spreadsheet Workbench',
    body: () => 'Open any Excel or CSV file to auto-tidy it (text to real numbers and dates, empty rows removed, duplicates dropped), sort it, edit it and split it by a column. Every save is a new version you can restore. Save your steps as a recipe and they run automatically on future files. Then send the rows into a workspace, or send the sheet to a manager for review.' },
  { id: 'search', target: 'search', title: 'Search and jump to anything',
    body: () => 'Press Ctrl+K (or Cmd+K) any time to open anything by typing: records, contacts, people, screens, and actions like "New deal" or "Take the tour".' },
  { id: 'viewing-as', target: 'viewing-as', title: 'Roles reshape the app',
    body: () => 'CEO, Manager, Finance, IT and Staff each get their own landing screen, menu, visible records and permissions. Switch person here to see exactly what a colleague sees. Money is hidden for roles that should not see it.' },
  { id: 'settings', target: 'nav-settings', route: '/settings', needs: 'settings', title: 'Settings and automations',
    body: () => 'Edit stages and fields, manage people and roles, back up or restore your data, and build automations: "when all of these are true, then do this" rules that move, assign and remind for you.' },
  { id: 'done', title: 'You are all set',
    body: () => 'Your data stays in this browser. Use the Tour button at the top, or press Ctrl+K and type "tour", whenever you want to see this again.' },
];

/** The guided tour: which step we are on. The overlay component does the pointing. */
@Injectable({ providedIn: 'root' })
export class Tour {
  private readonly access = inject(Access);
  private readonly store = inject(Store);

  /** Only the steps this role can actually use. */
  readonly steps = computed(() => STEPS.filter(s => !s.needs || this.access.navAllowed(s.needs)));
  readonly index = signal(-1);
  readonly active = computed(() => this.index() >= 0);
  readonly step = computed(() => this.steps()[this.index()] ?? null);
  readonly isLast = computed(() => this.index() === this.steps().length - 1);

  readonly who = computed(() => ({
    name: this.store.currentUser().name, role: this.access.role().name, workspace: this.access.activeWorkspace()?.name ?? 'your workspace',
  }));

  start() { this.index.set(0); }
  next() { this.isLast() ? this.end() : this.index.update(i => i + 1); }
  back() { this.index.update(i => Math.max(0, i - 1)); }
  end() { this.markSeen(); this.index.set(-1); }

  hasSeen(): boolean {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
  }
  private markSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked: the offer may show again */ } }

  /** Offer the tour once to someone who has never seen it. */
  offerOnce() { if (!this.hasSeen()) this.start(); }
}
