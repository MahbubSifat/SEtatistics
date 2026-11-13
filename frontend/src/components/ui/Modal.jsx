import { useEffect, useRef } from 'react'
import './Modal.css'

export default function Modal({ open, title, onClose, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // backdrop এ click
      }}
    >
      {open && (
        <div className="modal__body">
          <header className="modal__head">
            <h2>{title}</h2>
            <button type="button" className="modal__x" aria-label="Close" onClick={onClose}>×</button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}