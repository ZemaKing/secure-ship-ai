import { useGetChatSession, type ChatTranscriptEntry } from '../../api/generated/secure-ship'
import { useAdminAccessToken, authHeaders } from '../useAdminAccessToken'
import { formatTime } from '../../utils/formatDate'
import './SessionTranscriptModal.scss'

interface SessionTranscriptModalProps {
  sessionId: string | null
  visitorLabel: string
  onClose: () => void
}

// A rejected identity match isn't its own persisted ChatSessionState — routes/chat.py
// returns this exact fixed string (NEUTRAL_IDENTITY_MESSAGE) and the session just stays
// in CollectingIdentity (see docs/diagrams/6.2). DEV_PLAN.md's
// stretch-goal ask is to surface gating-rejection cases in this viewer alongside
// escalation, so this flags that specific reply text rather than inventing a state
// that doesn't exist in the schema.
function isRejectionMessage(content: string): boolean {
  return content.includes("couldn't verify that information")
}

function formatDayDivider(iso: string): string {
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}

// Groups consecutive entries under one date divider, admin-pages.png style, rather
// than repeating the date on every single message.
function groupByDay(transcript: ChatTranscriptEntry[]): { day: string; entries: ChatTranscriptEntry[] }[] {
  const groups: { day: string; entries: ChatTranscriptEntry[] }[] = []
  for (const entry of transcript) {
    const key = dayKey(entry.timestamp)
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && dayKey(lastGroup.entries[0].timestamp) === key) {
      lastGroup.entries.push(entry)
    } else {
      groups.push({ day: formatDayDivider(entry.timestamp), entries: [entry] })
    }
  }
  return groups
}

function SessionTranscriptModal({ sessionId, visitorLabel, onClose }: SessionTranscriptModalProps) {
  const accessToken = useAdminAccessToken()
  const { data, isLoading } = useGetChatSession(sessionId ?? '', {
    query: { enabled: !!accessToken && !!sessionId },
    fetch: authHeaders(accessToken),
  })

  if (!sessionId) return null

  const transcript = data?.status === 200 ? data.data.transcript : []
  const groups = groupByDay(transcript)

  return (
    <div className="session-transcript-modal__overlay" onClick={onClose}>
      <div
        className="session-transcript-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-transcript-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="session-transcript-modal__header">
          <div className="session-transcript-modal__header-info">
            <span className="session-transcript-modal__header-icon">
              <img src="/icons/chat-conversation.svg" alt="" />
            </span>
            <div>
              <h2 className="session-transcript-modal__title" id="session-transcript-title">
                {visitorLabel}
              </h2>
              <p className="session-transcript-modal__subtitle">
                Chat transcript · {transcript.length} message{transcript.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button type="button" className="session-transcript-modal__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="session-transcript-modal__body">
          {isLoading ? (
            <p className="session-transcript-modal__status">Loading…</p>
          ) : transcript.length === 0 ? (
            <p className="session-transcript-modal__status">No messages in this session.</p>
          ) : (
            groups.map((group) => (
              <div key={group.day} className="session-transcript-modal__day-group">
                <div className="session-transcript-modal__day-divider">
                  <span>{group.day}</span>
                </div>
                {group.entries.map((entry, index) => {
                  const isVisitor = entry.role === 'user'
                  const rejected = entry.role === 'assistant' && isRejectionMessage(entry.content)
                  return (
                    <div
                      key={index}
                      className={`session-transcript-modal__entry session-transcript-modal__entry--${entry.role}`}
                    >
                      <span
                        className={`session-transcript-modal__avatar session-transcript-modal__avatar--${entry.role}`}
                      >
                        <img src={isVisitor ? '/icons/user.svg' : '/icons/chat-bot.svg'} alt="" />
                      </span>
                      <div className="session-transcript-modal__entry-content-wrap">
                        <div className="session-transcript-modal__entry-header">
                          <span className="session-transcript-modal__entry-role">
                            {isVisitor ? 'Visitor' : entry.role === 'assistant' ? 'Assistant' : entry.role}
                          </span>
                          {rejected && (
                            <span className="session-transcript-modal__entry-badge">Identity rejected</span>
                          )}
                          <span className="session-transcript-modal__entry-time">{formatTime(entry.timestamp)}</span>
                        </div>
                        <p
                          className={`session-transcript-modal__entry-bubble${rejected ? ' session-transcript-modal__entry-bubble--rejected' : ''}`}
                        >
                          {entry.content}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="session-transcript-modal__footer">
          <div className="session-transcript-modal__footer-info">
            <img className="session-transcript-modal__footer-icon" src="/icons/verified-shield.svg" alt="" />
            <div>
              <p className="session-transcript-modal__footer-title">Secure session</p>
              <p className="session-transcript-modal__footer-text">This transcript is only visible to admins.</p>
            </div>
          </div>
          <button type="button" className="session-transcript-modal__close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default SessionTranscriptModal
