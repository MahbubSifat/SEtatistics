import { useSync } from '../../context/SyncContext'
import Button from '../../components/ui/Button'

export default function SyncButton() {
  const { running, starting, status, start } = useSync()
  const busy = running || starting
  const label = running ? `Syncing ${status.done}/${status.total}` : starting ? 'Starting…' : 'Sync now'

  return (
    <Button variant="gold" className="sync-btn" onClick={start} disabled={busy} aria-busy={busy}>
      {label}
    </Button>
  )
}