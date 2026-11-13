import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getSyncStatus, startSync } from '../api/sync'

const SyncContext = createContext(null)

// Provider এর বাইরে (যেমন পরে public page এ) ব্যবহার করলেও ভাঙবে না
const NO_SYNC = { status: null, running: false, starting: false, error: '', version: 0, start: async () => {} }

export function SyncProvider({ children }) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [version, setVersion] = useState(0) // sync শেষ হলে বাড়ে, page গুলো এটা দেখে data আবার আনে
  const wasRunning = useRef(false)
  const startedAt = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const data = await getSyncStatus()
      startedAt.current = data.started_at ?? null
      setStatus(data)
      setError('')
      return data
    } catch (err) {
      setError(err.message)
      return null
    }
  }, [])

  // পেজ খুললেই একবার অবস্থা দেখে নিই (sync আগে থেকে চলতে পারে)
  useEffect(() => {
    refresh()
  }, [refresh])

  const running = Boolean(status?.running)

  // চলার সময় প্রতি ২ সেকেন্ডে poll
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [running, refresh])

  // চলা থেকে থামলে: নতুন data এসেছে
  useEffect(() => {
    if (wasRunning.current && !running) setVersion((v) => v + 1)
    wasRunning.current = running
  }, [running])

  const start = useCallback(async () => {
    setStarting(true)
    setError('')
    const before = startedAt.current
    try {
      await startSync()
    } catch (err) {
      if (err.status !== 409) { // 409 = আগে থেকেই চলছে, শুধু progress দেখাব
        setError(err.message)
        setStarting(false)
        return
      }
    }
    // background thread শুরু হতে একটু সময় লাগে, তাই কয়েকবার দেখে নিই
    let latest = null
    for (let i = 0; i < 6; i += 1) {
      latest = await refresh()
      if (latest && (latest.running || latest.started_at !== before)) break
      await new Promise((r) => setTimeout(r, 500))
    }
    if (latest && !latest.running && latest.started_at !== before) setVersion((v) => v + 1)
    setStarting(false)
  }, [refresh])

  const value = useMemo(
    () => ({ status, running, starting, error, version, start }),
    [status, running, starting, error, version, start],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync() {
  return useContext(SyncContext) ?? NO_SYNC
}