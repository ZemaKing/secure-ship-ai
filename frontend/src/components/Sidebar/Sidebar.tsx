import ChatHistoryList from './ChatHistoryList'
import AdminAccessCard from './AdminAccessCard'
import './Sidebar.scss'

type SidebarProps = {
  onNewChat: () => void
}

function Sidebar({ onNewChat }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-icon" aria-hidden="true">
          🤖
        </span>
        <div>
          <p className="sidebar__brand-title">AI Shipment Assistant</p>
          <p className="sidebar__brand-subtitle">Your smart logistics partner</p>
        </div>
      </div>

      <button type="button" className="sidebar__new-chat-button" onClick={onNewChat}>
        + New Chat
      </button>

      <ChatHistoryList />

      <div className="sidebar__spacer" />

      <AdminAccessCard />
    </aside>
  )
}

export default Sidebar
