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
      <a className="sidebar__admin-card-link" href="#">
        Learn more
      </a>
    </div>
  )
}

export default AdminAccessCard
