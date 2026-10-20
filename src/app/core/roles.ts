import { Action, NavKey, Role } from './models';

/* Role presets and the screens/actions roles can be given.
   NOTE: this is a UI layer only. The app has no server, so roles change what a
   person SEES; they do not protect the data. Every check goes through Access
   so a real backend can enforce the same rules later. */
export type NavGroup = 'Overview' | 'Work' | 'Admin';
export const NAV_ITEMS: { key: NavKey; label: string; icon: string; group: NavGroup }[] = [
  { key: 'company', label: 'Company', icon: 'lucideBuilding2', group: 'Overview' },
  { key: 'mywork', label: 'My work', icon: 'lucideStar', group: 'Overview' },
  { key: 'dashboard', label: 'Dashboard', icon: 'lucideLayoutDashboard', group: 'Overview' },
  { key: 'messages', label: 'Messages', icon: 'lucideMessageSquare', group: 'Overview' },
  { key: 'board', label: 'Board', icon: 'lucideColumns3', group: 'Work' },
  { key: 'list', label: 'List', icon: 'lucideList', group: 'Work' },
  { key: 'contacts', label: 'Contacts', icon: 'lucideContactRound', group: 'Work' },
  { key: 'tasks', label: 'Tasks', icon: 'lucideListChecks', group: 'Work' },
  { key: 'files', label: 'Files', icon: 'lucideFolderOpen', group: 'Work' },
  { key: 'settings', label: 'Settings', icon: 'lucideSettings', group: 'Admin' },
];

export const ACTION_LABELS: Record<Action, string> = {
  create: 'Create records', edit: 'Edit records and tasks', delete: 'Delete records', reassign: 'Reassign owners',
  comment: 'Log notes', export: 'Export CSV', viewMoney: 'See money values',
  configure: 'Edit stages and fields', admin: 'Admin: users, roles, backup',
};

export const ROLE_PRESETS: Role[] = [
  { id: 'ceo', name: 'CEO / Executive', home: 'company', recordScope: 'all', workspaceTemplates: null,
    nav: ['company', 'messages', 'dashboard', 'board', 'list', 'contacts', 'tasks', 'files'],
    actions: ['comment', 'export', 'viewMoney'] },
  { id: 'manager', name: 'Manager', home: 'dashboard', recordScope: 'all', workspaceTemplates: null,
    nav: ['company', 'messages', 'dashboard', 'board', 'list', 'contacts', 'tasks', 'files', 'settings'],
    actions: ['create', 'edit', 'delete', 'reassign', 'comment', 'export', 'viewMoney', 'configure'] },
  { id: 'finance', name: 'Finance', home: 'dashboard', recordScope: 'all', workspaceTemplates: ['sales', 'projects', 'procurement', 'partnerships', 'dealership-sales', 'dealership-service', 'catering', 'suppliers', 'quotes', 'retail'],
    nav: ['dashboard', 'messages', 'list', 'board', 'contacts', 'tasks', 'files'],
    actions: ['edit', 'comment', 'export', 'viewMoney'] },
  { id: 'it', name: 'IT / Admin', home: 'settings', recordScope: 'all', workspaceTemplates: null,
    nav: ['settings', 'messages', 'dashboard', 'board', 'list', 'contacts', 'tasks', 'files'],
    actions: ['create', 'edit', 'delete', 'reassign', 'comment', 'export', 'configure', 'admin'] },
  { id: 'staff', name: 'Staff', home: 'mywork', recordScope: 'own', workspaceTemplates: null,
    nav: ['mywork', 'messages', 'board', 'list', 'contacts', 'tasks', 'files'],
    actions: ['create', 'edit', 'comment'] },
];
