import './ConfirmDialog.scss'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Shared across every admin manager's delete flow (Customers today, Shipments/
// Packages in Chunks C/D) — built once here rather than duplicated per manager,
// since all three needed it from day one, not a speculative "maybe reused later."
function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', busy, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="confirm-dialog__overlay" onClick={onCancel}>
      <div
        className="confirm-dialog__dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="confirm-dialog__title" id="confirm-dialog-title">
          {title}
        </h2>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="confirm-dialog__confirm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
