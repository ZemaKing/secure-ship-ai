import { useState } from 'react'
import {
  useListShipments,
  useCreateShipment,
  useUpdateShipment,
  useDeleteShipment,
  useListCustomers,
  ShipmentStatus,
  type ShipmentCreate,
  type ShipmentOut,
} from '../../api/generated/secure-ship'
import { useAdminAccessToken, authHeaders } from '../useAdminAccessToken'
import { formatDate, formatUpdated } from '../../utils/formatDate'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import ShipmentFormModal from './ShipmentFormModal'
import './ShipmentManager.scss'

type FormState = { mode: 'create' } | { mode: 'edit'; shipment: ShipmentOut } | null

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  label_created: 'Created',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
}

function matchesSearch(shipment: ShipmentOut, query: string): boolean {
  const haystack =
    `${shipment.tracking_number} ${shipment.customer_name} ${shipment.carrier} ${shipment.origin} ${shipment.destination}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function ShipmentManager() {
  const accessToken = useAdminAccessToken()
  const [search, setSearch] = useState('')
  const [formState, setFormState] = useState<FormState>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ShipmentOut | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)

  const { data, isLoading, refetch } = useListShipments({
    query: { enabled: !!accessToken },
    fetch: authHeaders(accessToken),
  })
  // Only needed to populate the Add/Edit modal's Customer dropdown — the table
  // itself already gets customer_name straight from ShipmentOut, no join needed.
  const { data: customersData } = useListCustomers({
    query: { enabled: !!accessToken },
    fetch: authHeaders(accessToken),
  })

  const createMutation = useCreateShipment({ fetch: authHeaders(accessToken) })
  const updateMutation = useUpdateShipment({ fetch: authHeaders(accessToken) })
  const deleteMutation = useDeleteShipment({ fetch: authHeaders(accessToken) })

  const shipments = data?.data ?? []
  const customers = customersData?.data ?? []
  const filtered = search.trim() ? shipments.filter((shipment) => matchesSearch(shipment, search.trim())) : shipments

  function handleSave(payload: ShipmentCreate) {
    setFormError(null)
    const onSuccess = () => {
      setFormState(null)
      refetch()
    }
    const onError = () => setFormError("Couldn't save this shipment. Please try again.")

    if (formState?.mode === 'edit') {
      updateMutation.mutate({ shipmentId: formState.shipment.id, data: payload }, { onSuccess, onError })
    } else {
      createMutation.mutate({ data: payload }, { onSuccess, onError })
    }
  }

  // The exact demo gesture: a first-class row action, not buried in the edit
  // form. Sends only {"status": ...} — the partial-update contract
  // services/admin_shipments.py's update_shipment() relies on — so nothing else
  // about the shipment is touched.
  function handleStatusChange(shipment: ShipmentOut, status: ShipmentStatus) {
    setStatusUpdatingId(shipment.id)
    updateMutation.mutate(
      { shipmentId: shipment.id, data: { status } },
      {
        onSuccess: () => {
          setStatusUpdatingId(null)
          refetch()
        },
        onError: () => setStatusUpdatingId(null),
      },
    )
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return
    deleteMutation.mutate(
      { shipmentId: pendingDelete.id },
      {
        onSuccess: (response) => {
          if (response.status === 204) {
            setPendingDelete(null)
            setDeleteError(null)
            refetch()
          } else if (response.status === 409) {
            setDeleteError(response.data.detail)
          } else {
            setDeleteError("Couldn't delete this shipment. Please try again.")
          }
        },
        onError: () => setDeleteError("Couldn't delete this shipment. Please try again."),
      },
    )
  }

  return (
    <div className="shipment-manager">
      <div className="shipment-manager__header">
        <div>
          <h1 className="shipment-manager__title">Shipments</h1>
          <p className="shipment-manager__subtitle">View, search, and manage all shipment records.</p>
        </div>
        <button
          className="shipment-manager__add"
          onClick={() => {
            setFormError(null)
            setFormState({ mode: 'create' })
          }}
        >
          + Add Shipment
        </button>
      </div>

      <input
        className="shipment-manager__search"
        type="search"
        placeholder="Search by tracking number, customer, or carrier…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {isLoading ? (
        <p className="shipment-manager__status">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="shipment-manager__status">No shipments found.</p>
      ) : (
        <table className="shipment-manager__table">
          <thead>
            <tr>
              <th>Tracking Number</th>
              <th>Customer</th>
              <th>Origin</th>
              <th>Destination</th>
              <th>Carrier</th>
              <th>Status</th>
              <th>Est. Delivery</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((shipment) => (
              <tr key={shipment.id}>
                <td>{shipment.tracking_number}</td>
                <td>{shipment.customer_name}</td>
                <td>{shipment.origin}</td>
                <td>{shipment.destination}</td>
                <td>{shipment.carrier}</td>
                <td>
                  <select
                    className={`shipment-manager__status-select shipment-manager__status-select--${shipment.status}`}
                    value={shipment.status}
                    disabled={statusUpdatingId === shipment.id}
                    onChange={(event) => handleStatusChange(shipment, event.target.value as ShipmentStatus)}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{formatDate(shipment.estimated_delivery)}</td>
                <td>{formatUpdated(shipment.last_update)}</td>
                <td className="shipment-manager__actions">
                  <button
                    className="shipment-manager__action"
                    aria-label="Edit"
                    title="Edit"
                    onClick={() => {
                      setFormError(null)
                      setFormState({ mode: 'edit', shipment })
                    }}
                  >
                    <img className="shipment-manager__action-icon" src="/icons/table-edit.svg" alt="" />
                  </button>
                  <button
                    className="shipment-manager__action shipment-manager__action--danger"
                    aria-label="Delete"
                    title="Delete"
                    onClick={() => {
                      setDeleteError(null)
                      setPendingDelete(shipment)
                    }}
                  >
                    <img className="shipment-manager__action-icon" src="/icons/table-delete.svg" alt="" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="shipment-manager__count">
        Showing {filtered.length} of {shipments.length} shipment{shipments.length === 1 ? '' : 's'}
      </p>

      <ShipmentFormModal
        key={formState === null ? 'closed' : formState.mode === 'edit' ? formState.shipment.id : 'create'}
        open={formState !== null}
        shipment={formState?.mode === 'edit' ? formState.shipment : null}
        customers={customers}
        busy={createMutation.isPending || updateMutation.isPending}
        errorMessage={formError}
        onSave={handleSave}
        onCancel={() => setFormState(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete shipment?"
        message={deleteError ?? `Delete shipment ${pendingDelete?.tracking_number}? This can't be undone.`}
        busy={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

export default ShipmentManager
