import { useId, useState } from 'react'
import DevBadge from './DevBadge'
import './StudentAvatar.css'

const MEDALS = {
  1: { name: 'gold', from: '#fdf0b8', mid: '#e6b73e', to: '#a8730e', ink: '#3a2600' },
  2: { name: 'silver', from: '#fafbfd', mid: '#c5ccd8', to: '#838c9d', ink: '#1d2230' },
  3: { name: 'bronze', from: '#f9cfa4', mid: '#d98d4c', to: '#8a4b1c', ink: '#2e1706' },
}

const f = (n) => n.toFixed(2)
const STEPS = 10
const point = (deg, r) => [50 + r * Math.cos((deg * Math.PI) / 180), 50 + r * Math.sin((deg * Math.PI) / 180)]

const LEAVES = []
for (let i = 0; i < STEPS; i += 1) {
  const deg = 98 + i * 15.5
  const k = 1 - i * 0.035
  ;[-1, 1].forEach((s) => {
    const [x, y] = point(deg, 43 + s * 2.2)
    LEAVES.push({ x: f(x), y: f(y), rx: f(3.1 * k), ry: f(6.2 * k), rot: f(deg + s * 24) })
  })
}
const [sx1, sy1] = point(98, 43)
const [sx2, sy2] = point(98 + (STEPS - 1) * 15.5, 43)
const STEM = `M${f(sx1)} ${f(sy1)} A43 43 0 0 1 ${f(sx2)} ${f(sy2)}`
const MIRROR = 'translate(100 0) scale(-1 1)'

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

function Leaves() {
  return LEAVES.map((l, i) => (
    <ellipse key={i} cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} transform={`rotate(${l.rot} ${l.x} ${l.y})`} />
  ))
}

// rank 1..3: wreath + পদক | developer: কোণে hexagon | src: ছবি (ভাঙলে আদ্যক্ষর)
export default function StudentAvatar({ name, rank, developer = false, size = 40, label, src }) {
  const gid = `m-${useId().replace(/:/g, '')}`
  const [broken, setBroken] = useState(null)
  const medal = MEDALS[rank]
  const showPhoto = Boolean(src) && broken !== src
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }

  return (
    <span className={`sa${medal ? ` sa--${medal.name}` : ''}`} style={{ '--sa': `${size}px` }} {...a11y}>
      {medal ? (
        <svg className="sa__wreath" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0.6" y2="1">
              <stop offset="0" stopColor={medal.from} />
              <stop offset=".5" stopColor={medal.mid} />
              <stop offset="1" stopColor={medal.to} />
            </linearGradient>
            <radialGradient id={`${gid}-s`} cx=".35" cy=".3" r=".8">
              <stop offset="0" stopColor="#fff" stopOpacity=".85" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx="50" cy="50" r="47" fill={medal.mid} opacity=".14" />
          <path d={STEM} fill="none" stroke={`url(#${gid})`} strokeWidth="1.1" strokeLinecap="round" />
          <path d={STEM} fill="none" stroke={`url(#${gid})`} strokeWidth="1.1" strokeLinecap="round" transform={MIRROR} />
          <g fill={`url(#${gid})`}>
            <g><Leaves /></g>
            <g transform={MIRROR}><Leaves /></g>
          </g>

          <circle className="sa__disc" cx="50" cy="50" r="35" stroke={`url(#${gid})`} strokeWidth="2.4" />
          <text className="sa__txt" x="50" y="57.5" textAnchor="middle" fontSize="22">{initials(name)}</text>

          {rank === 1 ? (
            <path d="M43 12.5 44.6 5.2 47.6 9.2 50 3.2 52.4 9.2 55.4 5.2 57 12.5Z" fill={`url(#${gid})`} stroke={medal.to} strokeWidth=".6" strokeLinejoin="round" />
          ) : (
            <path d="M50 3 51.5 7.5 56 9 51.5 10.5 50 15 48.5 10.5 44 9 48.5 7.5Z" fill={`url(#${gid})`} />
          )}

          <circle cx="50" cy="91" r="9.4" fill={`url(#${gid})`} />
          <circle cx="50" cy="91" r="7.3" fill="none" stroke={medal.ink} strokeOpacity=".35" strokeWidth=".7" />
          <circle className="sa__spec" cx="50" cy="91" r="9.4" fill={`url(#${gid}-s)`} />
          {size >= 72 && (
            <text className="sa__num" x="50" y="94.4" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={medal.ink}>
              {rank}
            </text>
          )}
        </svg>
      ) : (
        <span className="sa__circle">{initials(name)}</span>
      )}

      {showPhoto && (
        <img
          className={`sa__photo${medal ? ' is-medal' : ''}`}
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(src)}
        />
      )}

      {developer && (
        <span className="sa__dev">
          <DevBadge size="100%" />
        </span>
      )}
    </span>
  )
}