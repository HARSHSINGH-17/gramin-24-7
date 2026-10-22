/**
 * PahaadCare RPM Shared API Client
 * Milestone 2: Live RPM Dashboard Integration
 *
 * Implements standard REST integration for:
 * - GET  /api/v1/patients
 * - GET  /api/v1/patients/{patient_id}/measurements
 * - GET  /api/v1/alerts
 * - POST /api/v1/alerts/{alert_id}/acknowledge
 * - POST /api/v1/alerts/{alert_id}/resolve
 * - POST /api/v1/auth/token
 * - POST /api/v1/auth/logout
 *
 * Security & Reliability rules:
 * - No logging of JWTs, passwords, or patient health info.
 * - Handles 401 Unauthorized by clearing session and notifying listener.
 * - Handles 403 Forbidden without retrying or leaking patient records.
 * - Supports AbortSignal to avoid stale responses overwriting newer state.
 */

export const TOKEN_STORAGE_KEY = 'pahaadcare-rpm-token'
export const DEMO_STALE_THRESHOLD_MINUTES = 15

export class RpmApiError extends Error {
  constructor(message, status = 0, code = 'unknown_error', details = []) {
    super(message)
    this.name = 'RpmApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export class SessionExpiredError extends RpmApiError {
  constructor(message = 'Your session has expired or been revoked. Please sign in again.') {
    super(message, 401, 'unauthorized')
    this.name = 'SessionExpiredError'
  }
}

export class AccessDeniedError extends RpmApiError {
  constructor(message = 'Access denied: your identity does not have permission to view or modify this resource.') {
    super(message, 403, 'forbidden')
    this.name = 'AccessDeniedError'
  }
}

export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.__RPM_API_BASE_URL) {
    return String(window.__RPM_API_BASE_URL).replace(/\/$/, '')
  }
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_RPM_API_BASE_URL
  return (envUrl || 'http://127.0.0.1:8000').replace(/\/$/, '')
}

export function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {}
}

export function clearStoredToken() {
  setStoredToken('')
}

/**
 * Low-level authenticated request handler
 */
export async function rpmRequest(endpoint, {
  method = 'GET',
  body = null,
  token = undefined,
  signal = undefined,
  headers = {},
  onUnauthorized = null,
} = {}) {
  const baseUrl = getApiBaseUrl()
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${baseUrl}${cleanEndpoint}`
  const activeToken = token !== undefined ? token : getStoredToken()

  const reqHeaders = {
    Accept: 'application/json',
    ...headers,
  }

  if (body !== null && typeof body === 'object' && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json'
  }

  if (activeToken) {
    reqHeaders['Authorization'] = `Bearer ${activeToken}`
  }

  let response
  try {
    response = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body !== null && typeof body === 'object' && !(body instanceof FormData)
        ? JSON.stringify(body)
        : body,
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error
    }
    throw new RpmApiError(
      'Could not reach the RPM backend. Please check connectivity or server status.',
      0,
      'network_error'
    )
  }

  let payload = null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json()
    } catch {
      throw new RpmApiError(
        'Backend returned malformed JSON response.',
        response.status,
        'malformed_json'
      )
    }
  } else {
    try {
      const text = await response.text()
      payload = text ? { message: text } : null
    } catch {
      payload = null
    }
  }

  if (response.status === 401) {
    if (cleanEndpoint.includes('/auth/token')) {
      const message =
        payload?.error?.message || payload?.detail || 'Invalid username or password'
      throw new RpmApiError(message, 401, 'unauthorized')
    }
    clearStoredToken()
    if (typeof onUnauthorized === 'function') {
      onUnauthorized()
    }
    const message =
      payload?.error?.message ||
      payload?.detail ||
      'Your session has expired or been revoked. Please sign in again.'
    throw new SessionExpiredError(message)
  }

  if (response.status === 403) {
    const detail = payload?.error?.message || payload?.detail || 'Access denied: permission refused.'
    throw new AccessDeniedError(detail)
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.detail || `Backend request failed (${response.status})`
    const code = payload?.error?.code || 'http_error'
    const details = payload?.error?.details || []
    throw new RpmApiError(message, response.status, code, details)
  }

  return payload
}

/**
 * Authentication
 */
export async function loginClinician(username, password) {
  const result = await rpmRequest('/api/v1/auth/token', {
    method: 'POST',
    body: { username, password },
  })
  if (result?.access_token) {
    setStoredToken(result.access_token)
  }
  return result
}

export async function logoutClinician(token) {
  try {
    await rpmRequest('/api/v1/auth/logout', {
      method: 'POST',
      token,
    })
  } catch {
    // Best-effort logout; session token will be cleared regardless
  } finally {
    clearStoredToken()
  }
}

/**
 * Patient API
 */
export async function fetchPatients({ limit = 50, cursor = null, signal = null, onUnauthorized = null } = {}) {
  const params = new URLSearchParams()
  if (limit) params.set('limit', String(limit))
  if (cursor) params.set('cursor', String(cursor))
  const qs = params.toString() ? `?${params.toString()}` : ''
  return rpmRequest(`/api/v1/patients${qs}`, { signal, onUnauthorized })
}

/**
 * Measurement History API
 */
export async function fetchPatientMeasurements(
  patientId,
  { limit = 50, cursor = null, measurementType = null, signal = null, onUnauthorized = null } = {}
) {
  if (!patientId) throw new Error('patientId is required')
  const params = new URLSearchParams()
  if (limit) params.set('limit', String(limit))
  if (cursor) params.set('cursor', String(cursor))
  if (measurementType) params.set('measurement_type', String(measurementType))
  const qs = params.toString() ? `?${params.toString()}` : ''
  return rpmRequest(`/api/v1/patients/${encodeURIComponent(patientId)}/measurements${qs}`, {
    signal,
    onUnauthorized,
  })
}

/**
 * Alerts API
 */
export async function fetchAlerts({
  patientId = null,
  status = null,
  category = null,
  limit = 50,
  cursor = null,
  signal = null,
  onUnauthorized = null,
} = {}) {
  const params = new URLSearchParams()
  if (patientId) params.set('patient_id', String(patientId))
  if (status) params.set('status', String(status))
  if (category) params.set('category', String(category))
  if (limit) params.set('limit', String(limit))
  if (cursor) params.set('cursor', String(cursor))
  const qs = params.toString() ? `?${params.toString()}` : ''
  return rpmRequest(`/api/v1/alerts${qs}`, { signal, onUnauthorized })
}

/**
 * Alert Lifecycle Actions
 */
export async function acknowledgeAlert(alertId, { actorId = 'demo-clinician', note = null } = {}) {
  if (!alertId) throw new Error('alertId is required')
  return rpmRequest(`/api/v1/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
    method: 'POST',
    body: {
      actor_id: actorId,
      ...(note ? { note } : {}),
    },
  })
}

export async function resolveAlert(
  alertId,
  { actorId = 'demo-clinician', resolutionCode = 'demo_review_complete', note = null } = {}
) {
  if (!alertId) throw new Error('alertId is required')
  return rpmRequest(`/api/v1/alerts/${encodeURIComponent(alertId)}/resolve`, {
    method: 'POST',
    body: {
      actor_id: actorId,
      resolution_code: resolutionCode,
      ...(note ? { note } : {}),
    },
  })
}
