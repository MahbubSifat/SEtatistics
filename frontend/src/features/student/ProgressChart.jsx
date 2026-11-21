import { useId, useState } from 'react'
import Segmented from '../../components/ui/Segmented'
import { fmtDate } from './utils'

const W = 760
const H = 320
const PAD = { l: 52, r: 132, t: 28, b: 46 }
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'codeforces', label: 'CodeForces' },
  { value: 'leetcode', label: 'LeetCode' },
  { value: 'codechef', label: 'CodeChef' },
  { value: 'beecrowd', label: 'Beecrowd' },
]
const MODES = [
  { value: 'solved', label: 'Solved' },
  { value: 'rating', label: 'Rating' },
]

function niceMax(v) {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  return (STEPS.find((s) => s * pow >= v) ?? 10) * pow
}

function rangeOf(values, fromZero) {
  const vs = values.filter((v) => v != null)
  if (vs.length === 0) return [0, 4]
  const max = Math.max(...vs)
  if (fromZero) return [0, niceMax(max)]
  const min = Math.min(...vs)
  const pad = Math.max(20, (max - min) * 0.25)
  return [Math.max(0, Math.floor((min - pad) / 10) * 10), Math.ceil((max + pad) / 10) * 10]
}

// null (ডেটা নেই) পেলে রেখা ভাগ হয়
function toRuns(values, X, Y) {
  const runs = []
  let cur = []
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) runs.push(cur)
      cur = []
    } else {
      cur.push({ i, v, x: X(i), y: Y(v) })
    }
  })
  if (cur.length) runs.push(cur)
  return runs
}

