/**
 * The session notes panel's words (en-IN), in one place (src/brand/VOICE.md). A note is private
 * to its author (CLAUDE.md #3); nothing here offers anything or names a clinical act.
 */
export const NOTES_COPY = {
  title: 'Session notes',
  intro: 'Only you can read the notes you write here. Opening one is recorded in the audit log.',
  unavailable:
    'Session notes are not available on this deployment yet. An owner sets the notes key first (docs/runbook.md).',
  none: 'No notes on this session yet.',
  noneForPerson: 'You have not written a note for this person.',
  loading: 'Loading your notes…',
  open: 'Open',
  close: 'Close',
  add: 'Add a note',
  edit: 'Edit',
  save: 'Save the note',
  cancel: 'Cancel',
  bodyLabel: 'Note',
  bodyHint: 'Saved only when you choose Save. Up to 20,000 characters.',
  written: 'Written',
  updated: 'changed',
  saved: 'Note saved.',
  forOwnerNone: 'No session notes.',
  forOwner: (count: number, latest: string) =>
    `${count} session ${count === 1 ? 'note' : 'notes'}, the latest on ${latest}. Only each note’s author can read it.`,
  errors: {
    'notes-key-missing':
      'Session notes are not available on this deployment yet. An owner sets the notes key first.',
    'not-own-booking': 'You can write notes only on your own sessions.',
    'not-found': 'That note is not there, or it is not yours.',
    unreadable:
      'This note cannot be opened with the keys this deployment holds. Ask an owner to check the notes key.',
    invalid: 'Write the note before you save it, in up to 20,000 characters.',
    refused: 'Sign in with your two-factor code to use session notes.',
    failed: 'That did not work. Try again in a moment.',
  },
} as const

export type NoteErrorCode = keyof typeof NOTES_COPY.errors
