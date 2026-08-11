import { useState, type FormEvent } from 'react'
import type { CustomerCreate, CustomerOut } from '../../api/generated/secure-ship'
import './CustomerFormModal.scss'

interface CustomerFormModalProps {
  open: boolean
  customer: CustomerOut | null
  busy: boolean
  errorMessage: string | null
  onSave: (data: CustomerCreate) => void
  onCancel: () => void
}

const EMPTY_FORM: CustomerCreate = { first_name: '', last_name: '', phone_number: '', address: '' }

// Doubles as both Add and Edit — same layout, only the title/submit label and the
// initial field values change, per admin-modals.png's own "(Doubles as Edit
// Customer)" note.
function CustomerFormModal({ open, customer, busy, errorMessage, onSave, onCancel }: CustomerFormModalProps) {
  // Pick only the editable fields off `customer` (a CustomerOut, which also
  // carries `id`) rather than spreading it directly — otherwise `id` rides along
  // into the PATCH body every edit submits.
  const [form, setForm] = useState<CustomerCreate>(() =>
    customer
      ? {
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone_number: customer.phone_number,
          address: customer.address,
        }
      : EMPTY_FORM,
  )

  if (!open) return null

  const isEdit = customer !== null

  function handleChange(field: keyof CustomerCreate, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave(form)
  }

  return (
    <div className="customer-form-modal__overlay" onClick={onCancel}>
      <form
        className="customer-form-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-form-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="customer-form-modal__header">
          <h2 className="customer-form-modal__title" id="customer-form-title">
            {isEdit ? 'Edit Customer' : 'Add Customer'}
          </h2>
          <button type="button" className="customer-form-modal__close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <p className="customer-form-modal__subtitle">Enter the customer details below.</p>

        <label className="customer-form-modal__label" htmlFor="customer-first-name">
          First Name
        </label>
        <input
          id="customer-first-name"
          className="customer-form-modal__input"
          value={form.first_name}
          placeholder="Enter first name"
          required
          onChange={(event) => handleChange('first_name', event.target.value)}
        />

        <label className="customer-form-modal__label" htmlFor="customer-last-name">
          Last Name
        </label>
        <input
          id="customer-last-name"
          className="customer-form-modal__input"
          value={form.last_name}
          placeholder="Enter last name"
          required
          onChange={(event) => handleChange('last_name', event.target.value)}
        />

        <label className="customer-form-modal__label" htmlFor="customer-phone">
          Phone Number
        </label>
        <input
          id="customer-phone"
          className="customer-form-modal__input"
          value={form.phone_number}
          placeholder="Enter phone number"
          required
          onChange={(event) => handleChange('phone_number', event.target.value)}
        />

        <label className="customer-form-modal__label" htmlFor="customer-address">
          Address
        </label>
        <textarea
          id="customer-address"
          className="customer-form-modal__textarea"
          value={form.address}
          placeholder="Enter address"
          required
          onChange={(event) => handleChange('address', event.target.value)}
        />

        {errorMessage && <p className="customer-form-modal__error">{errorMessage}</p>}

        <div className="customer-form-modal__actions">
          <button type="button" className="customer-form-modal__cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="customer-form-modal__save" disabled={busy}>
            {busy ? 'Saving…' : 'Save Customer'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CustomerFormModal
