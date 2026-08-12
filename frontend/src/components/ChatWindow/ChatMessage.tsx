import type { ChatMessageData } from './types'
import ShipmentCard from './ShipmentCard'
import EscalationBanner from '../EscalationBanner/EscalationBanner'
import { useTypewriter } from '../../hooks/useTypewriter'
import './ChatMessage.scss'

type ChatMessageProps = {
  message: ChatMessageData
  onHumanJoined?: () => void
  verified?: boolean
}

function ChatMessage({ message, onHumanJoined, verified }: ChatMessageProps) {
  const isBot = message.role === 'bot'
  // Called unconditionally (before the escalation/verified early returns below)
  // since hooks can't be called conditionally — harmless no-op for message roles
  // that never read `displayedText` anyway.
  const displayedText = useTypewriter(message.text, { enabled: isBot && !message.isTyping })

  if (message.role === 'escalation' && message.escalation) {
    return <EscalationBanner escalation={message.escalation} onHumanJoined={onHumanJoined} />
  }

  if (message.role === 'verified') {
    return (
      <div className="chat-message chat-message--verified-card">
        <img className="chat-message__verified-card-icon" src="/icons/verified-user.svg" alt="" />
        <div className="chat-message__verified-card-body">
          <p className="chat-message__verified-card-title">Identity verified successfully</p>
          <p className="chat-message__verified-card-text">I can now help with your shipment details and history.</p>
        </div>
        <span className="chat-message__timestamp">{message.timestamp}</span>
      </div>
    )
  }

  const isTypingOut = isBot && !message.isTyping && displayedText.length < message.text.length

  return (
    <div className={`chat-message chat-message--${message.role}`}>
      {isBot && <img className="chat-message__avatar" src="/icons/chat-bot.svg" alt="" />}

      <div className="chat-message__content">
        <div className="chat-message__bubble">
          {message.isTyping ? (
            <span className="chat-message__typing-indicator" role="status" aria-label={message.text}>
              <span className="chat-message__typing-loader" aria-hidden="true" />
            </span>
          ) : (
            <>
              <span className="chat-message__text">
                {displayedText}
                {isTypingOut && <span className="chat-message__text-cursor" aria-hidden="true" />}
              </span>
              <span className="chat-message__timestamp">{message.timestamp}</span>
            </>
          )}
        </div>
        {message.shipments?.map((shipment) => (
          <ShipmentCard key={shipment.trackingNumber} data={shipment} />
        ))}
      </div>

      {!isBot && (
        <span className="chat-message__avatar-wrap">
          <img className="chat-message__avatar" src="/icons/user.svg" alt="" />
          {verified && (
            <img className="chat-message__verified-badge" src="/icons/verified-user.svg" alt="Verified" />
          )}
        </span>
      )}
    </div>
  )
}

export default ChatMessage
