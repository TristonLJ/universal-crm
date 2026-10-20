export type StageKind = 'open' | 'won' | 'lost';
export type FieldType = 'text' | 'longtext' | 'number' | 'money' | 'date' | 'select' | 'email' | 'phone' | 'url';
export type Priority = 'low' | 'medium' | 'high';
export type ActivityType = 'note' | 'call' | 'email' | 'meeting' | 'stage';
export type NavKey = 'company' | 'mywork' | 'dashboard' | 'board' | 'list' | 'contacts' | 'tasks' | 'files' | 'messages' | 'settings';
export type Action =
  | 'create' | 'edit' | 'delete' | 'reassign' | 'comment' | 'export' | 'viewMoney' | 'configure' | 'admin';

export interface Stage { id: string; name: string; color: string; kind: StageKind; }
export interface Field { id: string; label: string; type: FieldType; options: string[]; }

export interface Workspace {
  id: string; name: string; template: string;
  recordLabel: string; recordLabelPlural: string;
  stages: Stage[]; fields: Field[];
}

export interface Contact { id: string; name: string; company: string; email: string; phone: string; notes: string; }

export interface CrmRecord {
  id: string; wsId: string; title: string; stageId: string;
  ownerId: string; contactId: string; value: number | null;
  dueDate: string; priority: Priority; fields: Record<string, any>;
  createdAt: string; updatedAt: string; stageChangedAt: string;
}

export interface Activity { id: string; recordId: string; type: ActivityType; text: string; at: string; }
export interface Task { id: string; wsId: string; recordId: string; title: string; due: string; done: boolean; assigneeId: string; }

/** Metadata for an attached file. The bytes live in IndexedDB (see FileStore); recordId '' means "unfiled". */
export interface FileMeta {
  id: string; recordId: string; name: string; mime: string; size: number;
  addedAt: string; addedBy: string;
  /** First part of the text found in the file (PDF, text, CSV), used for search and pre-filling. */
  text: string;
  /** How it got filed: by hand, or automatically by matching its name or text to a record. */
  filedBy: 'manual' | 'auto' | '';
  /** Current version number (1 if never edited) and the earlier versions kept in storage. */
  version?: number;
  versions?: FileVersion[];
  /** People this file was sent to. They can see it even if they cannot see the record. */
  sharedWith?: string[];
  /** Set when the file was handed over: who holds it now. */
  heldBy?: string;
  /** Set when someone was asked to review it. */
  review?: FileReview;
}
export interface FileReview { by: string; to: string; status: 'pending' | 'approved' | 'returned'; note: string; at: string; }
export type SendMode = 'share' | 'handover' | 'review';

/** Saved spreadsheet steps. With a match text it runs by itself on newly added files whose name contains it. */
export interface Recipe {
  id: string; name: string; match: string;
  tidy: { trim: boolean; convert: boolean; dropBlank: boolean; dedupe: boolean };
  sortBy: string; sortDesc: boolean;
  /** Optionally share the result with this person after an automatic run. */
  sendTo: string;
}
export interface FileVersion { v: number; at: string; by: string; note: string; size: number; }

/** thread is 'general', 'rec:<recordId>' or 'dm:<userId>:<userId>'. */
export interface Message {
  id: string; thread: string; fromId: string; text: string; at: string;
  mentions: string[]; readBy: string[];
  /** Files attached to the message (ids of FileMeta). */
  fileIds?: string[];
}

export type RuleTrigger = 'created' | 'changed';
export type ConditionOp = 'is' | 'isNot' | 'contains' | 'gt' | 'lt' | 'empty' | 'notEmpty';
/** field is one of title, stageId, priority, ownerId, contactId, value, dueDate, or "field:<custom field id>" */
export interface RuleCondition { field: string; op: ConditionOp; value: string; }
export type RuleActionType = 'setStage' | 'setPriority' | 'setOwner' | 'setField' | 'addTask' | 'addNote';
export interface RuleAction { type: RuleActionType; value: string; field?: string; days?: number; }
/** "If all conditions match, do these actions" - runs when a record is created/imported or changed. */
export interface Rule {
  id: string; wsId: string; name: string; enabled: boolean; trigger: RuleTrigger;
  conditions: RuleCondition[]; actions: RuleAction[];
}

export interface Role {
  id: string; name: string; home: NavKey;
  recordScope: 'all' | 'own';
  /** null = every workspace, otherwise the template keys this role may see */
  workspaceTemplates: string[] | null;
  nav: NavKey[]; actions: Action[];
}
export interface User { id: string; name: string; roleId: string; }

export interface AppState {
  version: 2;
  settings: { currency: string; filesNav?: boolean; messagesNav?: boolean };
  activeWorkspaceId: string | null;
  users: User[]; currentUserId: string; roles: Role[];
  workspaces: Workspace[]; contacts: Contact[]; records: CrmRecord[]; activities: Activity[]; tasks: Task[];
  rules: Rule[];
  files: FileMeta[];
  messages: Message[];
  recipes: Recipe[];
}

export interface Template {
  name: string; description: string; recordLabel: string; recordLabelPlural: string;
  stages: Omit<Stage, 'id'>[];
  fields: { label: string; type: FieldType; options?: string[] }[];
}
