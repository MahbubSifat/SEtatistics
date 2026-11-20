import './Logo.css'

export default function Logo({ size = 'md', tagline }) {
  return (
    <span className={`logo logo--${size}`}>
      <span className="logo__mark" aria-hidden="true">SE</span>
      <span className="logo__text">
        <span className="logo__word">
          SE<b>tatistics</b>
        </span>
        {tagline && <span className="logo__tag">{tagline}</span>}
      </span>
    </span>
  )
}