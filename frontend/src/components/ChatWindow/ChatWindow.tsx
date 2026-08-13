import { useEffect, useRef, useState, type FormEvent } from 'react'
import ChatMessage from './ChatMessage'
import CodeModal from '../CodeModal/CodeModal'
import { useChat } from '../../api/generated/secure-ship'
import type { ShipmentPayload } from '../../api/generated/secure-ship'
import { useChatSession } from '../../hooks/useChatSession'
import { formatDate, formatDateTime } from '../../utils/formatDate'
import type { ChatMessageData, ShipmentCardData } from './types'
import './ChatWindow.scss'

const ERROR_REPLY_TEXT = "Sorry, something went wrong reaching the assistant. Please try again."

// Matched to what the backend actually does, not just plausible-sounding chat copy:
// lookup_shipments() (backend/tools/lookup_shipments.py) returns every shipment for the
// verified visitor with no tracking-number argument at all (Epic F3 — the tool schema has
// no such parameter), so a starter prompt naming a specific tracking number would imply
// a capability that doesn't exist. "Where is my shipment now?" also isn't just generic
// small talk — routes/chat.py's _mentions_shipment() fallback specifically flips a
// from-scratch session into identity collection on wording like this.
const SUGGESTED_PROMPTS = [
  'Where is my shipment now?',
  'When will my package be delivered?',
  'Do I have any shipments in transit?',
  'I want to talk to a human',
]

function makeMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatTimestamp() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// The backend's wire format (snake_case, generated from schemas/chat.py) is kept
// separate from ShipmentCardData (camelCase) — the component's own presentation
// shape, unchanged since it was first built against a hardcoded mock (Week 1).
function toShipmentCardData(payload: ShipmentPayload): ShipmentCardData {
  return {
    trackingNumber: payload.tracking_number,
    carrier: payload.carrier,
    origin: payload.origin,
    destination: payload.destination,
    status: payload.status as ShipmentCardData['status'],
    estimatedDelivery: formatDate(payload.estimated_delivery),
    lastUpdate: formatDateTime(payload.last_update),
    items: payload.packages.map((item) => ({
      id: item.id,
      description: item.description,
      weightKg: Number(item.weight_kg),
      declaredValue: Number(item.declared_value),
    })),
  }
}

