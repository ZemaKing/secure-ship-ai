import type { ShipmentCardData, ShipmentStatus } from './types'
import './ShipmentCard.scss'

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  label_created: 'Label Created',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
}

type ShipmentCardProps = {
  data: ShipmentCardData
}

function ShipmentCard({ data }: ShipmentCardProps) {
  return (
    <div className="shipment-card">
      <div className="shipment-card__header">
        <img className="shipment-card__header-icon" src="/icons/shipment.svg" alt="" />
        <p className="shipment-card__title">Shipment Overview</p>
        <span className={`shipment-card__status-badge shipment-card__status-badge--${data.status}`}>
          {STATUS_LABELS[data.status]}
        </span>
      </div>

      <div className="shipment-card__grid">
        <div className="shipment-card__field">
          <span className="shipment-card__field-label">Tracking Number</span>
          <span className="shipment-card__field-value">{data.trackingNumber}</span>
        </div>
        <div className="shipment-card__field">
          <span className="shipment-card__field-label">Carrier</span>
          <span className="shipment-card__field-value">{data.carrier}</span>
        </div>
        <div className="shipment-card__field">
          <span className="shipment-card__field-label">From</span>
          <span className="shipment-card__field-value">{data.origin}</span>
        </div>
        <div className="shipment-card__field">
          <span className="shipment-card__field-label">To</span>
          <span className="shipment-card__field-value">{data.destination}</span>
        </div>
        <div className="shipment-card__field">
          <span className="shipment-card__field-label">Estimated Delivery</span>
          <span className="shipment-card__field-value">{data.estimatedDelivery}</span>
        </div>
        <div className="shipment-card__field">
          <span className="shipment-card__field-label">Last Update</span>
          <span className="shipment-card__field-value">{data.lastUpdate}</span>
        </div>
      </div>

      <div className="shipment-card__items">
        <p className="shipment-card__items-title">
          <img className="shipment-card__header-icon" src="/icons/package.svg" alt="" />
          Shipment Items ({data.items.length})
        </p>
        <table className="shipment-card__items-table">
          <thead>
            <tr>
              <th>Item Description</th>
              <th>Weight (kg)</th>
              <th>Value (USD)</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.weightKg.toFixed(2)}</td>
                <td>{item.declaredValue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ShipmentCard
