import './Button.css'

export default function Button({
  variant = 'primary',
  loading = false,
  type = 'button',
  disabled,
  className = '',
  children,
  ...rest
}) {
  return (
    <button type={type} className={`btn btn--${variant} ${className}`} disabled={disabled || loading} {...rest}>
      {loading ? (
        <>
          <span className="btn__spinner" aria-hidden="true" />
          Please wait…
        </>
      ) : (
        children
      )}
    </button>
  )
}