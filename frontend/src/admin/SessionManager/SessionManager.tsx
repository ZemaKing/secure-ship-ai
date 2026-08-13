import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useListChatSessions, type ChatSessionOut } from '../../api/generated/secure-ship'
import { useAdminAccessToken, authHeaders } from '../useAdminAccessToken'
import { formatTime, formatTimeAgo } from '../../utils/formatDate'
import Pagination from '../Pagination/Pagination'
import SessionTranscriptModal from './SessionTranscriptModal'
import './SessionManager.scss'

const PAGE_SIZE = 15

// Real ChatSessionState values (models/chat_session.py) — deliberately not remapped to
// a ticket-support vocabulary ("Resolved"/"Closed"/"Abandoned") the admin-pages mockup
// used, since none of that exists in this app's schema (no ended_at is ever set, no
// timeout/abandon rule exists). Honest labels over a closer mockup match — same call
// Dashboard already made by dropping the mockup's fabricated "+X% from last month".
const STATE_LABELS: Record<string, string> = {
  anonymous: 'Anonymous',
  collecting_identity: 'Collecting Identity',
  code_sent: 'Code Sent',
  awaiting_code: 'Awaiting Code',
  verified: 'Verified',
  escalated_to_human: 'Escalated to Human',
}

// A local-time date formatter, deliberately not the shared formatDate() util — that
// one forces UTC (correct for a date-only value like estimated_delivery) which would
// make this cell's date disagree with formatTime()'s local-time reading near midnight.
function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
}

const AVATAR_COLOR_COUNT = 5

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

function matchesSearch(session: ChatSessionOut, query: string): boolean {
  const haystack = `${session.visitor_name ?? ''} ${session.phone_number ?? ''}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function SessionManager() {
  const accessToken = useAdminAccessToken()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const setSearch = (value: string) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        if (value) next.set('search', value)
        else next.delete('search')
        return next
      },
      { replace: true },
    )
    setPage(1)
  }
  const stateFilter = searchParams.get('state') ?? 'all'
  const setStateFilter = (value: string) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        if (value !== 'all') next.set('state', value)
        else next.delete('state')
        return next
      },
      { replace: true },
    )
    setPage(1)
  }
  const [page, setPage] = useState(1)
  const [viewingSession, setViewingSession] = useState<ChatSessionOut | null>(null)

  const { data, isLoading } = useListChatSessions({
    query: { enabled: !!accessToken },
    fetch: authHeaders(accessToken),
  })

  const sessions = data?.data ?? []
  const filtered = sessions
    .filter((session) => (search.trim() ? matchesSearch(session, search.trim()) : true))
    .filter((session) => (stateFilter === 'all' ? true : session.state === stateFilter))
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="session-manager">
      <div className="session-manager__header">
        <div>
          <h1 className="session-manager__title">Chat Sessions</h1>
          <p className="session-manager__subtitle">View and review visitor chat sessions with the AI assistant.</p>
        </div>
      </div>

      <div className="session-manager__filters">
        <input
          className="session-manager__search"
          type="search"
          placeholder="Search by visitor name or phone number…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="session-manager__state-filter"
          aria-label="Filter by state"
          value={stateFilter}
          onChange={(event) => setStateFilter(event.target.value)}
        >
          <option value="all">All states</option>
          {Object.entries(STATE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="session-manager__status">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="session-manager__status">No chat sessions found.</p>
      ) : (
        <table className="session-manager__table">
          <thead>
            <tr>
              <th>Visitor / Customer</th>
              <th>State</th>
              <th>Started At</th>
              <th>Transcript</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((session, index) => (
              <tr key={session.id}>
                <td>
                  <div className="session-manager__visitor">
                    {session.visitor_name ? (
                      <span
                        className={`session-manager__avatar session-manager__avatar--${index % AVATAR_COLOR_COUNT}`}
                      >
                        {getInitials(session.visitor_name)}
                      </span>
                    ) : (
                      <span className="session-manager__avatar session-manager__avatar--unverified">
                        <img className="session-manager__avatar-icon" src="/icons/visitor.svg" alt="" />
                      </span>
                    )}
                    <div className="session-manager__visitor-text">
                      <span className="session-manager__visitor-name">
                        {session.visitor_name ?? 'Unverified Visitor'}
                      </span>
                      <span className="session-manager__visitor-phone">
                        {session.visitor_name ? (session.phone_number ?? '—') : 'Unverified'}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`session-manager__state-pill session-manager__state-pill--${session.state}`}>
                    {STATE_LABELS[session.state] ?? session.state}
                  </span>
                </td>
                <td>
                  <div className="session-manager__started-at">
                    <div className="session-manager__started-at-row">
                      <span className="session-manager__started-at-item">
                        <img className="session-manager__started-at-icon" src="/icons/calendar.svg" alt="" />
                        {formatSessionDate(session.started_at)}
                      </span>
                      <span className="session-manager__started-at-item">
                        <img className="session-manager__started-at-icon" src="/icons/clock.svg" alt="" />
                        {formatTime(session.started_at)}
                      </span>
                    </div>
                    <span className="session-manager__started-at-ago">{formatTimeAgo(session.started_at)}</span>
                  </div>
                </td>
                <td>
                  <div className="session-manager__transcript-cell">
                    <span className="session-manager__message-count">
                      {session.message_count} message{session.message_count === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      className="session-manager__view-button"
                      onClick={() => setViewingSession(session)}
                    >
                      <img className="session-manager__view-icon" src="/icons/eye.svg" alt="" />
                      View
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={currentPage}
        totalItems={filtered.length}
        pageSize={PAGE_SIZE}
        itemLabel={`session${filtered.length === 1 ? '' : 's'}`}
        onPageChange={setPage}
      />

      <SessionTranscriptModal
        sessionId={viewingSession?.id ?? null}
        visitorLabel={viewingSession?.visitor_name ?? 'Unverified Visitor'}
        onClose={() => setViewingSession(null)}
      />
    </div>
  )
}

export default SessionManager
