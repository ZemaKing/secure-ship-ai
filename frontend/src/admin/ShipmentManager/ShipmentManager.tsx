import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { formatDate, formatUpdated, formatUpdatedIcon } from '../../utils/formatDate'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import ShipmentFormModal from './ShipmentFormModal'
import Pagination from '../Pagination/Pagination'
import './ShipmentManager.scss'

const PAGE_SIZE = 15

type FormState = { mode: 'create' } | { mode: 'edit'; shipment: ShipmentOut } | null
type SortDirection = 'asc' | 'desc'
type SortKey = 'tracking_number' | 'customer_name' | 'carrier' | 'status' | 'estimated_delivery' | 'last_update'

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

function sortValue(shipment: ShipmentOut, key: SortKey): string | number {
  switch (key) {
    case 'status':
      return STATUS_LABELS[shipment.status]
    case 'estimated_delivery':
      return new Date(shipment.estimated_delivery).getTime()
    case 'last_update':
      return new Date(shipment.last_update).getTime()
    default:
      return shipment[key].toLowerCase()
  }
}

function compareShipments(a: ShipmentOut, b: ShipmentOut, key: SortKey, direction: SortDirection): number {
  const left = sortValue(a, key)
  const right = sortValue(b, key)
  const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
  return direction === 'asc' ? comparison : -comparison
}

function ShipmentManager() {
  const accessToken = useAdminAccessToken()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const setSearch = (value: string) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        if (value) next.set('search', value)
        else next.delete('search')
        return next
      },
      { replace: true },
    )
    setPage(1)
  }
  const statusFilter = searchParams.get('status') ?? 'all'
  const setStatusFilter = (value: string) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        if (value !== 'all') next.set('status', value)
        else next.delete('status')
        return next
      },
      { replace: true },
    )
    setPage(1)
  }
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('last_update')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
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
  const filtered = shipments
    .filter((shipment) => (search.trim() ? matchesSearch(shipment, search.trim()) : true))
    .filter((shipment) => (statusFilter === 'all' ? true : shipment.status === statusFilter))
  const sorted = [...filtered].sort((a, b) => compareShipments(a, b, sortKey, sortDirection))
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  function handleCustomerClick(shipment: ShipmentOut) {
    navigate(`/admin/customers?search=${encodeURIComponent(shipment.customer_name)}`)
  }

  function handleTrackingClick(shipment: ShipmentOut) {
    navigate(`/admin/packages?search=${encodeURIComponent(shipment.tracking_number)}`)
  }

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

  function sortableHeader(key: SortKey, label: string) {
    const isActive = sortKey === key
    return (
      <th key={key}>
        <button
          className={`shipment-manager__sort${isActive ? ' shipment-manager__sort--active' : ''}`}
          onClick={() => handleSort(key)}
        >
          {label}
          <span className="shipment-manager__sort-icon" aria-hidden="true">
            {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        </button>
      </th>
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

      <div className="shipment-manager__filters">
        <input
          className="shipment-manager__search"
          type="search"
          placeholder="Search by tracking number, customer, or carrier…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="shipment-manager__status-filter"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="shipment-manager__status">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="shipment-manager__status">No shipments found.</p>
      ) : (
        <div className="shipment-manager__table-wrapper">
          <table className="shipment-manager__table">
          <thead>
            <tr>
              {sortableHeader('tracking_number', 'Tracking Number')}
              {sortableHeader('customer_name', 'Customer')}
              <th>Origin</th>
              <th>Destination</th>
              {sortableHeader('carrier', 'Carrier')}
              {sortableHeader('status', 'Status')}
              {sortableHeader('estimated_delivery', 'Est. Delivery')}
              {sortableHeader('last_update', 'Updated')}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((shipment) => (
              <tr key={shipment.id}>
                <td>
                  <button
                    className="shipment-manager__cell-link"
                    title={`View packages for ${shipment.tracking_number}`}
                    onClick={() => handleTrackingClick(shipment)}
                  >
                    {shipment.tracking_number}
                  </button>
                </td>
                <td>
                  <button
                    className="shipment-manager__cell-link"
                    title={`View ${shipment.customer_name} in Customers`}
                    onClick={() => handleCustomerClick(shipment)}
                  >
                    {shipment.customer_name}
                  </button>
                </td>
                <td>
                  <span className="shipment-manager__icon-cell">
                    <img className="shipment-manager__icon-cell-icon" src="/icons/location.svg" alt="" />
                    {shipment.origin}
                  </span>
                </td>
                <td>
                  <span className="shipment-manager__icon-cell">
                    <img className="shipment-manager__icon-cell-icon" src="/icons/location.svg" alt="" />
                    {shipment.destination}
                  </span>
                </td>
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
                <td>
                  <span className="shipment-manager__icon-cell">
                    <img className="shipment-manager__icon-cell-icon" src="/icons/calendar.svg" alt="" />
                    {formatDate(shipment.estimated_delivery)}
                  </span>
                </td>
                <td>
                  <span className="shipment-manager__icon-cell">
                    <img
                      className="shipment-manager__icon-cell-icon"
                      src={formatUpdatedIcon(shipment.last_update)}
                      alt=""
                    />
                    {formatUpdated(shipment.last_update)}
                  </span>
                </td>
                <td>
                  <div className="shipment-manager__actions">
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={currentPage}
        totalItems={sorted.length}
        pageSize={PAGE_SIZE}
        itemLabel={`shipment${sorted.length === 1 ? '' : 's'}`}
        onPageChange={setPage}
      />

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
