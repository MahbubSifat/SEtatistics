import { useId } from 'react'

const W = 760
const H = 320
const PAD = { l: 52, r: 128, t: 28, b: 46 }
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

function niceMax(v) {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  return (STEPS.find((s) => s * pow >= v) ?? 10) * pow
}

// নরম বাঁকা রেখা (Catmull-Rom → Bezier)
function smooth(pts) {
  const clampY = (y) => Math.min(H - PAD.b, Math.max(PAD.t, y))
  const f = (n) => n.toFixed(1)
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    d += ` C${f(p1.x + (p2.x - p0.x) / 6)} ${f(clampY(p1.y + (p2.y - p0.y) / 6))} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(clampY(p2.y - (p3.y - p1.y) / 6))} ${f(p2.x)} ${f(p2.y)}`
  }
  return d
}

export default function ProgressChart({ you, leader, leaderLabel, youLeads }) {
  const uid = useId().replace(/:/g, '')
  const all = [...you.map((p) => p.value), ...(leader ? leader.map((p) => p.value) : [])]
  const yMax = niceMax(Math.max(...all, 1))
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const X = (i) => PAD.l + (plotW * i) / (you.length - 1)
  const Y = (v) => PAD.t + plotH * (1 - v / yMax)
  const toPts = (s) => s.map((p, i) => ({ ...p, x: X(i), y: Y(p.value) }))
  const yp = toPts(you)
  const lp = leader ? toPts(leader) : null
  const ticks = [0, 1, 2, 3, 4].map((i) => (yMax * i) / 4)
  const yEnd = yp[yp.length - 1]
  const lEnd = lp?.[lp.length - 1]

  // শেষ প্রান্তের লেখা যেন একটার উপর আরেকটা না পড়ে
  let yLabel = yEnd.y
  let lLabel = lEnd?.y ?? 0
  if (lEnd && Math.abs(yLabel - lLabel) < 32) {
    const mid = (yLabel + lLabel) / 2
    yLabel = yLabel <= lLabel ? mid - 16 : mid + 16
    lLabel = yLabel <= mid ? mid + 16 : mid - 16
  }

  const gap = lEnd ? Math.abs(lEnd.value - yEnd.value) : 0
  const gapText = !lEnd ? null : youLeads ? `${gap} ahead` : gap === 0 ? 'Level' : `${gap} behind`

  return (
    <section className="sp-card">
      <header className="sp-card__head">
        <div>
          <h2>Progress vs {youLeads ? 'runner-up' : 'the leader'}</h2>
          <ul className="cc__legend" aria-hidden="true">
            <li><span className="cc__dot cc__dot--you" /> You</li>
            {lEnd && <li><span className="cc__dot" /> {leaderLabel}</li>}
          </ul>
        </div>
        {gapText && <span className={`pc__gap${youLeads || gap === 0 ? ' is-good' : ''}`}>{gapText}</span>}
      </header>

      <div className="pc-wrap">
        <svg className="pc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Total problems solved over the last 30 days, compared with the leader">
          <defs>
            <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          <g className="pc__grid">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} />
                <text x={PAD.l - 10} y={Y(t) + 4} textAnchor="end">{Math.round(t)}</text>
              </g>
            ))}
          </g>
          {yp.map((p) => (
            <text key={p.key} className="pc__x" x={p.x} y={H - PAD.b + 28} textAnchor="middle">{p.label}</text>
          ))}

          {lp && (
            <g>
              <path className="pc__lead" d={smooth(lp)} />
              {lp.map((p) => <circle key={p.key} className="pc__ld" cx={p.x} cy={p.y} r="4"><title>{leaderLabel}: {p.value} ({p.label})</title></circle>)}
            </g>
          )}

          <path className="pc__area" d={`${smooth(yp)} L${X(yp.length - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`} fill={`url(#area-${uid})`} />
          <path className="pc__you" d={smooth(yp)} pathLength="1" />
          {yp.map((p, i) => (
            <g key={p.key}>
              {i === yp.length - 1 && <circle className="pc__pulse" cx={p.x} cy={p.y} r="6" />}
              <circle className="pc__yd" cx={p.x} cy={p.y} r={i === yp.length - 1 ? 6 : 4.5}><title>You: {p.value} ({p.label})</title></circle>
            </g>
          ))}

          <text className="pc__end pc__end--you" x={yEnd.x + 16} y={yLabel + 5}>
            {yEnd.value}<tspan className="pc__end-name" dx="6">You</tspan>
          </text>
          {lEnd && (
            <text className="pc__end pc__end--lead" x={lEnd.x + 16} y={lLabel + 5}>
              {lEnd.value}<tspan className="pc__end-name" dx="6">{leaderLabel}</tspan>
            </text>
          )}
        </svg>

        <table className="visually-hidden">
          <caption>Total problems solved over time</caption>
          <thead><tr><th>Point</th><th>You</th><th>{leaderLabel || 'Leader'}</th></tr></thead>
          <tbody>
            {you.map((p, i) => (
              <tr key={p.key}><td>{p.label}</td><td>{p.value}</td><td>{leader ? leader[i].value : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cc__note">
        Built from the Today / 7-day / 30-day counts. A full month-by-month history needs backend data.
      </p>
    </section>
  )
}