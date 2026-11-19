import { useId } from 'react'
import './DevBadge.css'

const HEX = 'M12 1.2 21.2 6.6V17.4L12 22.8 2.8 17.4V6.6Z'

export default function DevBadge({ size = 20, title = 'Developer' }) {
  const gid = `dv-${useId().replace(/:/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="dev-badge" role="img" aria-label={title}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3ffb4" />
          <stop offset=".55" stopColor="#c8f34d" />
          <stop offset="1" stopColor="#86c414" />
        </linearGradient>
      </defs>
      {/* আশপাশ থেকে আলাদা করার বলয় */}
      <path d={HEX} style={{ fill: 'var(--surface)', stroke: 'var(--surface)' }} strokeWidth="3.4" strokeLinejoin="round" />
      <path d={HEX} fill={`url(#${gid})`} stroke="#0b0b0c" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M12 3.5 19.2 7.8V16.2L12 20.5 4.8 16.2V7.8Z" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth=".6" />
      <path
        d="m9.4 9.2-2.7 2.8 2.7 2.8M14.6 9.2l2.7 2.8-2.7 2.8M12.9 8.4l-1.8 7.2"
        fill="none"
        stroke="#0b0b0c"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}