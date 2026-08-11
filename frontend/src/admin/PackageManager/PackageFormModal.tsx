import { useState, type FormEvent } from 'react'
import type { PackageCreate, PackageOut, ShipmentOut } from '../../api/generated/secure-ship'
import './PackageFormModal.scss'

interface PackageFormModalProps {
  open: boolean
  pkg: PackageOut | null
  shipments: ShipmentOut[]
  busy: boolean
  errorMessage: string | null
  onSave: (data: PackageCreate) => void
  onCancel: () => void
}

function emptyForm(shipments: ShipmentOut[]): PackageCreate {
  return {
    shipment_id: shipments[0]?.id ?? '',
    description: '',
    weight_kg: '',
    declared_value: '',
  }
}

// Doubles as both Add and Edit, same pattern as CustomerFormModal/ShipmentFormModal
// — only the title/initial values change. Applies both fixes those two learned the
// hard way: the remount `key` PackageManager passes down, and picking only the
// PackageCreate-shape fields off the PackageOut prop rather than spreading it
// (which would leak `id`/`tracking_number` into the request body).
function PackageFormModal({ open, pkg, shipments, busy, errorMessage, onSave, onCancel }: PackageFormModalProps) {
  const [form, setForm] = useState<PackageCreate>(() =>
    pkg
      ? {
          shipment_id: pkg.shipment_id,
          description: pkg.description,
          weight_kg: pkg.weight_kg,
          declared_value: pkg.declared_value,
        }
      : emptyForm(shipments),
  )

  if (!open) return null

  const isEdit = pkg !== null

  function handleChange<K extends keyof PackageCreate>(field: K, value: PackageCreate[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave(form)
  }

  return (
    <div className="package-form-modal__overlay" onClick={onCancel}>
      <form
        className="package-form-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="package-form-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="package-form-modal__header">
          <h2 className="package-form-modal__title" id="package-form-title">
            {isEdit ? 'Edit Package' : 'Add Package'}
          </h2>
          <button type="button" className="package-form-modal__close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <p className="package-form-modal__subtitle">Enter the package details below.</p>

        <label className="package-form-modal__label" htmlFor="package-shipment">
          Shipment
        </label>
        <select
          id="package-shipment"
          className="package-form-modal__input"
          value={form.shipment_id}
          required
          onChange={(event) => handleChange('shipment_id', event.target.value)}
        >
          {shipments.length === 0 && <option value="">No shipments yet</option>}
          {shipments.map((shipment) => (
            <option key={shipment.id} value={shipment.id}>
              {shipment.tracking_number} — {shipment.customer_name}
            </option>
          ))}
        </select>

        <label className="package-form-modal__label" htmlFor="package-description">
          Description
        </label>
        <input
          id="package-description"
          className="package-form-modal__input"
          value={form.description}
          placeholder="Enter package description"
          required
          onChange={(event) => handleChange('description', event.target.value)}
        />

        <label className="package-form-modal__label" htmlFor="package-weight">
          Weight (kg)
        </label>
        <input
          id="package-weight"
          className="package-form-modal__input"
          type="number"
          step="0.01"
          min="0"
          value={form.weight_kg}
          required
          onChange={(event) => handleChange('weight_kg', event.target.value)}
        />

        <label className="package-form-modal__label" htmlFor="package-declared-value">
          Declared Value
        </label>
        <input
          id="package-declared-value"
          className="package-form-modal__input"
          type="number"
          step="0.01"
          min="0"
          value={form.declared_value}
          required
          onChange={(event) => handleChange('declared_value', event.target.value)}
        />

        {errorMessage && <p className="package-form-modal__error">{errorMessage}</p>}

        <div className="package-form-modal__actions">
          <button type="button" className="package-form-modal__cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="package-form-modal__save" disabled={busy}>
            {busy ? 'Saving…' : 'Save Package'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default PackageFormModal
