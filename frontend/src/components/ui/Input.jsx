import Icon from './Icon'
import './Input.css'

export default function Input({ label, id, icon, suffix, ...rest }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`field__control${icon ? ' has-icon' : ''}${suffix ? ' has-suffix' : ''}`}>
        {icon && <Icon name={icon} size={18} className="field__icon" />}
        <input id={id} {...rest} />
        {suffix}
      </div>
    </div>
  )
}