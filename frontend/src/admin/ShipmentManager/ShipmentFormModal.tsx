import { useState, type FormEvent } from 'react'
import { ShipmentStatus, type CustomerOut, type ShipmentCreate, type ShipmentOut } from '../../api/generated/secure-ship'
import './ShipmentFormModal.scss'

interface ShipmentFormModalProps {
  open: boolean
  shipment: ShipmentOut | null
  customers: CustomerOut[]
  busy: boolean
  errorMessage: string | null
  onSave: (data: ShipmentCreate) => void
  onCancel: () => void
}

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  label_created: 'Created',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
}

function emptyForm(customers: CustomerOut[]): ShipmentCreate {
  return {
    customer_id: customers[0]?.id ?? '',
    tracking_number: '',
    status: ShipmentStatus.label_created,
    carrier: '',
    origin: '',
    destination: '',
    estimated_delivery: '',
  }
}

// Doubles as both Add and Edit, same as CustomerFormModal — only the title/initial
// values change.
function ShipmentFormModal({ open, shipment, customers, busy, errorMessage, onSave, onCancel }: ShipmentFormModalProps) {
  const [form, setForm] = useState<ShipmentCreate>(() =>
    shipment
      ? {
          customer_id: shipment.customer_id,
          tracking_number: shipment.tracking_number,
          status: shipment.status,
          carrier: shipment.carrier,
          origin: shipment.origin,
          destination: shipment.destination,
          // Trim the time component off — estimated_delivery is a date-only
          // field, but the wire format may include one; <input type="date">
          // requires exactly YYYY-MM-DD.
          estimated_delivery: shipment.estimated_delivery.slice(0, 10),
        }
      : emptyForm(customers),
  )

  if (!open) return null

  const isEdit = shipment !== null

  function handleChange<K extends keyof ShipmentCreate>(field: K, value: ShipmentCreate[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave(form)
  }

  return (
    <div className="shipment-form-modal__overlay" onClick={onCancel}>
      <form
        className="shipment-form-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shipment-form-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="shipment-form-modal__header">
          <h2 className="shipment-form-modal__title" id="shipment-form-title">
            {isEdit ? 'Edit Shipment' : 'Add Shipment'}
          </h2>
          <button type="button" className="shipment-form-modal__close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <p className="shipment-form-modal__subtitle">Enter the shipment details below.</p>

        <label className="shipment-form-modal__label" htmlFor="shipment-customer">
          Customer
        </label>
        <select
          id="shipment-customer"
          className="shipment-form-modal__input"
          value={form.customer_id}
          required
          onChange={(event) => handleChange('customer_id', event.target.value)}
        >
          {customers.length === 0 && <option value="">No customers yet</option>}
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.first_name} {customer.last_name}
            </option>
          ))}
        </select>

        <label className="shipment-form-modal__label" htmlFor="shipment-tracking-number">
          Tracking Number
        </label>
        <input
          id="shipment-tracking-number"
          className="shipment-form-modal__input"
          value={form.tracking_number}
          placeholder="Enter tracking number"
          required
          onChange={(event) => handleChange('tracking_number', event.target.value)}
        />

        <label className="shipment-form-modal__label" htmlFor="shipment-carrier">
          Carrier
        </label>
        <input
          id="shipment-carrier"
          className="shipment-form-modal__input"
          value={form.carrier}
          placeholder="Enter carrier"
          required
          onChange={(event) => handleChange('carrier', event.target.value)}
        />

        <label className="shipment-form-modal__label" htmlFor="shipment-origin">
          Origin
        </label>
        <input
          id="shipment-origin"
          className="shipment-form-modal__input"
          value={form.origin}
          placeholder="Enter origin"
          required
          onChange={(event) => handleChange('origin', event.target.value)}
        />

        <label className="shipment-form-modal__label" htmlFor="shipment-destination">
          Destination
        </label>
        <input
          id="shipment-destination"
          className="shipment-form-modal__input"
          value={form.destination}
          placeholder="Enter destination"
          required
          onChange={(event) => handleChange('destination', event.target.value)}
        />

        <label className="shipment-form-modal__label" htmlFor="shipment-status">
          Status
        </label>
        <select
          id="shipment-status"
          className="shipment-form-modal__input"
          value={form.status}
          onChange={(event) => handleChange('status', event.target.value as ShipmentStatus)}
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label className="shipment-form-modal__label" htmlFor="shipment-estimated-delivery">
          Estimated Delivery
        </label>
        <input
          id="shipment-estimated-delivery"
          className="shipment-form-modal__input"
          type="date"
          value={form.estimated_delivery}
          required
          onChange={(event) => handleChange('estimated_delivery', event.target.value)}
        />

        {errorMessage && <p className="shipment-form-modal__error">{errorMessage}</p>}

        <div className="shipment-form-modal__actions">
          <button type="button" className="shipment-form-modal__cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="shipment-form-modal__save" disabled={busy}>
            {busy ? 'Saving…' : 'Save Shipment'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ShipmentFormModal
