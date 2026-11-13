import { api } from './client'

export const login = (email, password) =>
  api('/api/auth/login', { method: 'POST', body: { email, password } })

export const logout = () => api('/api/auth/logout', { method: 'POST' })