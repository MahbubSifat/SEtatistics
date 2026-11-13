import { api } from './client'

export const listStudents = (search = '') =>
  api(`/api/students${search ? `?search=${encodeURIComponent(search)}` : ''}`)

export const createStudent = (body) => api('/api/students', { method: 'POST', body })

// শুধু বদলানো field পাঠাও (PUT এর নিয়ম)
export const updateStudent = (id, body) => api(`/api/students/${id}`, { method: 'PUT', body })

export const deleteStudent = (id) => api(`/api/students/${id}`, { method: 'DELETE' })

export const getStudentStatistics = (id) => api(`/api/students/${id}/statistics`)

