import { api } from './client'

// multipart/form-data: file এর field এর নাম অবশ্যই "file"
export function uploadExcel(file) {
  const form = new FormData()
  form.append('file', file)
  return api('/api/students/excel/upload', { method: 'POST', form })
}

export const confirmImport = (importId) =>
  api('/api/students/excel/import', { method: 'POST', body: { import_id: importId } })