function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [draft, setDraft] = useState('')
  const {
    sessionId,
    state: sessionState,
    verifiedCustomerName,
    setVerifiedCustomerName,
    applyResponse,
  } = useChatSession()
  const [codeModalKey, setCodeModalKey] = useState(0)
  // Decoupled from the response's one-shot `event` field — that only reads
  // "code_sent" on the exact turn the code was sent, so relying on it directly
  // would make the modal impossible to reopen after a dismiss or after sending
  // an unrelated message. `sessionState` (persisted across turns) still gates
  // whether reopening makes sense at all.
  const [codeModalOpen, setCodeModalOpen] = useState(false)
  const [humanJoined, setHumanJoined] = useState(false)
  const chatMutation = useChat()
  const messageListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight })
  }, [messages, chatMutation.isPending])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || chatMutation.isPending) return

    setMessages((prev) => [
      ...prev,
      { id: makeMessageId(), role: 'user', text, timestamp: formatTimestamp() },
    ])
    setDraft('')

    chatMutation.mutate(
      { data: { message: text, session_id: sessionId } },
      {
        onSuccess: (response) => {
          const replyText = response.status === 200 ? response.data.reply : ERROR_REPLY_TEXT
          if (response.status === 200) {
            applyResponse(response.data)
            if (response.data.event === 'code_sent') {
              // Forces CodeModal to remount with fresh internal state (digits/dismissed/
              // verified) every time a genuinely new code is sent — including a resend
              // after a lockout, where the event string value is identical to before and
              // wouldn't otherwise be seen as "changed."
              setCodeModalKey((key) => key + 1)
              setCodeModalOpen(true)
            }
            const { escalation } = response.data
            if (response.data.event === 'escalated' && escalation) {
              setMessages((prev) => [
                ...prev,
                {
                  id: makeMessageId(),
                  role: 'escalation',
                  text: replyText,
                  timestamp: formatTimestamp(),
                  escalation,
                },
              ])
              return
            }
          }
          const shipments =
            response.status === 200 ? response.data.shipments?.map(toShipmentCardData) : undefined
          setMessages((prev) => [
            ...prev,
            { id: makeMessageId(), role: 'bot', text: replyText, timestamp: formatTimestamp(), shipments },
          ])
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            { id: makeMessageId(), role: 'bot', text: ERROR_REPLY_TEXT, timestamp: formatTimestamp() },
          ])
        },
      },
    )
  }

  function handleSuggestedPrompt(text: string) {
    // Prefills the input rather than sending immediately — the visitor still
    // reviews/edits before it goes out, same as if they'd typed it themselves.
    setDraft(text)
    inputRef.current?.focus()
  }

  function handleReopenCodeModal() {
    // A remount (fresh key) clears the modal's own dismissed/feedback/locked
    // state — the server-side pending code/attempt count is untouched either
    // way, so this is purely a UI reset, not a resend.
    setCodeModalKey((key) => key + 1)
    setCodeModalOpen(true)
  }

  function handleCodeVerified(message: string, customerName: string | null) {
    setVerifiedCustomerName(customerName)
    // The green "Identity verified successfully" card already says everything
    // the backend's plain-text reply would — showing both read as a doubled
    // message, so the card replaces it on a real success rather than sitting
    // alongside it.
    setMessages((prev) => [
      ...prev,
      customerName
        ? { id: makeMessageId(), role: 'verified' as const, text: '', timestamp: formatTimestamp() }
        : { id: makeMessageId(), role: 'bot' as const, text: message, timestamp: formatTimestamp() },
    ])
  }

  return (
    <section className={`chat-window${humanJoined ? ' chat-window--human-joined' : ''}`}>
      <CodeModal
        key={codeModalKey}
        open={codeModalOpen}
        sessionId={sessionId ?? ''}
        onVerified={handleCodeVerified}
        onClose={() => setCodeModalOpen(false)}
      />
      <header className="chat-window__header">
        <div className="chat-window__greeting">
          <h1 className="chat-window__greeting-title">
            Hello! <img className="chat-window__greeting-wave-icon" src="/icons/hand-wave.svg" alt="" />
          </h1>
          <p className="chat-window__greeting-subtitle">Ask me anything about your shipments.</p>
          {verifiedCustomerName && (
            <div className="chat-window__verified-pill">
              <img className="chat-window__verified-pill-icon" src="/icons/verified-shield.svg" alt="" />
              <span className="chat-window__verified-pill-label">Identity verified</span>
              <span className="chat-window__verified-pill-separator">·</span>
              <span className="chat-window__verified-pill-name">{verifiedCustomerName}</span>
            </div>
          )}
        </div>
      </header>

      <div className="chat-window__message-list" ref={messageListRef}>
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onHumanJoined={() => setHumanJoined(true)}
            verified={!!verifiedCustomerName}
          />
        ))}
        {chatMutation.isPending && (
          <ChatMessage
            message={{
              id: 'typing-indicator',
              role: 'bot',
              text: 'Typing…',
              timestamp: formatTimestamp(),
              isTyping: true,
            }}
          />
        )}
      </div>

      <div className="chat-window__suggestions">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="chat-window__suggestion-pill"
            onClick={() => handleSuggestedPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      {sessionState === 'awaiting_code' && !codeModalOpen && (
        <div className="chat-window__code-reminder">
          <img className="chat-window__code-reminder-icon" src="/icons/modal-security-lock.svg" alt="" />
          <span className="chat-window__code-reminder-text">
            We sent a verification code to your phone. Missed it?
          </span>
          <button
            type="button"
            className="chat-window__code-reminder-action"
            onClick={handleReopenCodeModal}
          >
            Enter code
          </button>
        </div>
      )}

      <form className="chat-window__input-bar" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="chat-window__input"
          placeholder={
            verifiedCustomerName ? 'Ask about your verified shipments...' : 'Ask about any shipment...'
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={chatMutation.isPending}
        />
        <button
          type="submit"
          className="chat-window__send-button"
          aria-label="Send message"
          disabled={chatMutation.isPending}
        >
          <img className="chat-window__send-icon" src="/icons/send.svg" alt="" />
        </button>
      </form>
      <p className="chat-window__footer-disclaimer">
        AI responses may be inaccurate. Please verify important details.
        <span className="chat-window__footer-secure">
          <img className="chat-window__footer-secure-icon" src="/icons/verified-shield.svg" alt="" />
          Your data is secure and encrypted.
        </span>
      </p>
    </section>
  )
}

export default ChatWindow
