import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const KEY = 'setat_theme'
const ThemeContext = createContext({ theme: 'light', toggle: () => {} })

// index.html এর script আগেই data-theme বসিয়ে রেখেছে, সেটাই শুরুর মান
const initialTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // নিজে বেছে না থাকলে PC এর theme বদলের সাথে চলি
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      let saved = null
      try {
        saved = localStorage.getItem(KEY)
      } catch {
        // ignore
      }
      if (!saved) setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    root.classList.add('theme-anim')
    window.setTimeout(() => root.classList.remove('theme-anim'), 350)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // ignore
    }
    setTheme(next)
  }, [theme])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}