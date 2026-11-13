import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { login as loginApi, logout as logoutApi } from '../api/auth'
import { setUnauthorizedHandler } from '../api/client'

const KEY = 'cpt_user'
const AuthContext = createContext(null)

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)

  const clearUser = useCallback(() => {
    localStorage.removeItem(KEY)
    setUser(null)
  }, [])

  // যেকোনো API তে 401 এলে user মুছে যাবে, তখন ProtectedRoute login এ পাঠাবে
  useEffect(() => {
    setUnauthorizedHandler(clearUser)
  }, [clearUser])

  const login = useCallback(async (email, password) => {
    const data = await loginApi(email, password)
    localStorage.setItem(KEY, JSON.stringify(data.user))
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      // server না পেলেও local logout হবে
    }
    clearUser()
  }, [clearUser])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}