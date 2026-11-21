import { api, BASE } from './client'

// mode: 'create' (শুধু নতুন) | 'upsert' (নতুন + থাকাগুলো update)
export function uploadExcel(file, mode = 'create') {
  const form = new FormData()
  form.append('file', file)
  form.append('mode', mode)
  return api('/api/students/excel/upload', { method: 'POST', form })
}

export const confirmImport = (importId) =>
  api('/api/students/excel/import', { method: 'POST', body: { import_id: importId } })

export async function downloadTemplate() {
  const res = await fetch(`${BASE}/api/students/excel/template`, { credentials: 'include' })
  if (!res.ok) throw new Error('Could not download the template')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = 'students_template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}