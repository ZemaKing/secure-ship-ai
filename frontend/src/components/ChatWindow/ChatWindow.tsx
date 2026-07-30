import { useEffect, useRef, useState, type FormEvent } from 'react'
import ChatMessage from './ChatMessage'
import CodeModal from '../CodeModal/CodeModal'
import { useChat } from '../../api/generated/secure-ship'
import { useChatSession } from '../../hooks/useChatSession'
import type { ChatMessageData } from './types'
import './ChatWindow.scss'

const ERROR_REPLY_TEXT = "Sorry, something went wrong reaching the assistant. Please try again."

const SEED_MESSAGES: ChatMessageData[] = [
  {
    id: 'seed-1',
    role: 'bot',
    text: 'Here are the details for shipment TS123456789',
    timestamp: '2:30 PM',
    shipment: {
      trackingNumber: 'TS123456789',
      carrier: 'DHL Express',
      origin: 'Mumbai, India',
      destination: 'New York, USA',
      status: 'in_transit',
      estimatedDelivery: 'May 16, 2024',
      lastUpdate: 'May 13, 2024, 1:30 AM',
      items: [
        { id: 'item-1', description: 'Wireless Headphones', weightKg: 5.2, declaredValue: 520 },
        { id: 'item-2', description: 'Smart Watch Series 9', weightKg: 2.75, declaredValue: 1375 },
      ],
    },
  },
]

function makeMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatTimestamp() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessageData[]>(SEED_MESSAGES)
  const [draft, setDraft] = useState('')
  const { sessionId, event: sessionEvent, applyResponse } = useChatSession()
  const [codeModalKey, setCodeModalKey] = useState(0)
  const [humanJoined, setHumanJoined] = useState(false)
  const chatMutation = useChat()
  const messageListRef = useRef<HTMLDivElement>(null)

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
          setMessages((prev) => [
            ...prev,
            { id: makeMessageId(), role: 'bot', text: replyText, timestamp: formatTimestamp() },
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

  function handleCodeVerified(message: string) {
    setMessages((prev) => [
      ...prev,
      { id: makeMessageId(), role: 'bot', text: message, timestamp: formatTimestamp() },
    ])
  }

  return (
    <section className={`chat-window${humanJoined ? ' chat-window--human-joined' : ''}`}>
      <CodeModal
        key={codeModalKey}
        open={sessionEvent === 'code_sent'}
        sessionId={sessionId ?? ''}
        onVerified={handleCodeVerified}
      />
      <header className="chat-window__header">
        <div className="chat-window__greeting">
          <h1 className="chat-window__greeting-title">
            Hello! <img className="chat-window__greeting-wave-icon" src="/icons/hand-wave.svg" alt="" />
          </h1>
          <p className="chat-window__greeting-subtitle">Ask me anything about your shipments.</p>
        </div>
        <div className="chat-window__disclaimer-banner">
          <img className="chat-window__disclaimer-icon" src="/icons/info.svg" alt="" />
          <span>
            <strong>This AI can make mistakes.</strong>
            <br />
            Please verify important details.
          </span>
        </div>
      </header>

      <div className="chat-window__message-list" ref={messageListRef}>
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} onHumanJoined={() => setHumanJoined(true)} />
        ))}
        {chatMutation.isPending && (
          <ChatMessage
            message={{ id: 'typing-indicator', role: 'bot', text: 'Typing…', timestamp: formatTimestamp() }}
          />
        )}
      </div>

      <form className="chat-window__input-bar" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-window__input"
          placeholder="Ask about any shipment... (e.g., track TS123456789)"
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
      </p>
    </section>
  )
}

export default ChatWindow