function smooth(pts) {
  const f = (n) => n.toFixed(1)
  const clampY = (y) => Math.min(H - PAD.b, Math.max(PAD.t, y))
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

export default function ProgressChart({ history }) {
  const uid = useId().replace(/:/g, '')
  const [platform, setPlatform] = useState('all')
  const [mode, setMode] = useState('solved')
  const [hover, setHover] = useState(null)

  const dates = history.dates
  const n = dates.length
  const last = n - 1
  const you = history.student.series
  const leaderSeries = history.leader && !history.leader_is_self ? history.leader.series : null
  const leaderLabel = history.leader ? `#1 · ${history.leader.name}` : ''

  const key = mode === 'rating' && platform === 'all' ? 'codeforces' : platform
  const field = mode === 'rating' ? 'rating' : 'total'
  const youVals = you[key]?.[field] ?? []
  const leadVals = leaderSeries ? leaderSeries[key]?.[field] ?? [] : null
  const hasData = youVals.some((v) => v != null)

  const [lo, hi] = rangeOf([...youVals, ...(leadVals ?? [])], mode === 'solved')
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const X = (i) => PAD.l + (plotW * i) / Math.max(1, n - 1)
  const Y = (v) => PAD.t + plotH * (1 - (v - lo) / (hi - lo || 1))
  const youRuns = toRuns(youVals, X, Y)
  const leadRuns = leadVals ? toRuns(leadVals, X, Y) : []
  const ticks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4)
  const labelIdx = [...new Set([0, Math.round(last / 4), Math.round(last / 2), Math.round((3 * last) / 4), last])]

  const yv = youVals[last]
  const lv = leadVals ? leadVals[last] : null
  let yLabel = yv != null ? Y(yv) : 0
  let lLabel = lv != null ? Y(lv) : 0
  if (yv != null && lv != null && Math.abs(yLabel - lLabel) < 32) {
    const mid = (yLabel + lLabel) / 2
    yLabel = yLabel <= lLabel ? mid - 16 : mid + 16
    lLabel = yLabel <= mid ? mid + 16 : mid - 16
  }

  const gap = yv != null && lv != null ? lv - yv : null
  let pill = null
  if (history.leader_is_self) pill = { text: "You're #1", good: true }
  else if (gap !== null) pill = gap > 0 ? { text: `${Math.round(gap)} behind` } : gap < 0 ? { text: `${Math.round(-gap)} ahead`, good: true } : { text: 'Level', good: true }

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    setHover(Math.max(0, Math.min(last, Math.round(((x - PAD.l) / plotW) * last))))
  }

  function changeMode(m) {
    setMode(m)
    if (m === 'rating' && platform === 'all') setPlatform('codeforces')
  }

  const tabs = mode === 'rating' ? TABS.slice(1) : TABS
  const hx = hover !== null ? X(hover) : 0
  const tipW = 156
  const tipH = lv !== undefined && leadVals ? 62 : 46
  const tipX = hx + 14 + tipW < W ? hx + 14 : hx - 14 - tipW
  const fmt = (v) => (v == null ? '—' : mode === 'rating' ? Math.round(v) : v)

  return (
    <section className="sp-card">
      <header className="sp-card__head">
        <div>
          <h2>Progress · last {n} days</h2>
          <ul className="cc__legend" aria-hidden="true">
            <li><span className="cc__dot cc__dot--you" /> You</li>
            {leaderSeries && <li><span className="cc__dot" /> {leaderLabel}</li>}
          </ul>
        </div>
        {pill && <span className={`pc__gap${pill.good ? ' is-good' : ''}`}>{pill.text}</span>}
      </header>

      <div className="pc-tabs">
        <Segmented label="Platform" options={tabs} value={key} onChange={setPlatform} />
        <Segmented label="Chart values" options={MODES} value={mode} onChange={changeMode} />
      </div>

      <div className="pc-wrap">
        {!hasData ? (
          <p className="cc__note" style={{ border: 0 }}>
            No history for this selection yet. It builds up after each daily sync.
          </p>
        ) : (
          <>
            <svg
              className="pc"
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label="Problems solved over time compared with the leader"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
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
              {labelIdx.map((i) => (
                <text key={i} className="pc__x" x={X(i)} y={H - PAD.b + 28} textAnchor="middle">{fmtDate(dates[i])}</text>
              ))}

              {leadRuns.map((run, k) => run.length > 1 && <path key={k} className="pc__lead" d={smooth(run)} />)}

              {youRuns.map((run, k) =>
                run.length > 1 ? (
                  <g key={k}>
                    <path className="pc__area" d={`${smooth(run)} L${run[run.length - 1].x} ${Y(lo)} L${run[0].x} ${Y(lo)} Z`} fill={`url(#area-${uid})`} />
                    <path className="pc__you" d={smooth(run)} pathLength="1" />
                  </g>
                ) : (
                  <circle key={k} className="pc__yd" cx={run[0].x} cy={run[0].y} r="4.5" />
                ),
              )}

              {yv != null && (
                <>
                  <circle className="pc__pulse" cx={X(last)} cy={Y(yv)} r="6" />
                  <circle className="pc__yd" cx={X(last)} cy={Y(yv)} r="6" />
                  <text className="pc__end pc__end--you" x={X(last) + 16} y={yLabel + 5}>
                    {fmt(yv)}<tspan className="pc__end-name" dx="6">You</tspan>
                  </text>
                </>
              )}
              {lv != null && (
                <text className="pc__end pc__end--lead" x={X(last) + 16} y={lLabel + 5}>
                  {fmt(lv)}<tspan className="pc__end-name" dx="6">#1</tspan>
                </text>
              )}

              {hover !== null && (
                <g className="pc__tip">
                  <line className="pc__hover" x1={hx} x2={hx} y1={PAD.t} y2={H - PAD.b} />
                  {youVals[hover] != null && <circle className="pc__yd" cx={hx} cy={Y(youVals[hover])} r="5" />}
                  {leadVals && leadVals[hover] != null && <circle className="pc__ld" cx={hx} cy={Y(leadVals[hover])} r="4" />}
                  <rect x={tipX} y={PAD.t} width={tipW} height={tipH} rx="8" />
                  <text className="pc__tip-d" x={tipX + 12} y={PAD.t + 18}>{fmtDate(dates[hover])}</text>
                  <text x={tipX + 12} y={PAD.t + 36}>You  {fmt(youVals[hover])}</text>
                  {leadVals && <text x={tipX + 12} y={PAD.t + 54}>#1   {fmt(leadVals[hover])}</text>}
                </g>
              )}
            </svg>

            <table className="visually-hidden">
              <caption>{mode === 'rating' ? 'Rating' : 'Total solved'} over time</caption>
              <thead><tr><th>Date</th><th>You</th><th>{leaderLabel || 'Leader'}</th></tr></thead>
              <tbody>
                {labelIdx.map((i) => (
                  <tr key={i}><td>{dates[i]}</td><td>{fmt(youVals[i])}</td><td>{leadVals ? fmt(leadVals[i]) : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <p className="cc__note">
        {mode === 'rating' ? 'Contest rating at the end of each day.' : 'Total problems solved at the end of each day.'}
      </p>
    </section>
  )
}