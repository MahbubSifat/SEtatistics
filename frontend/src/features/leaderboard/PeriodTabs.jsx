import { PERIODS } from './periods'

export default function PeriodTabs({ value, onChange }) {
  return (
    <div className="lb-tabs" role="group" aria-label="Leaderboard period">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          className={`lb-tab${p.value === value ? ' is-active' : ''}`}
          aria-pressed={p.value === value}
          onClick={() => onChange(p.value)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}