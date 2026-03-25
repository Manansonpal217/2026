/** Format session notes for display - strips jira: prefix to show only ticket key */
export function formatNotesForDisplay(notes: string | null | undefined): string {
  if (!notes) return ''
  if (notes.startsWith('jira:')) return notes.slice(5).trim()
  return notes
}

/** Check if session notes indicate a Jira task */
export function isJiraTask(notes: string | null | undefined): boolean {
  return Boolean(notes?.startsWith('jira:'))
}
