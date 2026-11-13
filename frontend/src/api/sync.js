import { api } from './client'

export const startSync = () => api('/api/sync', { method: 'POST' })
export const getSyncStatus = () => api('/api/sync/status')