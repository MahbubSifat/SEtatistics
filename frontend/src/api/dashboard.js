import { api } from './client'

export const getSummary = () => api('/api/dashboard/summary')