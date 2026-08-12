import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  useListPackages,
  useCreatePackage,
  useUpdatePackage,
  useDeletePackage,
  useListShipments,
  type PackageCreate,
  type PackageOut,
} from '../../api/generated/secure-ship'
import { useAdminAccessToken, authHeaders } from '../useAdminAccessToken'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import PackageFormModal from './PackageFormModal'
import Pagination from '../Pagination/Pagination'
import './PackageManager.scss'

const PAGE_SIZE = 15

type FormState = { mode: 'create' } | { mode: 'edit'; pkg: PackageOut } | null

function matchesSearch(pkg: PackageOut, query: string): boolean {
  const haystack = `${pkg.tracking_number} ${pkg.description}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function PackageManager() {
  const accessToken = useAdminAccessToken()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const setSearch = (value: string) => {
    setSearchParams(value ? { search: value } : {}, { replace: true })
    setPage(1)
  }
  const [page, setPage] = useState(1)
  const [formState, setFormState] = useState<FormState>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PackageOut | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data, isLoading, refetch } = useListPackages({
    query: { enabled: !!accessToken },
    fetch: authHeaders(accessToken),
  })
  // Only needed to populate the Add/Edit modal's Shipment dropdown — the table
  // itself already gets tracking_number straight from PackageOut, no join needed.
  const { data: shipmentsData } = useListShipments({
    query: { enabled: !!accessToken },
    fetch: authHeaders(accessToken),
  })

  const createMutation = useCreatePackage({ fetch: authHeaders(accessToken) })
  const updateMutation = useUpdatePackage({ fetch: authHeaders(accessToken) })
  const deleteMutation = useDeletePackage({ fetch: authHeaders(accessToken) })

  const packages = data?.data ?? []
  const shipments = shipmentsData?.data ?? []
  const filtered = search.trim() ? packages.filter((pkg) => matchesSearch(pkg, search.trim())) : packages
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function handleTrackingClick(pkg: PackageOut) {
    navigate(`/admin/shipments?search=${encodeURIComponent(pkg.tracking_number)}`)
  }

  function handleSave(payload: PackageCreate) {
    setFormError(null)
    const onSuccess = () => {
      setFormState(null)
      refetch()
    }
    const onError = () => setFormError("Couldn't save this package. Please try again.")

    if (formState?.mode === 'edit') {
      updateMutation.mutate({ packageId: formState.pkg.id, data: payload }, { onSuccess, onError })
    } else {
      createMutation.mutate({ data: payload }, { onSuccess, onError })
    }
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return
    deleteMutation.mutate(
      { packageId: pendingDelete.id },
      {
        onSuccess: () => {
          setPendingDelete(null)
          setDeleteError(null)
          refetch()
        },
        onError: () => setDeleteError("Couldn't delete this package. Please try again."),
      },
    )
  }

  return (
    <div className="package-manager">
      <div className="package-manager__header">
        <div>
          <h1 className="package-manager__title">Packages</h1>
          <p className="package-manager__subtitle">View, search, and manage all package records.</p>
        </div>
        <button
          className="package-manager__add"
          onClick={() => {
            setFormError(null)
            setFormState({ mode: 'create' })
          }}
        >
          + Add Package
        </button>
      </div>

      <input
        className="package-manager__search"
        type="search"
        placeholder="Search by tracking number or description…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {isLoading ? (
        <p className="package-manager__status">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="package-manager__status">No packages found.</p>
      ) : (
        <table className="package-manager__table">
          <thead>
            <tr>
              <th>Tracking Number</th>
              <th>Description</th>
              <th>Weight (kg)</th>
              <th>Declared Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((pkg) => (
              <tr key={pkg.id}>
                <td>
                  <button
                    className="package-manager__cell-link"
                    title={`View shipment ${pkg.tracking_number}`}
                    onClick={() => handleTrackingClick(pkg)}
                  >
                    {pkg.tracking_number}
                  </button>
                </td>
                <td>{pkg.description}</td>
                <td>{pkg.weight_kg}</td>
                <td>{pkg.declared_value}</td>
                <td className="package-manager__actions">
                  <button
                    className="package-manager__action"
                    aria-label="Edit"
                    title="Edit"
                    onClick={() => {
                      setFormError(null)
                      setFormState({ mode: 'edit', pkg })
                    }}
                  >
                    <img className="package-manager__action-icon" src="/icons/table-edit.svg" alt="" />
                  </button>
                  <button
                    className="package-manager__action package-manager__action--danger"
                    aria-label="Delete"
                    title="Delete"
                    onClick={() => {
                      setDeleteError(null)
                      setPendingDelete(pkg)
                    }}
                  >
                    <img className="package-manager__action-icon" src="/icons/table-delete.svg" alt="" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={currentPage}
        totalItems={filtered.length}
        pageSize={PAGE_SIZE}
        itemLabel={`package${filtered.length === 1 ? '' : 's'}`}
        onPageChange={setPage}
      />

      <PackageFormModal
        key={formState === null ? 'closed' : formState.mode === 'edit' ? formState.pkg.id : 'create'}
        open={formState !== null}
        pkg={formState?.mode === 'edit' ? formState.pkg : null}
        shipments={shipments}
        busy={createMutation.isPending || updateMutation.isPending}
        errorMessage={formError}
        onSave={handleSave}
        onCancel={() => setFormState(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete package?"
        message={deleteError ?? `Delete package ${pendingDelete?.tracking_number} — ${pendingDelete?.description}? This can't be undone.`}
        busy={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

export default PackageManager
