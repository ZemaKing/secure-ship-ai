// Extracted from ChatWindow.tsx (Week 3) once ShipmentManager (Week 4, Chunk C)
// needed the identical formatting — a second real use case, not a speculative one.

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

// timeZone: 'UTC' avoids a date-only string (no time component) shifting to the
// previous day when the browser's local timezone is behind UTC.
export function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString([], { dateStyle: 'medium', timeZone: 'UTC' })
}

// Dashboard's "Updated" column: today's updates only need a time (the date is
// implied), older ones only need a date (the exact time no longer matters) —
// showing both, like formatDateTime, is redundant clutter in a table this dense.
export function formatUpdated(iso: string) {
  const date = new Date(iso)
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday
    ? date.toLocaleTimeString([], { timeStyle: 'short' })
    : date.toLocaleDateString([], { dateStyle: 'medium' })
}
