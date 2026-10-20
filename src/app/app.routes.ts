import { Routes } from '@angular/router';
import { homeGuard, navGuard } from './core/guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
      { path: 'company', title: 'Company', canActivate: [navGuard('company')], loadComponent: () => import('./pages/company').then(m => m.CompanyPage) },
      { path: 'mywork', title: 'My work', canActivate: [navGuard('mywork')], loadComponent: () => import('./pages/mywork').then(m => m.MyWorkPage) },
      { path: 'dashboard', title: 'Dashboard', canActivate: [navGuard('dashboard')], loadComponent: () => import('./pages/dashboard').then(m => m.DashboardPage) },
      { path: 'board', title: 'Board', canActivate: [navGuard('board')], loadComponent: () => import('./pages/board').then(m => m.BoardPage) },
      { path: 'list', title: 'List', canActivate: [navGuard('list')], loadComponent: () => import('./pages/list').then(m => m.ListPage) },
      { path: 'contacts', title: 'Contacts', canActivate: [navGuard('contacts')], loadComponent: () => import('./pages/contacts').then(m => m.ContactsPage) },
      { path: 'tasks', title: 'Tasks', canActivate: [navGuard('tasks')], loadComponent: () => import('./pages/tasks').then(m => m.TasksPage) },
      { path: 'messages', title: 'Messages', canActivate: [navGuard('messages')], loadComponent: () => import('./pages/messages').then(m => m.MessagesPage) },
      { path: 'files', title: 'Files', canActivate: [navGuard('files')], loadComponent: () => import('./pages/files').then(m => m.FilesPage) },
      { path: 'settings', title: 'Settings', canActivate: [navGuard('settings')], loadComponent: () => import('./pages/settings').then(m => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
