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
