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
  return isUpdatedToday(iso)
    ? new Date(iso).toLocaleTimeString([], { timeStyle: 'short' })
    : new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
}

function isUpdatedToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}

// Dashboard's and ShipmentManager's "Updated" columns pair formatUpdated()'s value
// with a matching icon — clock for the time-only (today) case, calendar for the
// date-only (older) one, so the icon never contradicts what's actually shown.
export function formatUpdatedIcon(iso: string): string {
  return isUpdatedToday(iso) ? '/icons/clock.svg' : '/icons/calendar.svg'
}

// SessionManager's "Started At" column pairs the exact date/time (via
// formatDate/formatTime below) with this relative caption, matching
// admin-pages.png's "2 hours ago" / "Yesterday" treatment. Only covers the ranges
// the mockup actually shows — same-day minutes/hours, yesterday, or a plain day
// count beyond that — not a full calendar-aware library.
export function formatTimeAgo(iso: string) {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return formatDate(iso)
}

// The time-only half of the Started At column's split date/time display —
// formatDate already covers the date half.
export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { timeStyle: 'short' })
}
