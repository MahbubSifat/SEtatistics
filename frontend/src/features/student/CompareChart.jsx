import Segmented from '../../components/ui/Segmented'
import { ordinal } from './utils'

const MODES = [
  { value: 'solved', label: 'Solved' },
  { value: 'rank', label: 'Ranking' },
]

function describe(item, mode) {
  const youLead = item.youRank === 1
  if (mode === 'solved') {
    const top = item.top ?? 0
    const max = Math.max(item.you, top, 1)
    const diff = item.you - top
    return {
      youPct: (item.you / max) * 100,
      topPct: (top / max) * 100,
      youText: String(item.you),
      topText: item.top === null ? '—' : String(item.top),
      delta: diff === 0 ? 'Level' : diff > 0 ? `${diff} ahead` : `${-diff} behind`,
      good: diff > 0,
    }
  }
  const n = Math.max(item.total, 1)
  const gap = item.topRank ? item.youRank - item.topRank : 0
  return {
    youPct: ((n + 1 - item.youRank) / n) * 100,
    topPct: item.topRank ? ((n + 1 - item.topRank) / n) * 100 : 0,
    youText: ordinal(item.youRank),
    topText: item.topRank ? ordinal(item.topRank) : '—',
    delta: youLead ? 'Leading' : `${gap} ${gap === 1 ? 'place' : 'places'} behind`,
    good: youLead,
  }
}

export default function CompareChart({ items, mode, onModeChange, youLeadsAllTime }) {
  const benchmark = youLeadsAllTime ? 'Runner-up' : 'Leader'

  return (
    <section className="sp-card">
      <header className="sp-card__head">
        <div>
          <h2>Performance vs {benchmark.toLowerCase()}</h2>
          <ul className="cc__legend" aria-hidden="true">
            <li><span className="cc__dot cc__dot--you" /> You</li>
            <li><span className="cc__dot" /> {benchmark} of each period</li>
          </ul>
        </div>
        <Segmented label="Chart values" options={MODES} value={mode} onChange={onModeChange} />
      </header>

      <ul className="cc">
        {items.map((item, i) => {
          const d = describe(item, mode)
          return (
            <li key={item.key} className="cc__row" style={{ '--i': i }}>
              <span className="cc__label">{item.label}</span>
              <div className="cc__bars" aria-hidden="true">
                <div className="cc__line">
                  <span className="cc__track"><span className="cc__fill cc__fill--you" style={{ '--w': `${d.youPct}%` }} /></span>
                  <span className="cc__val num">{d.youText}</span>
                </div>
                <div className="cc__line cc__line--dim" title={item.topName ?? undefined}>
                  <span className="cc__track"><span className="cc__fill" style={{ '--w': `${d.topPct}%` }} /></span>
                  <span className="cc__val num">{d.topText}</span>
                </div>
              </div>
              <span className={`cc__delta${d.good ? ' is-good' : ''}`}>{d.delta}</span>
              <span className="visually-hidden">
                {item.label}: you {d.youText}, {benchmark.toLowerCase()} {d.topText}, {d.delta}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="cc__note">Month-by-month history will appear here once the backend provides it.</p>
    </section>
  )
}