import { useEffect, useRef, useState, type FormEvent } from 'react'
import ChatMessage from './ChatMessage'
import { useChat } from '../../api/generated/secure-ship'
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
  const [sessionId, setSessionId] = useState<string>()
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
            setSessionId(response.data.session_id)
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

  return (
    <section className="chat-window">
      <header className="chat-window__header">
        <div className="chat-window__greeting">
          <h1 className="chat-window__greeting-title">Hello! 👋</h1>
          <p className="chat-window__greeting-subtitle">Ask me anything about your shipments.</p>
        </div>
        <div className="chat-window__disclaimer-banner">
          <span aria-hidden="true">ℹ️</span>
          <span>
            This AI can make mistakes. <br /> Please verify important details.
          </span>
        </div>
      </header>

      <div className="chat-window__message-list" ref={messageListRef}>
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
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
          ➤
        </button>
      </form>
      <p className="chat-window__footer-disclaimer">
        AI responses may be inaccurate. Please verify important details.
      </p>
    </section>
  )
}

export default ChatWindow
