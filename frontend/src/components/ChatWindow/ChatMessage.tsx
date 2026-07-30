import type { ChatMessageData } from './types'
import ShipmentCard from './ShipmentCard'
import EscalationBanner from '../EscalationBanner/EscalationBanner'
import './ChatMessage.scss'

type ChatMessageProps = {
  message: ChatMessageData
  onHumanJoined?: () => void
}

function ChatMessage({ message, onHumanJoined }: ChatMessageProps) {
  if (message.role === 'escalation' && message.escalation) {
    return <EscalationBanner escalation={message.escalation} onHumanJoined={onHumanJoined} />
  }

  const isBot = message.role === 'bot'

  return (
    <div className={`chat-message chat-message--${message.role}`}>
      {isBot && <img className="chat-message__avatar" src="/icons/chat-bot.svg" alt="" />}

      <div className="chat-message__content">
        <div className="chat-message__bubble">
          <span className="chat-message__text">{message.text}</span>
          <span className="chat-message__timestamp">{message.timestamp}</span>
        </div>
        {message.shipment && <ShipmentCard data={message.shipment} />}
      </div>

      {!isBot && <img className="chat-message__avatar" src="/icons/user.svg" alt="" />}
    </div>
  )
}

export default ChatMessage
