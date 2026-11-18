import './Logo.css'

export default function Logo({ size = 'md' }) {
  return (
    <span className={`logo logo--${size}`}>
      <span className="logo__mark" aria-hidden="true">SE</span>
      <span className="logo__word">
        SE<b>tatistics</b>
      </span>
    </span>
  )
}