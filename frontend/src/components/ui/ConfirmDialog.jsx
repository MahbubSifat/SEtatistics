import Modal from './Modal'
import Button from './Button'

export default function ConfirmDialog({
  open, title, children, confirmLabel = 'Confirm', danger = false, loading = false, onConfirm, onCancel,
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div className="confirm__text">{children}</div>
      <div className="modal__actions">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}