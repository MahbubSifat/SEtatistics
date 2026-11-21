import useCountUp from '../../hooks/useCountUp'

function Cell({ label, value, accent }) {
  const n = useCountUp(value)
  return (
    <div className={`sp-cell${accent ? ' sp-cell--accent' : ''}`}>
      <span className="sp-cell__v num">{n.toLocaleString('en-US')}</span>
      <span className="sp-cell__l">{label}</span>
    </div>
  )
}

export default function PeriodStrip({ solved }) {
  return (
    <section className="sp-strip" aria-label="Problems solved">
      <Cell label="Today" value={solved['this-day'] ?? 0} />
      <Cell label="Last 7 days" value={solved['last-week'] ?? 0} />
      <Cell label="Last 30 days" value={solved['last-month'] ?? 0} />
      <Cell label="All time" value={solved['all-time'] ?? 0} accent />
    </section>
  )
}