# Universal CRM (Angular + Spartan)

A free CRM that adapts to **any team, branch or process** (sales, recruitment, support, projects and jobs, partnerships, procurement, or your own). Built with Angular 22 and [Spartan UI](https://spartan.ng) (Tailwind CSS 4, shadcn-style components you own), with a role-aware interface.

Front end only: no server, no account. Data is stored in your browser.

## Features

- **Workspaces**: one per team or branch, each with its own pipeline stages, vocabulary ("Deal", "Candidate", "Ticket"...) and custom fields. Seven templates included.
- **Roles that reshape the UI**: CEO, Manager, Finance, IT and Staff presets. Each role gets its own landing screen, menu, visible workspaces, visible records (all or only their own), hidden money fields and allowed actions. Editable in **Settings**.
- **Import from Excel or CSV**: drop a file, check the automatic column matching, preview what will happen to every row (new, update, skipped, with notes), then import. Handles day-first dates, "R 12 500,50" style amounts, unknown stages and owners, duplicates (skip, update or create) and new contacts. One click to Undo. A starter file can be downloaded for each workspace.
- **Export to Excel**: formatted `.xlsx` (bold header, real dates, number and currency cells) as well as CSV.
- **Automations** (Settings > Automations): plain-language rules, "When all of these are true, then do this". Actions: move to stage, set priority, assign owner, set a field, add a follow-up task, add a note. They run on creation, on import and on every change, and can be applied to existing records in one click.
- **Command palette (Ctrl/Cmd + K)**: jump to any screen, workspace, record, contact or person, create things, or switch role, all by typing.
- **Board**: drag and drop between stages, quick-add at the bottom of a column, "Mine" filter. Moves come with an **Undo** toast.
- **List**: search, filters (stage, owner, priority, overdue), sortable columns, column picker, bulk select with bulk move, assign and delete (with Undo), pagination, CSV export.
- **Record drawer**: details, tasks and activity history in tabs, without leaving the page.
- **Interactive charts** ([ApexCharts](https://apexcharts.com), themed for light and dark): pipeline funnel with a count/value toggle, win-rate gauge, due-date load by priority, priority mix, workload per person, and on the Company page workspaces compared, open value share and who works where. Money charts hide automatically for roles without money access.
- **Dashboard** with "needs attention" and recent activity; **Company** overview across workspaces; **My work**; **Tasks** grouped by urgency; shared **Contacts**.
- **Settings** in tabs (Workspace, People, Roles, Data), JSON backup and restore, light, dark and system themes.
- Ships with a **mock company** (6 people, 5 workspaces, about 30 records). Switch person from the sidebar footer ("Viewing as").

## Run it

```bash
npm install
npm start            # http://localhost:4200
```

Build for production:

```bash
npm run build:pages  # output in dist/universal-crm-angular/browser
```

The app uses hash URLs (`#/board`) and a relative base href, so the build works from any static host, including GitHub Pages, without server rewrites.

### Deploy to GitHub Pages

Push to GitHub, then **Settings > Pages > Source: GitHub Actions**. The workflow in `.github/workflows/pages.yml` builds and publishes on every push to `main`.

## Roles are a UI layer, not security

There is no server, so roles change what a person **sees**; they do not protect the data. Anyone with the browser or a backup file can read everything. All permission checks go through `src/app/core/access.service.ts`, so a backend can enforce the same rules later.

## Project layout

| Path | What it is |
|---|---|
| `src/app/core/` | Models, templates, role presets, `Store` (signals + localStorage), `Access` (permissions), mock data |
| `src/app/layout/` | App shell (Spartan sidebar, header) and the command palette |
| `src/app/pages/` | One standalone, lazy-loaded component per screen |
| `src/app/shared/` | Record and contact drawers, task row, stat card, page header |
| `libs/ui/` | Spartan "Helm" components, generated into the repo so you can edit them |

**Add a workspace template**: add an entry to `src/app/core/templates.ts`; it shows up in Settings > Data > New workspace.

**Add or update a Spartan component**: `npx ng g @spartan-ng/cli:ui <name>` (configured by `components.json`).

## Windows note

If `ng build` fails with `spawn UNKNOWN` in a restricted shell, run it from PowerShell or a regular terminal.

## Roadmap

- Backend sync (for example Supabase, Firebase, or Node with a database) behind the `Store` service, with the same role rules enforced server side.
- Files on records, reading data from PDFs and images, document templates (quotes, invoices), message composer, calendar view.
- Saved views and reports.

## License

MIT
