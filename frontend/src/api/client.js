const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// সব API call এই একটা function দিয়ে যাবে
export async function api(path, { method = 'GET', body, form } = {}) {
  const options = { method, credentials: 'include', headers: {} } // credentials = cookie পাঠানো

  if (form) {
    options.body = form // FormData: Content-Type browser নিজে বসায়
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(BASE + path, options)
  } catch {
    throw new ApiError('Cannot reach the server. Please check that the backend is running.', 0)
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    // body খালি হলে ignore
  }

  if (!res.ok) {
    // Login এর 401 মানে ভুল password, session শেষ না
    if (res.status === 401 && path !== '/api/auth/login') onUnauthorized()
    throw new ApiError(data?.error || 'Something went wrong', res.status)
  }
  return data
}