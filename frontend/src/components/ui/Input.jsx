import './Input.css'

export default function Input({ label, id, variant = 'box', suffix, ...rest }) {
  return (
    <div className={`field${variant === 'line' ? ' field--line' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="field__control">
        <input id={id} {...rest} />
        {suffix}
      </div>
    </div>
  )
}