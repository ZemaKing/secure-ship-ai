import { Link } from 'react-router-dom'

function AdminAccessCard() {
  return (
    <div className="sidebar__admin-card">
      <p className="sidebar__admin-card-title">
        <img className="sidebar__admin-card-icon" src="/icons/modal-code.svg" alt="" />
        Admin Access
      </p>
      <p className="sidebar__admin-card-text">
        Only administrators can modify shipment data.
      </p>
      <Link className="sidebar__admin-card-button" to="/admin">
        <img className="sidebar__admin-card-button-icon" src="/icons/admin-access.svg" alt="" />
        Administrator Panel
      </Link>
    </div>
  )
}

export default AdminAccessCard
