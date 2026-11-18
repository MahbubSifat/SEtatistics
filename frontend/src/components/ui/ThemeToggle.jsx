import { useTheme } from '../../context/ThemeContext'
import Icon from './Icon'
import './ThemeToggle.css'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      className="theme-toggle"
      onClick={toggle}
    >
      <span className="theme-toggle__thumb" aria-hidden="true" />
      <span className="theme-toggle__icon theme-toggle__icon--sun"><Icon name="sun" size={15} /></span>
      <span className="theme-toggle__icon theme-toggle__icon--moon"><Icon name="moon" size={15} /></span>
    </button>
  )
}