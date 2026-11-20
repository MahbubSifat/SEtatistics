import { useEffect, useState } from 'react'
import { fetchCodeforcesRatings } from '../api/codeforces'

const cache = new Map() // handle (ছোট হাতের) → তথ্য, না পেলে null

export default function useCodeforcesRatings(handles, enabled) {
  const [state, setState] = useState({ status: 'idle', data: {}, error: '' })
  const key = [...new Set(handles.filter(Boolean).map((h) => h.toLowerCase()))].sort().join(';')

  useEffect(() => {
    if (!enabled || !key) {
      setState((s) => (s.status === 'idle' ? s : { status: 'idle', data: {}, error: '' }))
      return undefined
    }
    let ignore = false
    const wanted = key.split(';')
    const missing = wanted.filter((h) => !cache.has(h))
    const snapshot = () => Object.fromEntries(wanted.map((h) => [h, cache.get(h) ?? null]))

    if (missing.length === 0) {
      setState({ status: 'ready', data: snapshot(), error: '' })
      return undefined
    }
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchCodeforcesRatings(missing)
      .then((found) => {
        missing.forEach((h) => cache.set(h, found[h] ?? null))
        if (!ignore) setState({ status: 'ready', data: snapshot(), error: '' })
      })
      .catch((err) => {
        if (!ignore) setState({ status: 'error', data: {}, error: err.message })
      })
    return () => {
      ignore = true
    }
  }, [key, enabled])

  return state
}