import { useGetChatSession } from '../../api/generated/secure-ship'
import { useAdminAccessToken, authHeaders } from '../useAdminAccessToken'
import { formatDateTime } from '../../utils/formatDate'
import './SessionTranscriptModal.scss'

interface SessionTranscriptModalProps {
  sessionId: string | null
  visitorLabel: string
  onClose: () => void
}

// A rejected identity match isn't its own persisted ChatSessionState — routes/chat.py
// returns this exact fixed string (NEUTRAL_IDENTITY_MESSAGE) and the session just stays
// in CollectingIdentity (see docs/diagrams/6.2's Week 5 correction). DEV_PLAN.md's
// stretch-goal ask is to surface gating-rejection cases in this viewer alongside
// escalation, so this flags that specific reply text rather than inventing a state
// that doesn't exist in the schema.
function isRejectionMessage(content: string): boolean {
  return content.includes("couldn't verify that information")
}

function SessionTranscriptModal({ sessionId, visitorLabel, onClose }: SessionTranscriptModalProps) {
  const accessToken = useAdminAccessToken()
  const { data, isLoading } = useGetChatSession(sessionId ?? '', {
    query: { enabled: !!accessToken && !!sessionId },
    fetch: authHeaders(accessToken),
  })

  if (!sessionId) return null

  const transcript = data?.status === 200 ? data.data.transcript : []

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
          <h2 className="session-transcript-modal__title" id="session-transcript-title">
            {visitorLabel}
          </h2>
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
            transcript.map((entry, index) => {
              const rejected = entry.role === 'assistant' && isRejectionMessage(entry.content)
              return (
                <div
                  key={index}
                  className={`session-transcript-modal__entry session-transcript-modal__entry--${entry.role}${rejected ? ' session-transcript-modal__entry--rejected' : ''}`}
                >
                  <div className="session-transcript-modal__entry-header">
                    <span className="session-transcript-modal__entry-role">
                      {entry.role === 'user' ? 'Visitor' : entry.role === 'assistant' ? 'Assistant' : entry.role}
                    </span>
                    {rejected && (
                      <span className="session-transcript-modal__entry-badge">Identity rejected</span>
                    )}
                    <span className="session-transcript-modal__entry-time">{formatDateTime(entry.timestamp)}</span>
                  </div>
                  <p className="session-transcript-modal__entry-content">{entry.content}</p>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default SessionTranscriptModal
