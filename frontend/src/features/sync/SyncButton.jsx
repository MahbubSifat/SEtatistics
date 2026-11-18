import { useSync } from '../../context/SyncContext'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import './SyncButton.css'

export default function SyncButton() {
  const { running, starting, status, start } = useSync()
  const busy = running || starting
  const label = running ? `Syncing ${status.done}/${status.total}` : starting ? 'Starting…' : 'Sync now'

  return (
    <Button
      variant="gold"
      className={`sync-btn${busy ? ' is-busy' : ''}`}
      onClick={start}
      disabled={busy}
      aria-busy={busy}
      aria-label={label}
    >
      <Icon name="sync" size={16} className={busy ? 'spin' : ''} />
      <span className="sync-btn__label">{label}</span>
    </Button>
  )
}