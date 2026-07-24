import type { ChatMessageData } from './types'
import ShipmentCard from './ShipmentCard'
import './ChatMessage.scss'

type ChatMessageProps = {
  message: ChatMessageData
}

function ChatMessage({ message }: ChatMessageProps) {
  const isBot = message.role === 'bot'

  return (
    <div className={`chat-message chat-message--${message.role}`}>
      {isBot && (
        <span className="chat-message__avatar" aria-hidden="true">
          🤖
        </span>
      )}

      <div className="chat-message__content">
        <div className="chat-message__bubble">
          <span className="chat-message__text">{message.text}</span>
          <span className="chat-message__timestamp">{message.timestamp}</span>
        </div>
        {message.shipment && <ShipmentCard data={message.shipment} />}
      </div>

      {!isBot && (
        <span className="chat-message__avatar" aria-hidden="true">
          🧑
        </span>
      )}
    </div>
  )
}

export default ChatMessage
