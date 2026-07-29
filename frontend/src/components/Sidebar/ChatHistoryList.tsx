const HARDCODED_HISTORY = [
  { id: '1', label: 'Track shipment TS123456789', time: '2:30 PM' },
  { id: '2', label: 'Where is my order ORD98765?', time: '11:20 AM' },
  { id: '3', label: 'Shipment details for 789456123', time: 'Yesterday' },
]

function ChatHistoryList() {
  return (
    <div className="sidebar__section">
      <span className="sidebar__section-label">
        <img className="sidebar__section-label-icon" src="/icons/chat-history.svg" alt="" />
        Chat History
      </span>
      <ul className="sidebar__chat-history">
        {HARDCODED_HISTORY.map((item) => (
          <li key={item.id} className="sidebar__chat-history-item">
            <span className="sidebar__chat-history-item-label">{item.label}</span>
            <span className="sidebar__chat-history-item-time">{item.time}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ChatHistoryList
