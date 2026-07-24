function AdminAccessCard() {
  return (
    <div className="sidebar__admin-card">
      <p className="sidebar__admin-card-title">Admin Access</p>
      <p className="sidebar__admin-card-text">
        Only administrators can modify shipment data.
      </p>
      <a className="sidebar__admin-card-link" href="#">
        Learn more
      </a>
    </div>
  )
}

export default AdminAccessCard
