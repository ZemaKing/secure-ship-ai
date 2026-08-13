import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useListShipments, ShipmentStatus, type ShipmentOut } from '../../api/generated/secure-ship'
import { useAdminAccessToken, authHeaders } from '../useAdminAccessToken'
import { formatUpdated, formatUpdatedIcon } from '../../utils/formatDate'
import './Dashboard.scss'

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  label_created: 'Created',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
}

const RECENT_SHIPMENTS_LIMIT = 15

function countByStatus(shipments: ShipmentOut[], status: ShipmentStatus): number {
  return shipments.filter((shipment) => shipment.status === status).length
}

// Stat counts and the recent-shipments list are both derived client-side from the
// same useListShipments() data ShipmentManager already fetches — React Query dedupes
// the request, so this page adds zero extra network calls, no bespoke
// /admin/dashboard/stats endpoint needed. The mockup's "+X% from last month" deltas
// and its System Status/User Management/Quick Actions panels are deliberately left
// out — none of that data exists anywhere in this app's schema, and fabricating it
// would misrepresent what's real.
function Dashboard() {
  const accessToken = useAdminAccessToken()
  const { data } = useListShipments({
    query: { enabled: !!accessToken },
    fetch: authHeaders(accessToken),
  })
  // Gate on data having arrived at least once, not react-query's isLoading — while
  // the query is disabled (accessToken not resolved yet), isLoading is false but
  // data is still undefined, which would otherwise flash empty content before the
  // real fetch even starts.
  const showLoading = data === undefined

  // Derived from `data` (react-query's own stable reference) rather than a fresh
  // `data?.data ?? []` fallback array, which would change identity every render
  // and defeat this memo even when the underlying shipments haven't changed.
  const { stats, recentShipments } = useMemo(() => {
    const shipments = data?.data ?? []
    const stats = [
      {
        key: 'total',
        label: 'Total Shipments',
        value: shipments.length,
        icon: '/icons/dashboard-total.svg',
        to: '/admin/shipments',
      },
      {
        key: 'in_transit',
        label: 'In Transit',
        value: countByStatus(shipments, ShipmentStatus.in_transit),
        icon: '/icons/dashboard-in-transit.svg',
        to: '/admin/shipments?status=in_transit',
      },
      {
        key: 'delivered',
        label: 'Delivered',
        value: countByStatus(shipments, ShipmentStatus.delivered),
        icon: '/icons/dashboard-delivered.svg',
        to: '/admin/shipments?status=delivered',
      },
      {
        key: 'exception',
        label: 'Exceptions',
        value: countByStatus(shipments, ShipmentStatus.exception),
        icon: '/icons/dashboard-warning.svg',
        to: '/admin/shipments?status=exception',
      },
    ]
    // list_shipments (backend) already orders by last_update desc, so the first N
    // rows are the N most recently updated — no client-side sort needed here.
    const recentShipments = shipments.slice(0, RECENT_SHIPMENTS_LIMIT)
    return { stats, recentShipments }
  }, [data])

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">Dashboard</h1>
        <p className="dashboard__subtitle">An overview of shipment activity.</p>
      </div>

      {showLoading ? (
        <p className="dashboard__status">Loading…</p>
      ) : (
        <>
          <div className="dashboard__stats">
            {stats.map((stat) => (
              <Link
                key={stat.key}
                to={stat.to}
                className={`dashboard__stat-card dashboard__stat-card--${stat.key}`}
                title={`View ${stat.label.toLowerCase()} in Shipments`}
              >
                <div className={`dashboard__stat-icon dashboard__stat-icon--${stat.key}`}>
                  <img src={stat.icon} alt="" />
                </div>
                <div>
                  <p className="dashboard__stat-label">{stat.label}</p>
                  <p className="dashboard__stat-value">{stat.value}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="dashboard__panel">
            <div className="dashboard__panel-header">
              <h2 className="dashboard__panel-title">Recent Shipments</h2>
              <Link className="dashboard__view-all" to="/admin/shipments">
                View all
              </Link>
            </div>

            {recentShipments.length === 0 ? (
              <p className="dashboard__status">No shipments yet.</p>
            ) : (
              <div className="dashboard__table-wrapper">
              <table className="dashboard__table">
                <thead>
                  <tr>
                    <th>Tracking Number</th>
                    <th>Status</th>
                    <th>Origin</th>
                    <th>Destination</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentShipments.map((shipment) => (
                    <tr key={shipment.id}>
                      <td>
                        <Link
                          className="dashboard__cell-link"
                          to={`/admin/shipments?search=${encodeURIComponent(shipment.tracking_number)}`}
                        >
                          {shipment.tracking_number}
                        </Link>
                      </td>
                      <td>
                        <span className={`dashboard__status-badge dashboard__status-badge--${shipment.status}`}>
                          {STATUS_LABELS[shipment.status]}
                        </span>
                      </td>
                      <td>
                        <span className="dashboard__icon-cell">
                          <img className="dashboard__icon-cell-icon" src="/icons/location.svg" alt="" />
                          {shipment.origin}
                        </span>
                      </td>
                      <td>
                        <span className="dashboard__icon-cell">
                          <img className="dashboard__icon-cell-icon" src="/icons/location.svg" alt="" />
                          {shipment.destination}
                        </span>
                      </td>
                      <td>
                        <span className="dashboard__icon-cell">
                          <img
                            className="dashboard__icon-cell-icon"
                            src={formatUpdatedIcon(shipment.last_update)}
                            alt=""
                          />
                          {formatUpdated(shipment.last_update)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default Dashboard
