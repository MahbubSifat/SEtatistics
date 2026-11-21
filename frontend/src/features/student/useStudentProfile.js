import { useEffect, useState } from 'react'
import { getHistory, getProfile } from '../../api/profile'

const EMPTY = { status: 'loading', profile: null, history: null, error: '' }

export default function useStudentProfile(id, version, attempt) {
  const [state, setState] = useState(EMPTY)

  useEffect(() => {
    let ignore = false
    setState((s) => (s.profile && String(s.profile.student.id) === String(id) ? s : EMPTY))

    ;(async () => {
      const [p, h] = await Promise.allSettled([getProfile(id), getHistory(id)])
      if (ignore) return
      if (p.status === 'rejected') {
        const err = p.reason
        setState({ ...EMPTY, status: err.status === 404 ? 'missing' : 'error', error: err.message })
        return
      }
      // graph ফেল করলেও profile দেখানো যায়
      setState({ status: 'ready', profile: p.value, history: h.status === 'fulfilled' ? h.value : null, error: '' })
    })()

    return () => {
      ignore = true
    }
  }, [id, version, attempt])

  return state
}