import type { ChatMessageData } from './types'
import ShipmentCard from './ShipmentCard'
import EscalationBanner from '../EscalationBanner/EscalationBanner'
import { useTypewriter } from '../../hooks/useTypewriter'
import './ChatMessage.scss'

type ChatMessageProps = {
  message: ChatMessageData
  onHumanJoined?: () => void
}

function ChatMessage({ message, onHumanJoined }: ChatMessageProps) {
  const isBot = message.role === 'bot'
  // Called unconditionally (before the escalation early return below) since hooks
  // can't be called conditionally — harmless no-op for escalation/user messages,
  // which never read `displayedText` anyway.
  const displayedText = useTypewriter(message.text, { enabled: isBot && !message.isTyping })

  if (message.role === 'escalation' && message.escalation) {
    return <EscalationBanner escalation={message.escalation} onHumanJoined={onHumanJoined} />
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

      {!isBot && <img className="chat-message__avatar" src="/icons/user.svg" alt="" />}
    </div>
  )
}

export default ChatMessage
