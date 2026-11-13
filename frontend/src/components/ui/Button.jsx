import './Button.css'

export default function Button({ variant = 'primary', loading = false, type = 'button', disabled, children, ...rest }) {
  return (
    <button type={type} className={`btn btn--${variant}`} disabled={disabled || loading} {...rest}>
      {loading ? 'Please wait…' : children}
    </button>
  )
}