import { api } from './client'

export const getProfile = (id) => api(`/api/students/${id}/profile`)
export const getHistory = (id, days = 30) => api(`/api/students/${id}/history?days=${days}&compare=leader`)