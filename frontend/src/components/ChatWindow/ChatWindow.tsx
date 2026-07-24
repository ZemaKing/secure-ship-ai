import { useState, type FormEvent } from 'react'
import ChatMessage from './ChatMessage'
import type { ChatMessageData } from './types'
import './ChatWindow.scss'

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return

    setMessages((prev) => [
      ...prev,
      { id: makeMessageId(), role: 'user', text, timestamp: formatTimestamp() },
    ])
    setDraft('')
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

      <div className="chat-window__message-list">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </div>

      <form className="chat-window__input-bar" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-window__input"
          placeholder="Ask about any shipment... (e.g., track TS123456789)"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="chat-window__send-button" aria-label="Send message">
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
