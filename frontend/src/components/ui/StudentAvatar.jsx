import { useId } from 'react'
import Icon from './Icon'
import './StudentAvatar.css'

const MEDALS = {
  1: { name: 'gold', from: '#f8e08e', to: '#c8921a' },
  2: { name: 'silver', from: '#eef0f4', to: '#8d94a1' },
  3: { name: 'bronze', from: '#f0b27f', to: '#9c5a26' },
}

// বাম দিকে ৯টা পাতা (নিচ থেকে উপরে), ডান দিকে আয়নার মতো উল্টে বসে
const LEAVES = Array.from({ length: 9 }, (_, i) => {
  const deg = 100 + i * 18
  const rad = (deg * Math.PI) / 180
  return {
    x: 50 + 42.5 * Math.cos(rad),
    y: 50 + 42.5 * Math.sin(rad),
    rot: deg + 16,
    s: 1 - i * 0.045,
  }
})

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

function Leaves() {
  return LEAVES.map((l, i) => (
    <ellipse key={i} cx={l.x} cy={l.y} rx={3.4 * l.s} ry={6.4 * l.s} transform={`rotate(${l.rot} ${l.x} ${l.y})`} />
  ))
}

// rank: 1..3 হলে wreath; developer: কোণে ছোট badge; label: দিলে screen reader পড়ে
export default function StudentAvatar({ name, rank, developer = false, size = 40, label }) {
  const gid = `wr-${useId().replace(/:/g, '')}`
  const medal = MEDALS[rank]
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }

  return (
    <span className={`sa${medal ? ` sa--${medal.name}` : ''}`} style={{ '--sa': `${size}px` }} {...a11y}>
      {medal && (
        <svg className="sa__wreath" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={medal.from} />
              <stop offset="1" stopColor={medal.to} />
            </linearGradient>
          </defs>
          <g fill={`url(#${gid})`}>
            <g><Leaves /></g>
            <g transform="translate(100 0) scale(-1 1)"><Leaves /></g>
          </g>
        </svg>
      )}
      <span className="sa__circle">{initials(name)}</span>
      {developer && (
        <span className="sa__dev" title="Developer">
          <Icon name="code" size={12} />
        </span>
      )}
    </span>
  )
}