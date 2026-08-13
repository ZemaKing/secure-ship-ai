import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  type CustomerCreate,
  type CustomerOut,
} from '../../api/generated/secure-ship'
import { useAdminAccessToken, authHeaders } from '../useAdminAccessToken'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import CustomerFormModal from './CustomerFormModal'
import Pagination from '../Pagination/Pagination'
import './CustomerManager.scss'

const PAGE_SIZE = 15

type FormState = { mode: 'create' } | { mode: 'edit'; customer: CustomerOut } | null
type SortDirection = 'asc' | 'desc'

function matchesSearch(customer: CustomerOut, query: string): boolean {
  const haystack = `${customer.first_name} ${customer.last_name} ${customer.phone_number} ${customer.address}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function fullName(customer: CustomerOut): string {
  return `${customer.first_name} ${customer.last_name}`
}

// Plain, labeled block — meant to be pasted straight into the chat window as
// answers to the identity-verification questions the bot asks for (name/phone/
// address), not a JSON dump an end user would never actually type themselves.
function toClipboardText(customer: CustomerOut): string {
  return [
    `First Name: ${customer.first_name}`,
    `Last Name: ${customer.last_name}`,
    `Phone Number: ${customer.phone_number}`,
    `Address: ${customer.address}`,
  ].join('\n')
}

function CustomerManager() {
  const accessToken = useAdminAccessToken()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const setSearch = (value: string) => {
    setSearchParams(value ? { search: value } : {}, { replace: true })
    setPage(1)
  }
  const [page, setPage] = useState(1)
  const [nameSort, setNameSort] = useState<SortDirection>('asc')
  const [formState, setFormState] = useState<FormState>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CustomerOut | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data, isLoading, refetch } = useListCustomers({
    query: { enabled: !!accessToken },
    fetch: authHeaders(accessToken),
  })

  const createMutation = useCreateCustomer({ fetch: authHeaders(accessToken) })
  const updateMutation = useUpdateCustomer({ fetch: authHeaders(accessToken) })
  const deleteMutation = useDeleteCustomer({ fetch: authHeaders(accessToken) })

  const customers = data?.data ?? []
  const filtered = search.trim() ? customers.filter((customer) => matchesSearch(customer, search.trim())) : customers
  const sorted = [...filtered].sort((a, b) => {
    const comparison = fullName(a).localeCompare(fullName(b))
    return nameSort === 'asc' ? comparison : -comparison
  })
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function handleSave(payload: CustomerCreate) {
    setFormError(null)
    const onSuccess = () => {
      setFormState(null)
      refetch()
    }
    const onError = () => setFormError("Couldn't save this customer. Please try again.")

    if (formState?.mode === 'edit') {
      updateMutation.mutate(
        { customerId: formState.customer.id, data: payload },
        { onSuccess, onError },
      )
    } else {
      createMutation.mutate({ data: payload }, { onSuccess, onError })
    }
  }

  function handleNameClick(customer: CustomerOut) {
    navigate(`/admin/shipments?search=${encodeURIComponent(fullName(customer))}`)
  }

  function handleCopy(customer: CustomerOut) {
    navigator.clipboard.writeText(toClipboardText(customer)).then(() => {
      setCopiedId(customer.id)
      setTimeout(() => setCopiedId((current) => (current === customer.id ? null : current)), 1500)
    })
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return
    deleteMutation.mutate(
      { customerId: pendingDelete.id },
      {
        onSuccess: (response) => {
          if (response.status === 204) {
            setPendingDelete(null)
            setDeleteError(null)
            refetch()
          } else if (response.status === 409) {
            setDeleteError(response.data.detail)
          } else {
            setDeleteError("Couldn't delete this customer. Please try again.")
          }
        },
        onError: () => setDeleteError("Couldn't delete this customer. Please try again."),
      },
    )
  }

  return (
    <div className="customer-manager">
      <div className="customer-manager__header">
        <div>
          <h1 className="customer-manager__title">Customers</h1>
          <p className="customer-manager__subtitle">View, search, and manage all customers.</p>
        </div>
        <button
          className="customer-manager__add"
          onClick={() => {
            setFormError(null)
            setFormState({ mode: 'create' })
          }}
        >
          + Add Customer
        </button>
      </div>

      <input
        className="customer-manager__search"
        type="search"
        placeholder="Search by name, phone number, or address…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {isLoading ? (
        <p className="customer-manager__status">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="customer-manager__status">No customers found.</p>
      ) : (
        <table className="customer-manager__table">
          <thead>
            <tr>
              <th>
                <button
                  className="customer-manager__sort"
                  onClick={() => setNameSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
                >
                  Name
                  <span className="customer-manager__sort-icon" aria-hidden="true">
                    {nameSort === 'asc' ? '▲' : '▼'}
                  </span>
                </button>
              </th>
              <th>Phone Number</th>
              <th>Address</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <button
                    className="customer-manager__cell-link"
                    title={`View ${fullName(customer)}'s shipments`}
                    onClick={() => handleNameClick(customer)}
                  >
                    {customer.first_name} {customer.last_name}
                  </button>
                </td>
                <td>
                  <span className="customer-manager__icon-cell">
                    <img className="customer-manager__icon-cell-icon" src="/icons/telephone.svg" alt="" />
                    {customer.phone_number}
                  </span>
                </td>
                <td>
                  <span className="customer-manager__icon-cell">
                    <img className="customer-manager__icon-cell-icon" src="/icons/location.svg" alt="" />
                    {customer.address}
                  </span>
                </td>
                <td>
                  <div className="customer-manager__actions">
                    <button
                      className={`customer-manager__action customer-manager__action--copy${copiedId === customer.id ? ' customer-manager__action--copied' : ''}`}
                      aria-label="Copy to clipboard"
                      title={copiedId === customer.id ? 'Copied!' : 'Copy to clipboard'}
                      onClick={() => handleCopy(customer)}
                    >
                      <img className="customer-manager__action-icon" src="/icons/table-copy.svg" alt="" />
                    </button>
                    <button
                      className="customer-manager__action"
                      aria-label="Edit"
                      title="Edit"
                      onClick={() => {
                        setFormError(null)
                        setFormState({ mode: 'edit', customer })
                      }}
                    >
                      <img className="customer-manager__action-icon" src="/icons/table-edit.svg" alt="" />
                    </button>
                    <button
                      className="customer-manager__action customer-manager__action--danger"
                      aria-label="Delete"
                      title="Delete"
                      onClick={() => {
                        setDeleteError(null)
                        setPendingDelete(customer)
                      }}
                    >
                      <img className="customer-manager__action-icon" src="/icons/table-delete.svg" alt="" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={currentPage}
        totalItems={sorted.length}
        pageSize={PAGE_SIZE}
        itemLabel={`customer${sorted.length === 1 ? '' : 's'}`}
        onPageChange={setPage}
      />

      <CustomerFormModal
        key={formState === null ? 'closed' : formState.mode === 'edit' ? formState.customer.id : 'create'}
        open={formState !== null}
        customer={formState?.mode === 'edit' ? formState.customer : null}
        busy={createMutation.isPending || updateMutation.isPending}
        errorMessage={formError}
        onSave={handleSave}
        onCancel={() => setFormState(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete customer?"
        message={
          deleteError ??
          `Delete ${pendingDelete?.first_name} ${pendingDelete?.last_name}? This can't be undone.`
        }
        busy={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

export default CustomerManager
