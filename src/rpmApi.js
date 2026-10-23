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
  const envUrl =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_RPM_API_BASE_URL)
  if (envUrl) {
    return String(envUrl).replace(/\/$/, '')
  }
  if (typeof window !== 'undefined' && window.location) {
    const loc = window.location
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return `${loc.protocol}//${loc.hostname}:8000`
    }
  }
  return 'http://127.0.0.1:8000'
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
    const details = payload?.error?.details || []
    const detailList = details.map((d) => `${d.field}: ${d.reason}`).join(', ')
    const baseMessage = payload?.error?.message || payload?.detail || `Backend request failed (${response.status})`
    const message = detailList ? `${baseMessage} (${detailList})` : baseMessage
    const code = payload?.error?.code || 'http_error'
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
 * Consolidated Monitoring Overview & Census API (Phase 4)
 */
export async function fetchMonitorOverview({ signal = null, onUnauthorized = null } = {}) {
  return rpmRequest('/api/v1/monitor/overview', { signal, onUnauthorized })
}

export async function fetchDoctorCensus({ signal = null, onUnauthorized = null } = {}) {
  return rpmRequest('/api/v1/doctor/census', { signal, onUnauthorized })
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

export async function fetchPatientDetail(
  patientId,
  { signal = null, onUnauthorized = null } = {}
) {
  if (!patientId) throw new Error('patientId is required')
  return rpmRequest(`/api/v1/patients/${encodeURIComponent(patientId)}`, {
    signal,
    onUnauthorized,
  })
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

export function toValidUuid(raw) {
  if (!raw || typeof raw !== 'string') {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-000000000001'
  }
  const trimmed = raw.trim().toLowerCase()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(trimmed)) {
    return trimmed
  }
  if (/^[0-9a-f]{32}$/.test(trimmed)) {
    return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(12, 16)}-${trimmed.slice(16, 20)}-${trimmed.slice(20)}`
  }
  let hex = ''
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i)
    if ((code >= 48 && code <= 57) || (code >= 97 && code <= 102)) {
      hex += trimmed[i]
    } else {
      hex += (code % 16).toString(16)
    }
  }
  while (hex.length < 32) {
    hex += '0'
  }
  hex = hex.slice(0, 32)
  const part1 = hex.slice(0, 8)
  const part2 = hex.slice(8, 12)
  const part3 = '4' + hex.slice(13, 16)
  const variantNibble = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const part4 = variantNibble + hex.slice(17, 20)
  const part5 = hex.slice(20, 32)
  return `${part1}-${part2}-${part3}-${part4}-${part5}`
}

const CANONICAL_UNITS = {
  heart_rate: 'beats_per_minute',
  oxygen_saturation: 'percent',
  body_temperature: 'celsius',
  systolic_blood_pressure: 'mmHg',
  diastolic_blood_pressure: 'mmHg',
}

/**
 * Batch Event Synchronization
 */
export async function syncBatchEvents(events, { signal = null, onUnauthorized = null } = {}) {
  if (!events || !events.length) {
    return {
      summary: { total: 0, accepted: 0, duplicate: 0, conflict: 0, rejected: 0 },
      items: [],
      request_id: 'empty_batch',
    }
  }

  const cleanEvents = events.map((e) => {
    const validUuid = toValidUuid(e.event_id)
    if (e.event_id !== validUuid) {
      e.event_id = validUuid
    }

    let patientId = String(e.patient_id || 'PC-SYNTH01').trim().toUpperCase()
    if (!patientId.startsWith('PC-')) {
      patientId = `PC-${patientId.replace(/[^A-Z0-9]/g, '')}`
    }
    const suffix = patientId.slice(3).replace(/[^A-Z0-9]/g, '')
    if (suffix.length < 4) {
      patientId = `PC-${suffix.padEnd(4, '0')}`
    } else if (suffix.length > 32) {
      patientId = `PC-${suffix.slice(0, 32)}`
    }

    let val = parseFloat(e.value)
    if (isNaN(val) || !isFinite(val)) {
      val = 75.0
    }
    if (e.measurement_type === 'heart_rate') val = Math.min(300, Math.max(20, val))
    else if (e.measurement_type === 'oxygen_saturation') val = Math.min(100, Math.max(0, val))
    else if (e.measurement_type === 'body_temperature') val = Math.min(60, Math.max(-50, val))
    else if (e.measurement_type === 'systolic_blood_pressure') val = Math.min(300, Math.max(40, val))
    else if (e.measurement_type === 'diastolic_blood_pressure') val = Math.min(200, Math.max(20, val))

    let measuredAt = e.measured_at
    try {
      const d = new Date(measuredAt)
      if (isNaN(d.getTime())) {
        measuredAt = new Date().toISOString()
      } else {
        measuredAt = d.toISOString()
      }
    } catch {
      measuredAt = new Date().toISOString()
    }

    const validSources = ['patient', 'device', 'health_worker', 'simulator', 'import']
    const source = validSources.includes(e.source) ? e.source : 'patient'
    const isSimulated = source === 'simulator' ? true : Boolean(e.is_simulated)

    let deviceRef = undefined
    if (e.device_reference && typeof e.device_reference === 'object') {
      const d = {}
      if (typeof e.device_reference.device_id === 'string' && e.device_reference.device_id.trim()) {
        d.device_id = e.device_reference.device_id.trim()
      }
      if (typeof e.device_reference.model === 'string' && e.device_reference.model.trim()) {
        d.model = e.device_reference.model.trim()
      }
      if (typeof e.device_reference.firmware === 'string' && e.device_reference.firmware.trim()) {
        d.firmware = e.device_reference.firmware.trim()
      }
      if (Object.keys(d).length > 0) {
        deviceRef = d
      }
    }

    let hwRef = undefined
    if (
      e.health_worker_reference &&
      typeof e.health_worker_reference === 'object' &&
      typeof e.health_worker_reference.actor_id === 'string' &&
      e.health_worker_reference.actor_id.trim()
    ) {
      hwRef = { actor_id: e.health_worker_reference.actor_id.trim() }
      if (
        typeof e.health_worker_reference.facility_id === 'string' &&
        e.health_worker_reference.facility_id.trim()
      ) {
        hwRef.facility_id = e.health_worker_reference.facility_id.trim()
      }
    }

    return {
      schema_version: '1.0',
      event_id: validUuid,
      patient_id: patientId,
      measurement_type: e.measurement_type,
      value: Number(val),
      unit: CANONICAL_UNITS[e.measurement_type] || e.unit,
      measured_at: measuredAt,
      source,
      is_simulated: isSimulated,
      ...(deviceRef ? { device_reference: deviceRef } : {}),
      ...(hwRef ? { health_worker_reference: hwRef } : {}),
    }
  })

  return rpmRequest('/api/v1/sync/events', {
    method: 'POST',
    body: { events: cleanEvents },
    signal,
    onUnauthorized,
  })
}

export function getStoredUser() {
  const token = getStoredToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const base64Url = parts[1]
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
      const payload = JSON.parse(jsonPayload)
      return {
        username: payload.sub,
        role: payload.role,
        patient_ids: payload.patient_ids,
      }
    }
  } catch {}
  return null
}

export async function fetchEscalationPolicies({ signal = null, onUnauthorized = null } = {}) {
  return rpmRequest('/api/v1/escalation/policies', {
    method: 'GET',
    signal,
    onUnauthorized,
  })
}

export async function fetchAlertEscalation(alertId, { signal = null, onUnauthorized = null } = {}) {
  if (!alertId) throw new Error('alertId is required')
  return rpmRequest(`/api/v1/alerts/${encodeURIComponent(alertId)}/escalations`, {
    method: 'GET',
    signal,
    onUnauthorized,
  })
}

export async function triggerEscalationProcess(body = {}, { signal = null, onUnauthorized = null } = {}) {
  return rpmRequest('/api/v1/escalation/process', {
    method: 'POST',
    body,
    signal,
    onUnauthorized,
  })
}

export async function fetchDemoThresholds({ signal = null, onUnauthorized = null } = {}) {
  return rpmRequest('/api/v1/demo/thresholds', {
    method: 'GET',
    signal,
    onUnauthorized,
  })
}

export async function fetchEscalationWorkerStatus({ signal = null, onUnauthorized = null } = {}) {
  return rpmRequest('/api/v1/escalation/worker/status', {
    method: 'GET',
    signal,
    onUnauthorized,
  })
}

/**
 * Real Live Database API Endpoints
 */

export async function registerUser(userData) {
  const result = await rpmRequest('/api/v1/auth/register', {
    method: 'POST',
    body: userData,
  })
  if (result?.access_token) {
    setStoredToken(result.access_token)
  }
  return result
}

export async function getCurrentUserProfile({ signal = null, onUnauthorized = null } = {}) {
  return rpmRequest('/api/v1/auth/me', {
    method: 'GET',
    signal,
    onUnauthorized,
  })
}

export async function fetchPatientLatestVitals(patientId, { signal = null, onUnauthorized = null } = {}) {
  if (!patientId) throw new Error('patientId is required')
  return rpmRequest(`/api/v1/patients/${encodeURIComponent(patientId)}/vitals/latest`, {
    method: 'GET',
    signal,
    onUnauthorized,
  })
}

export async function logPatientVitalDirect(patientId, vitalData, { signal = null, onUnauthorized = null } = {}) {
  if (!patientId) throw new Error('patientId is required')
  return rpmRequest(`/api/v1/patients/${encodeURIComponent(patientId)}/vitals`, {
    method: 'POST',
    body: vitalData,
    signal,
    onUnauthorized,
  })
}

export async function createLivePatient(patientData, { signal = null, onUnauthorized = null } = {}) {
  return rpmRequest('/api/v1/patients', {
    method: 'POST',
    body: patientData,
    signal,
    onUnauthorized,
  })
}

export async function checkBackendHealth() {
  try {
    const res = await rpmRequest('/health')
    return { ok: true, data: res }
  } catch (error) {
    return { ok: false, error }
  }
}


