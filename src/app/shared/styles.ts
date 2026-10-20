import { Priority } from '../core/models';

/** Tailwind classes for the priority pill, shared by board, list and the record sheet. */
export const priorityClass = (p: Priority) => ({
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  high: 'bg-red-500/15 text-red-700 dark:text-red-400',
} as Record<Priority, string>)[p];

export const PILL = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize';
