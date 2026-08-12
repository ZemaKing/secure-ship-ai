import AdminAccessCard from './AdminAccessCard'
import './Sidebar.scss'

type SidebarProps = {
  onNewChat: () => void
}

function Sidebar({ onNewChat }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <img className="sidebar__brand-icon" src="/icons/chat-bot.svg" alt="" />
        <div>
          <p className="sidebar__brand-title">AI Shipment Assistant</p>
          <p className="sidebar__brand-subtitle">Your smart logistics partner</p>
        </div>
      </div>

      <button type="button" className="sidebar__new-chat-button" onClick={onNewChat}>
        <img className="sidebar__new-chat-icon" src="/icons/new-chat.svg" alt="" />
        New Chat
      </button>

      <div className="sidebar__spacer" />

      <AdminAccessCard />
    </aside>
  )
}

export default Sidebar
