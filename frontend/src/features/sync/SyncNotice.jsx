import { useState } from 'react'
import { useSync } from '../../context/SyncContext'
import './SyncNotice.css'

export default function SyncNotice() {
  const { running, status, error } = useSync()
  const [dismissed, setDismissed] = useState(null)

  const failed = status?.failed ?? []
  const key = status?.finished_at ?? 'none'

  if (error) {
    return (
      <div className="sync-notice sync-notice--error" role="alert">
        <div className="container">{error}</div>
      </div>
    )
  }

  if (running || failed.length === 0 || dismissed === key) return null

  return (
    <div className="sync-notice" role="status">
      <div className="container sync-notice__inner">
        <details>
          <summary>
            Sync finished, {failed.length} {failed.length === 1 ? 'account' : 'accounts'} could not be fetched
          </summary>
          <ul>
            {failed.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </details>
        <button type="button" className="sync-notice__close" onClick={() => setDismissed(key)}>
          Dismiss
        </button>
      </div>
    </div>
  )
}