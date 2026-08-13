import { NavLink, Outlet } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import './AdminLayout.scss'

interface AdminNavItem {
  label: string
  path: string
  icon: string
  enabled: boolean
}

const NAV_ITEMS: AdminNavItem[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: '/icons/admin-dashboard.svg', enabled: true },
  { label: 'Customers', path: '/admin/customers', icon: '/icons/admin-customers.svg', enabled: true },
  { label: 'Shipments', path: '/admin/shipments', icon: '/icons/admin-shipments.svg', enabled: true },
  { label: 'Packages', path: '/admin/packages', icon: '/icons/admin-packages.svg', enabled: true },
  { label: 'Chat Sessions', path: '/admin/sessions', icon: '/icons/admin-chat-sessions.svg', enabled: true },
]

function AdminLayout() {
  const { logout } = useAuth0()

  return (
    <div className="admin-layout">
      <aside className="admin-layout__sidebar">
        <div className="admin-layout__brand">
          <img className="admin-layout__brand-icon" src="/icons/chat-admin.svg" alt="" />
          <div className="admin-layout__brand-text">
            <p className="admin-layout__brand-title">AI Shipment Assistant</p>
            <p className="admin-layout__brand-subtitle">Admin Access</p>
          </div>
        </div>

        <nav className="admin-layout__nav">
          {NAV_ITEMS.map((item) =>
            item.enabled ? (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `admin-layout__nav-item${isActive ? ' admin-layout__nav-item--active' : ''}`
                }
              >
                <img className="admin-layout__nav-item-icon" src={item.icon} alt="" />
                {item.label}
              </NavLink>
            ) : (
              <span key={item.path} className="admin-layout__nav-item admin-layout__nav-item--disabled">
                <img className="admin-layout__nav-item-icon" src={item.icon} alt="" />
                {item.label}
                <span className="admin-layout__nav-item-soon">Soon</span>
              </span>
            ),
          )}
        </nav>

        <div className="admin-layout__spacer" />
      </aside>

      <div className="admin-layout__main">
        <header className="admin-layout__header">
          <button
            className="admin-layout__logout"
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          >
            <img className="admin-layout__logout-icon" src="/icons/logout.svg" alt="" />
            Logout
          </button>
        </header>
        <div className="admin-layout__content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default AdminLayout
