import React from 'react'
import {
  Activity,
  AlertTriangle,
  Clock3,
  Droplets,
  HeartPulse,
  PlusCircle,
  RefreshCw,
  Thermometer,
  Wifi,
  WifiOff,
  X,
  Users,
  Search,
  ShieldAlert,
  BarChart3,
  PieChart,
  TrendingUp,
} from 'lucide-react'
import {
  DEMO_STALE_THRESHOLD_MINUTES,
  SessionExpiredError,
  AccessDeniedError,
  getStoredToken,
  getStoredUser,
  clearStoredToken,
  loginClinician,
  logoutClinician,
  fetchMonitorOverview,
  fetchDoctorCensus,
  fetchPatients,
  fetchPatientMeasurements,
  fetchAlerts,
  fetchAlertEscalation,
  acknowledgeAlert,
  resolveAlert,
  toValidUuid,
} from './rpmApi'
import { syncManager } from './syncManager'
import { enqueueMeasurementEvent } from './offlineQueue'

const DEFAULT_POLL_INTERVAL_MS = 12000

export const READING_TYPES = [
  ['heart_rate', 'Heart rate', 'bpm', HeartPulse],
  ['oxygen_saturation', 'SpO2', '%', Droplets],
  ['body_temperature', 'Temperature', '°C', Thermometer],
  ['systolic_blood_pressure', 'Systolic BP', 'mmHg', Activity],
  ['diastolic_blood_pressure', 'Diastolic BP', 'mmHg', Activity],
]

export function formatTime(value) {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid timestamp'
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatAge(value, now = new Date()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000))
  if (diffMinutes === 0) return '<1m ago'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const hours = Math.floor(diffMinutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatUnit(unit) {
  if (!unit) return ''
  switch (unit) {
    case 'beats_per_minute':
      return 'bpm'
    case 'percent':
      return '%'
    case 'celsius':
      return '°C'
    case 'mmHg':
      return 'mmHg'
    default:
      return unit
  }
}

export function formatMeasurementTypeName(type) {
  if (!type) return 'Unknown vital'
  const match = READING_TYPES.find(([key]) => key === type)
  if (match) return match[1]
  return type.replace(/_/g, ' ')
}

export function readingStatus(reading, now = new Date()) {
  if (!reading || reading.value === null || reading.value === undefined) {
    return { label: 'Missing', tone: 'missing' }
  }
  if (reading.outcome === 'stale' || reading.freshness === 'stale') {
    return { label: 'Stale', tone: 'stale' }
  }
  if (reading.measured_at) {
    const measuredDate = new Date(reading.measured_at)
    if (!Number.isNaN(measuredDate.getTime())) {
      const ageMinutes = (now.getTime() - measuredDate.getTime()) / (1000 * 60)
      if (ageMinutes > DEMO_STALE_THRESHOLD_MINUTES) {
        return { label: 'Stale', tone: 'stale' }
      }
    }
  }
  return { label: 'Current', tone: 'received' }
}

export function displayReading(reading, defaultUnit = '') {
  if (!reading || reading.value === null || reading.value === undefined) {
    return { value: 'Missing', unit: '' }
  }
  return { value: reading.value, unit: formatUnit(reading.unit) || defaultUnit }
}

export function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div className={`rpm-metric rpm-metric-${tone}`}>
      <span className="rpm-metric-icon">
        <Icon size={18} />
      </span>
      <span className="rpm-metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function StatusBadge({ status }) {
  return <span className={`rpm-status rpm-status-${status.tone}`}>{status.label}</span>
}

export function PatientTable({
  patients,
  measurementsByPatient = {},
  alerts = [],
  onSelect,
  selectedPatientId,
  onNavigateToPatient,
}) {
  const now = new Date()
  return (
    <div className="rpm-table-wrap">
      <table className="rpm-table">
        <caption className="sr-only">Synthetic patient monitoring status</caption>
        <thead>
          <tr>
            <th scope="col">Patient</th>
            {READING_TYPES.map(([, label, unit]) => (
              <th scope="col" key={label}>
                {label}
                <small>{unit}</small>
              </th>
            ))}
            <th scope="col">Latest Reading</th>
            <th scope="col">Data Quality</th>
            <th scope="col">Active Alerts</th>
            <th scope="col">Monitoring Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => {
            const patientData = measurementsByPatient[patient.patient_id] || {}
            const latestByType = patientData.latest || {}
            const patientAlerts = alerts.filter(
              (a) =>
                a.patient_id === patient.patient_id &&
                (a.status === 'open' || a.status === 'acknowledged')
            )
            const allMeasurements = patientData.all || []
            const mostRecent = allMeasurements[0]
            const isSelected = selectedPatientId === patient.patient_id

            const highestSev = patient.highest_severity || (
              patientAlerts.some((a) => a.severity === 'critical')
                ? 'critical'
                : patientAlerts.some((a) => a.severity === 'high')
                ? 'high'
                : patientAlerts.some((a) => a.severity === 'medium')
                ? 'medium'
                : patientAlerts.some((a) => a.severity === 'low')
                ? 'low'
                : 'none'
            )

            const monitoringStatus = patient.monitoring_status || (
              highestSev === 'critical'
                ? 'critical_attention'
                : highestSev === 'high' || highestSev === 'medium' || patient.has_stale_vitals || patient.has_missing_vitals
                ? 'needs_review'
                : 'normal'
            )

            const freshnessStatus = patient.freshness_status || (
              patient.has_stale_vitals
                ? 'stale'
                : patient.has_missing_vitals && !allMeasurements.length
                ? 'missing'
                : 'recent'
            )

            const latestTimestamp = patient.latest_measurement_at || mostRecent?.received_at || mostRecent?.measured_at

            return (
              <tr key={patient.patient_id} className={isSelected ? 'rpm-row-selected' : ''}>
                <th scope="row">
                  <button
                    className="rpm-patient-button"
                    onClick={() => onSelect(patient.patient_id)}
                    aria-pressed={isSelected}
                  >
                    <span className="rpm-avatar">
                      {patient.patient_id.slice(3, 4) || 'S'}
                    </span>
                    <span>
                      <strong>{patient.patient_id}</strong>
                      <small>{patient.display_name || 'Patient'} · SIMULATED</small>
                    </span>
                  </button>
                </th>
                {READING_TYPES.map(([type, , defaultUnit]) => {
                  const reading = patient.latest_measurements?.[type] || latestByType[type]
                  const shown = displayReading(reading, defaultUnit)
                  const status = readingStatus(reading, now)
                  const ageText = formatAge(reading?.measured_at, now)
                  return (
                    <td key={type}>
                      <div className="rpm-vital-cell-box">
                        <div className="rpm-vital-value-row">
                          {shown.value === 'Missing' ? (
                            <span className="rpm-vital-missing">Missing</span>
                          ) : (
                            <>
                              <strong>{shown.value}</strong>
                              {shown.unit && <small>{shown.unit}</small>}
                            </>
                          )}
                        </div>
                        <div className="rpm-vital-meta-row">
                          <StatusBadge status={status} />
                          {ageText && <span>{ageText}</span>}
                        </div>
                      </div>
                    </td>
                  )
                })}
                <td>
                  <span className="rpm-time">
                    <Clock3 size={14} />
                    {formatTime(latestTimestamp)}
                  </span>
                </td>
                <td>
                  <span
                    className={`doc-badge doc-badge-${
                      freshnessStatus === 'recent'
                        ? 'green'
                        : freshnessStatus === 'stale'
                        ? 'amber'
                        : 'rose'
                    }`}
                  >
                    {freshnessStatus.toUpperCase()}
                  </span>
                </td>
                <td>
                  {patientAlerts.length ? (
                    <span className="rpm-alert-count">
                      <AlertTriangle size={14} />
                      {patientAlerts.length} active
                      {highestSev !== 'none' && (
                        <span className={`rpm-sev-pill ${highestSev.slice(0, 4)}`} style={{ marginLeft: '4px' }}>
                          {highestSev}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="rpm-clear">No active alerts</span>
                  )}
                </td>
                <td>
                  <span
                    className={`doc-badge doc-badge-${
                      monitoringStatus === 'critical_attention'
                        ? 'rose'
                        : monitoringStatus === 'needs_review'
                        ? 'amber'
                        : 'green'
                    }`}
                  >
                    {monitoringStatus === 'critical_attention'
                      ? 'Critical Attention'
                      : monitoringStatus === 'needs_review'
                      ? 'Needs Review'
                      : 'Normal'}
                  </span>
                </td>
                <td>
                  <div className="rpm-action-cell">
                    <button
                      type="button"
                      className="rpm-open-patient-btn"
                      onClick={() => {
                        const targetPath = `/doctor/patients/${patient.patient_id}`
                        if (onNavigateToPatient) {
                          onNavigateToPatient(targetPath)
                        } else if (typeof window !== 'undefined') {
                          window.location.hash = `#${targetPath}`
                        }
                      }}
                      title={`Open individual RPM page for ${patient.patient_id}`}
                    >
                      <span>Open RPM</span>
                      <span>→</span>
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PatientDetail({
  patient,
  measurements,
  alerts,
  loading,
  error,
  onClose,
  onPerformAlertAction,
  actionKey,
  onNavigateToPatient,
}) {
  if (!patient) return null
  const patientAlerts = alerts.filter(
    (alert) =>
      alert.patient_id === patient.patient_id &&
      (alert.status === 'open' || alert.status === 'acknowledged')
  )
  const now = new Date()

  return (
    <aside className="rpm-detail-panel" aria-label={`Details for ${patient.patient_id}`}>
      <div className="rpm-detail-heading">
        <div>
          <span className="rpm-eyebrow">PATIENT DETAIL · SIMULATED</span>
          <h2>{patient.patient_id}</h2>
          <p>{patient.display_name || 'Patient'}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close patient details">
          <X size={18} />
        </button>
      </div>
      <div className="rpm-detail-summary">
        <strong>{measurements.length}</strong>
        <span>recorded measurements</span>
        <strong>{patientAlerts.length}</strong>
        <span>active alerts</span>
      </div>
      <div style={{ margin: '12px 0 16px' }}>
        <button
          type="button"
          className="button button-secondary"
          style={{ width: '100%', fontSize: '12px', justifyContent: 'center' }}
          onClick={() => {
            const target = `/doctor/patients/${patient.patient_id}`
            if (onNavigateToPatient) {
              onNavigateToPatient(target)
            } else if (typeof window !== 'undefined') {
              window.location.hash = `#${target}`
            }
          }}
        >
          Open Individual RPM Dashboard →
        </button>
      </div>
      {patientAlerts.length > 0 && (
        <section className="rpm-detail-section">
          <h3>Active alerts</h3>
          <div className="rpm-alert-list">
            {patientAlerts.map((alert) => {
              const action =
                alert.status === 'open'
                  ? 'Acknowledge'
                  : alert.status === 'acknowledged'
                  ? 'Resolve'
                  : ''
              const actionId = `${alert.alert_id}:${
                alert.status === 'open' ? 'acknowledge' : 'resolve'
              }`
              return (
                <div className="rpm-alert-row" key={alert.alert_id}>
                  <AlertTriangle size={16} />
                  <div>
                    <strong>{alert.reason?.code || alert.category}</strong>
                    <small>
                      {alert.severity?.toUpperCase()} · {alert.status?.toUpperCase()}
                    </small>
                  </div>
                  {action && (
                    <button
                      className="button button-secondary rpm-alert-action"
                      onClick={() => onPerformAlertAction(alert)}
                      disabled={actionKey === actionId}
                    >
                      {actionKey === actionId ? 'Saving...' : action}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
      <section className="rpm-detail-section">
        <h3>Measurement history</h3>
        {loading && <p className="rpm-empty-inline">Loading measurement history...</p>}
        {error && (
          <p className="rpm-login-error" role="alert">
            {error}
          </p>
        )}
        {!loading && measurements.length === 0 ? (
          <p className="rpm-empty-inline">No measurements recorded for this patient.</p>
        ) : (
          <div className="rpm-history-list">
            {measurements.map((item) => (
              <div className="rpm-history-row" key={item.event_id}>
                <span>
                  <strong>{formatMeasurementTypeName(item.measurement_type)}</strong>
                  <small>Measured {formatTime(item.measured_at)}</small>
                </span>
                <span>
                  <strong>
                    {item.value} {formatUnit(item.unit)}
                  </strong>
                  <small>Received {formatTime(item.received_at)}</small>
                </span>
                <StatusBadge status={readingStatus(item, now)} />
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="rpm-detail-note">
        Synthetic observations only. No clinical decision should be based on this prototype.
      </p>
    </aside>
  )
}

export default function RpmDashboard({ onNavigate } = {}) {
  const [accessToken, setAccessToken] = React.useState(() => getStoredToken())
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [authBusy, setAuthBusy] = React.useState(false)

  const [overviewData, setOverviewData] = React.useState(null)
  const [patients, setPatients] = React.useState([])
  const [alerts, setAlerts] = React.useState([])
  const [measurementsByPatient, setMeasurementsByPatient] = React.useState({})
  const [selectedPatientId, setSelectedPatientId] = React.useState(null)
  const [selectedPatientMeasurements, setSelectedPatientMeasurements] = React.useState([])
  const [selectedPatientLoading, setSelectedPatientLoading] = React.useState(false)
  const [selectedPatientError, setSelectedPatientError] = React.useState('')

  // Search, filter, and sort controls
  const [searchQuery, setSearchQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [severityFilter, setSeverityFilter] = React.useState('all')
  const [freshnessFilter, setFreshnessFilter] = React.useState('all')
  const [sortBy, setSortBy] = React.useState('urgency')

  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState('')
  const [lastRefresh, setLastRefresh] = React.useState(null)
  const [actionKey, setActionKey] = React.useState('')
  const [actionNote, setActionNote] = React.useState('')
  const [showNoteInputForAlert, setShowNoteInputForAlert] = React.useState(null)
  const [alertEscalations, setAlertEscalations] = React.useState({})
  const [expandedAlerts, setExpandedAlerts] = React.useState({})
  // Phase 2: Route synchronization (#/doctor, #/doctor/patients, #/doctor/patients/:id, #/doctor/alerts)
  const [currentSubRoute, setCurrentSubRoute] = React.useState(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    return hash.replace(/^#\/?/, '').trim() || 'doctor'
  })

  React.useEffect(() => {
    const handleHashSync = () => {
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      const clean = hash.replace(/^#\/?/, '').trim() || 'doctor'
      setCurrentSubRoute(clean)

      const patientMatch = clean.match(/^doctor\/patients\/([a-zA-Z0-9_-]+)/)
      if (patientMatch && patientMatch[1]) {
        setSelectedPatientId(patientMatch[1])
      }
    }
    handleHashSync()
    window.addEventListener('hashchange', handleHashSync)
    return () => window.removeEventListener('hashchange', handleHashSync)
  }, [])

  const handleSelectPatient = React.useCallback((patientId) => {
    setSelectedPatientId(patientId)
  }, [])

  const handleClosePatient = React.useCallback(() => {
    setSelectedPatientId(null)
  }, [])

  // Milestone 3: Offline Synchronization & Queue state
  const [syncState, setSyncState] = React.useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    lastSyncTime: null,
    consecutiveFailures: 0,
    isPausedOnAuth: false,
    lastSyncSummary: null,
    lastSyncError: null,
    queueSummary: { total: 0, pending: 0, sending: 0, delivered: 0, conflict: 0, failed: 0 },
  })
  const [showSimulateForm, setShowSimulateForm] = React.useState(false)
  const [simPatientId, setSimPatientId] = React.useState('PC-SYNTH01')
  const [simVitalType, setSimVitalType] = React.useState('heart_rate')
  const [simValue, setSimValue] = React.useState('78')
  const [simFeedback, setSimFeedback] = React.useState('')

  const isFetchingRef = React.useRef(false)
  const activeDetailControllerRef = React.useRef(null)
  const selectedPatientIdRef = React.useRef(selectedPatientId)
  selectedPatientIdRef.current = selectedPatientId

  // Subscribe to syncManager state updates
  React.useEffect(() => {
    syncManager.init().catch(() => {})
    const unsubscribe = syncManager.subscribe((snapshot) => {
      setSyncState(snapshot)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const handleUnauthorized = React.useCallback(() => {
    clearStoredToken()
    setAccessToken('')
    setOverviewData(null)
    setPatients([])
    setAlerts([])
    setMeasurementsByPatient({})
    setSelectedPatientId(null)
    setSelectedPatientMeasurements([])
    setError('Your session has expired or been revoked. Please sign in again.')
  }, [])

  /**
   * Authoritative data fetch for all census patients and alerts
   */
  const loadDashboardData = React.useCallback(
    async (signal = null, silent = false) => {
      if (!accessToken) {
        setLoading(false)
        return
      }
      if (isFetchingRef.current) return
      isFetchingRef.current = true

      if (!silent) {
        setRefreshing(true)
      }

      try {
        let loadedPatients = []
        let loadedAlerts = []
        let loadedMeasurementMap = {}
        let overviewSuccess = false

        // 1. Primary: fetch consolidated overview
        try {
          const overviewRes = await fetchMonitorOverview({ signal, onUnauthorized: handleUnauthorized })
          if (overviewRes?.summary && overviewRes?.patients) {
            setOverviewData(overviewRes)
            loadedPatients = overviewRes.patients
            loadedAlerts = overviewRes.alerts || []

            for (const p of overviewRes.patients) {
              const vitals = p.latest_measurements || {}
              const allItems = Object.values(vitals).filter((v) => v.value !== null && v.value !== undefined)
              loadedMeasurementMap[p.patient_id] = {
                all: allItems,
                latest: vitals,
              }
            }
            overviewSuccess = true
          }
        } catch (oErr) {
          if (oErr.name === 'AbortError') throw oErr
          if (oErr instanceof SessionExpiredError) throw oErr
          // Fall back to discrete endpoints
        }

        // 2. Discrete endpoints fallback if consolidated overview failed
        if (!overviewSuccess) {
          const [patientsRes, alertsRes] = await Promise.all([
            fetchPatients({ signal, onUnauthorized: handleUnauthorized }),
            fetchAlerts({ signal, onUnauthorized: handleUnauthorized }),
          ])

          loadedPatients = patientsRes?.items || []
          loadedAlerts = alertsRes?.items || []

          await Promise.all(
            loadedPatients.map(async (patient) => {
              try {
                const res = await fetchPatientMeasurements(patient.patient_id, {
                  limit: 25,
                  signal,
                  onUnauthorized: handleUnauthorized,
                })
                const items = res?.items || []
                const latestByType = {}
                for (const m of items) {
                  if (!latestByType[m.measurement_type]) {
                    latestByType[m.measurement_type] = m
                  }
                }
                loadedMeasurementMap[patient.patient_id] = {
                  all: items,
                  latest: latestByType,
                }
              } catch (pErr) {
                if (pErr.name === 'AbortError') throw pErr
                loadedMeasurementMap[patient.patient_id] = { all: [], latest: {} }
              }
            })
          )
        }

        setPatients(loadedPatients)
        setAlerts(loadedAlerts)
        setMeasurementsByPatient(loadedMeasurementMap)

        // 3. Fetch escalations for alerts
        const escMap = {}
        await Promise.all(
          loadedAlerts.map(async (alert) => {
            try {
              const esc = await fetchAlertEscalation(alert.alert_id, {
                signal,
                onUnauthorized: handleUnauthorized,
              })
              if (esc) {
                escMap[alert.alert_id] = esc
              }
            } catch {}
          })
        )
        setAlertEscalations(escMap)

        setError('')
        setLastRefresh(new Date())
      } catch (err) {
        if (err.name !== 'AbortError') {
          if (err instanceof SessionExpiredError) {
            handleUnauthorized()
          } else if (err instanceof AccessDeniedError) {
            setError(err.message)
          } else {
            setError(err.message || 'Could not connect to the RPM backend.')
          }
        }
      } finally {
        isFetchingRef.current = false
        if (!signal?.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [accessToken, handleUnauthorized]
  )

  /**
   * Initial load upon authentication
   */
  React.useEffect(() => {
    if (!accessToken) {
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    loadDashboardData(controller.signal)
    return () => controller.abort()
  }, [accessToken, loadDashboardData])

  /**
   * Controlled Polling (10-15s, pause on hidden, prevent overlaps, clean up on unmount)
   */
  React.useEffect(() => {
    if (!accessToken) return undefined

    let timerId = null

    function tick() {
      if (document.hidden) return
      loadDashboardData(null, true)
    }

    timerId = setInterval(tick, DEFAULT_POLL_INTERVAL_MS)

    function handleVisibility() {
      if (!document.hidden && accessToken) {
        loadDashboardData(null, true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (timerId) clearInterval(timerId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [accessToken, loadDashboardData])

  /**
   * Patient Detail Fetch: handles rapid switching and stale response prevention
   */
  React.useEffect(() => {
    if (!selectedPatientId || !accessToken) {
      setSelectedPatientMeasurements([])
      setSelectedPatientLoading(false)
      setSelectedPatientError('')
      return undefined
    }

    if (activeDetailControllerRef.current) {
      activeDetailControllerRef.current.abort()
    }

    const controller = new AbortController()
    activeDetailControllerRef.current = controller
    const targetPatientId = selectedPatientId

    setSelectedPatientLoading(true)
    setSelectedPatientError('')

    fetchPatientMeasurements(targetPatientId, {
      limit: 50,
      signal: controller.signal,
      onUnauthorized: handleUnauthorized,
    })
      .then((res) => {
        // Prevent stale responses from overwriting if patient changed
        if (selectedPatientIdRef.current === targetPatientId) {
          setSelectedPatientMeasurements(res?.items || [])
          setSelectedPatientLoading(false)
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        if (selectedPatientIdRef.current === targetPatientId) {
          setSelectedPatientError(err.message || 'Could not load measurement history.')
          setSelectedPatientLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [selectedPatientId, accessToken, handleUnauthorized])

  async function handleSyncNow() {
    try {
      await syncManager.syncNow({ force: true })
      await loadDashboardData(null, true)
    } catch {
      // Error is captured in syncState.lastSyncError
    }
  }

  async function handleQueueObservation(e) {
    e.preventDefault()
    setSimFeedback('')
    try {
      const unitMap = {
        heart_rate: 'beats_per_minute',
        oxygen_saturation: 'percent',
        body_temperature: 'celsius',
        systolic_blood_pressure: 'mmHg',
        diastolic_blood_pressure: 'mmHg',
      }
      const newEvent = {
        schema_version: '1.0',
        event_id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : toValidUuid('b' + Math.random().toString(16).slice(2, 10) + '-0000-4000-8000-000000000001'),
        patient_id: simPatientId,
        measurement_type: simVitalType,
        value: parseFloat(simValue),
        unit: unitMap[simVitalType] || 'beats_per_minute',
        measured_at: new Date().toISOString(),
        source: 'patient',
        is_simulated: true,
      }
      await enqueueMeasurementEvent(newEvent)
      setSimFeedback(`Queued event ${newEvent.event_id.slice(0, 8)}... into offline IndexedDB queue.`)
      const summary = await syncManager.getSnapshot()
      setSyncState(summary)
    } catch (err) {
      setSimFeedback(`Error queueing observation: ${err.message}`)
    }
  }

  async function signIn(event) {
    event.preventDefault()
    setAuthBusy(true)
    setError('')
    try {
      const res = await loginClinician(username, password)
      const user = getStoredUser()
      if (user && user.role === 'patient') {
        clearStoredToken()
        throw new Error('Access forbidden: Clinician role required. Patient accounts cannot access the doctor workspace.')
      }
      setPassword('')
      setAccessToken(res.access_token)
      setLastRefresh(null)
      syncManager.resumeAfterAuth()
    } catch (err) {
      setError(err.message || 'Sign-in failed.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function signOut() {
    try {
      if (accessToken) {
        await logoutClinician(accessToken)
      }
    } finally {
      clearStoredToken()
      setAccessToken('')
      setPatients([])
      setAlerts([])
      setMeasurementsByPatient({})
      setSelectedPatientId(null)
      setSelectedPatientMeasurements([])
      setError('')
      setLastRefresh(null)
      if (typeof window !== 'undefined') {
        window.location.hash = '#/doctor'
      }
    }
  }

  async function performAlertAction(alert, customNote = null) {
    const action = alert.status === 'open' ? 'acknowledge' : 'resolve'
    const key = `${alert.alert_id}:${action}`
    setActionKey(key)
    try {
      const noteToSend = customNote || actionNote || undefined
      if (action === 'acknowledge') {
        await acknowledgeAlert(alert.alert_id, {
          actorId: username || 'demo-clinician',
          note: noteToSend,
        })
      } else {
        await resolveAlert(alert.alert_id, {
          actorId: username || 'demo-clinician',
          resolutionCode: 'demo_review_complete',
          note: noteToSend,
        })
      }
      setActionNote('')
      setShowNoteInputForAlert(null)
      // Authoritative state refresh
      await loadDashboardData(null, true)
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        handleUnauthorized()
      } else {
        setError(err.message || 'Could not update alert.')
      }
    } finally {
      setActionKey('')
    }
  }

  const selectedPatient =
    patients.find((patient) => patient.patient_id === selectedPatientId) || null

  const activeAlerts = alerts.filter(
    (alert) => alert.status === 'open' || alert.status === 'acknowledged'
  )

  // Quality conditions: alerts that represent data quality or stale/missing readings
  const qualityConditions = alerts.filter(
    (a) =>
      a.category === 'missing_measurement' ||
      a.category === 'stale_reading' ||
      a.category === 'ingestion_failure'
  )

  // Total measurements count
  const totalMeasurementsCount = Object.values(measurementsByPatient).reduce(
    (acc, cur) => acc + (cur?.all?.length || 0),
    0
  )

  // Distinct stale and missing counts
  const now = new Date()
  let staleCount = 0
  let missingCount = 0
  for (const patient of patients) {
    const patientData = measurementsByPatient[patient.patient_id]?.latest || patient.latest_measurements || {}
    for (const [type] of READING_TYPES) {
      const reading = patientData[type]
      const status = readingStatus(reading, now)
      if (status.tone === 'stale') staleCount++
      if (status.tone === 'missing') missingCount++
    }
  }

  // Phase 4: Consolidated Summary Metrics derived from backend or computed locally
  const summaryMetrics = React.useMemo(() => {
    if (overviewData?.summary) {
      return overviewData.summary
    }

    const totalPatients = patients.length
    const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 }
    let distinctStale = 0
    let distinctMissing = 0
    let reviewCount = 0

    const active = alerts.filter((a) => a.status === 'open' || a.status === 'acknowledged')
    for (const a of active) {
      if (sevCounts[a.severity] !== undefined) sevCounts[a.severity]++
    }

    for (const p of patients) {
      const pData = measurementsByPatient[p.patient_id]?.latest || p.latest_measurements || {}
      const pAlerts = active.filter((a) => a.patient_id === p.patient_id)
      let hasStale = false
      let hasMissing = false

      for (const [type] of READING_TYPES) {
        const r = pData[type]
        const st = readingStatus(r, now)
        if (st.tone === 'stale') hasStale = true
        if (st.tone === 'missing') hasMissing = true
      }

      if (hasStale) distinctStale++
      if (hasMissing) distinctMissing++
      if (hasStale || hasMissing || pAlerts.length > 0) reviewCount++
    }

    const pendingEsc = Object.values(alertEscalations).filter(
      (e) => e.status === 'pending' || e.status === 'escalated'
    ).length

    return {
      total_patients: totalPatients,
      patients_requiring_review: reviewCount,
      active_alerts_count: active.length,
      active_alerts_by_severity: sevCounts,
      patients_with_stale_measurements: distinctStale,
      patients_with_missing_measurements: distinctMissing,
      pending_escalations_count: pendingEsc,
      total_measurements_count: totalMeasurementsCount,
    }
  }, [overviewData, patients, alerts, measurementsByPatient, alertEscalations, totalMeasurementsCount])

  // Phase 4: Filtered and Sorted Patient Census
  const filteredPatients = React.useMemo(() => {
    return patients
      .filter((p) => {
        const q = searchQuery.trim().toLowerCase()
        if (q) {
          const matchId = p.patient_id.toLowerCase().includes(q)
          const matchName = p.display_name && p.display_name.toLowerCase().includes(q)
          if (!matchId && !matchName) return false
        }

        if (statusFilter !== 'all') {
          if (statusFilter === 'critical' && p.monitoring_status !== 'critical_attention') return false
          if (statusFilter === 'needs_review' && p.monitoring_status !== 'needs_review') return false
          if (statusFilter === 'normal' && p.monitoring_status !== 'normal') return false
        }

        if (severityFilter !== 'all') {
          if (severityFilter === 'none' && p.highest_severity && p.highest_severity !== 'none') return false
          if (severityFilter !== 'none' && p.highest_severity !== severityFilter) return false
        }

        if (freshnessFilter !== 'all') {
          if (freshnessFilter === 'stale' && !p.has_stale_vitals && p.freshness_status !== 'stale') return false
          if (freshnessFilter === 'missing' && !p.has_missing_vitals && p.freshness_status !== 'missing') return false
          if (freshnessFilter === 'recent' && (p.has_stale_vitals || p.has_missing_vitals || (p.freshness_status && p.freshness_status !== 'recent'))) return false
        }

        return true
      })
      .sort((a, b) => {
        if (sortBy === 'patient_id_asc') return a.patient_id.localeCompare(b.patient_id)
        if (sortBy === 'patient_id_desc') return b.patient_id.localeCompare(a.patient_id)
        if (sortBy === 'newest') {
          const ta = a.latest_measurement_at ? new Date(a.latest_measurement_at).getTime() : 0
          const tb = b.latest_measurement_at ? new Date(b.latest_measurement_at).getTime() : 0
          return tb - ta
        }
        if (sortBy === 'oldest') {
          const ta = a.latest_measurement_at ? new Date(a.latest_measurement_at).getTime() : 0
          const tb = b.latest_measurement_at ? new Date(b.latest_measurement_at).getTime() : 0
          return ta - tb
        }
        if (sortBy === 'severity') {
          const rank = { critical: 4, high: 3, medium: 2, low: 1, none: 0 }
          return (rank[b.highest_severity] || 0) - (rank[a.highest_severity] || 0)
        }
        const uRank = { critical_attention: 3, needs_review: 2, normal: 1 }
        const diff = (uRank[b.monitoring_status] || 1) - (uRank[a.monitoring_status] || 1)
        if (diff !== 0) return diff
        return a.patient_id.localeCompare(b.patient_id)
      })
  }, [patients, searchQuery, statusFilter, severityFilter, freshnessFilter, sortBy])

  const isFiltered =
    searchQuery !== '' ||
    statusFilter !== 'all' ||
    severityFilter !== 'all' ||
    freshnessFilter !== 'all' ||
    sortBy !== 'urgency'

  // Proportions for Phase 6 Visualizations
  const alertCounts = summaryMetrics.active_alerts_by_severity || { critical: 0, high: 0, medium: 0, low: 0 }
  const totalActive = summaryMetrics.active_alerts_count || 0
  const alertPercents = {
    crit: totalActive ? Math.round((alertCounts.critical / totalActive) * 100) : 0,
    high: totalActive ? Math.round((alertCounts.high / totalActive) * 100) : 0,
    med: totalActive ? Math.round((alertCounts.medium / totalActive) * 100) : 0,
    low: totalActive ? Math.round((alertCounts.low / totalActive) * 100) : 0,
  }

  const totalPatients = summaryMetrics.total_patients || 0
  const staleP = summaryMetrics.patients_with_stale_measurements || 0
  const missingP = summaryMetrics.patients_with_missing_measurements || 0
  const recentP = Math.max(0, totalPatients - staleP - missingP)
  const freshnessCounts = { recent: recentP, stale: staleP, missing: missingP }
  const freshnessPercents = {
    recent: totalPatients ? Math.round((recentP / totalPatients) * 100) : 0,
    stale: totalPatients ? Math.round((staleP / totalPatients) * 100) : 0,
    missing: totalPatients ? Math.round((missingP / totalPatients) * 100) : 0,
  }

  const criticalP = patients.filter((p) => p.monitoring_status === 'critical_attention').length
  const reviewP = patients.filter((p) => p.monitoring_status === 'needs_review').length
  const normalP = patients.filter((p) => p.monitoring_status === 'normal' || (!p.monitoring_status && p.highest_severity === 'none')).length
  const statusCounts = { normal: normalP, review: reviewP, critical: criticalP }
  const statusPercents = {
    normal: totalPatients ? Math.round((normalP / totalPatients) * 100) : 0,
    review: totalPatients ? Math.round((reviewP / totalPatients) * 100) : 0,
    critical: totalPatients ? Math.round((criticalP / totalPatients) * 100) : 0,
  }

  const hasData = patients.length > 0 || alerts.length > 0

  return (
    <section className="page-content rpm-dashboard" aria-labelledby="rpm-title">
      <div className="rpm-dashboard-header">
        <div>
          <span className="rpm-eyebrow">REMOTE PATIENT MONITORING · DEMO WORKSPACE</span>
          <h1 id="rpm-title">Clinician monitoring</h1>
          <p className="subheading">
            A focused view of synthetic readings, data quality, and demonstration alerts.
          </p>
        </div>
        <div className="rpm-header-actions">
          <span className="rpm-simulated-badge">
            <span />
            SIMULATED DATA — DEMO ONLY
          </span>
          {accessToken && (
            <button
              className="button button-secondary"
              onClick={() => loadDashboardData()}
              disabled={refreshing || loading}
            >
              <RefreshCw size={16} className={refreshing || loading ? 'rpm-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {accessToken && (
        <div
          className="rpm-route-nav"
          role="navigation"
          aria-label="Clinician Workspace Navigation"
          style={{
            display: 'flex',
            gap: '8px',
            margin: '0 0 16px 0',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: '12px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className={`button ${currentSubRoute === 'doctor' || currentSubRoute === '/doctor' ? 'button-primary' : 'button-secondary'}`}
            onClick={() => {
              window.location.hash = '#/doctor'
            }}
          >
            RPM Monitor
          </button>
          <button
            type="button"
            className={`button ${currentSubRoute.includes('doctor/patients') ? 'button-primary' : 'button-secondary'}`}
            onClick={() => {
              window.location.hash = '#/doctor/patients'
            }}
          >
            Patient Directory ({patients.length})
          </button>
          <button
            type="button"
            className={`button ${currentSubRoute.includes('doctor/alerts') ? 'button-primary' : 'button-secondary'}`}
            onClick={() => {
              window.location.hash = '#/doctor/alerts'
            }}
          >
            Alert Queue ({activeAlerts.length})
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              window.location.hash = '#/patient'
            }}
          >
            Patient Portal
          </button>
        </div>
      )}

      {accessToken && (
        <div className="rpm-sync-bar" role="region" aria-label="Offline event queue status">
          <div className="rpm-sync-group">
            <span className={`rpm-net-badge ${syncState.isOnline ? 'online' : 'offline'}`}>
              {syncState.isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
              {syncState.isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
            <span className="rpm-sync-pill">
              <strong>{syncState.queueSummary?.pending || 0}</strong> queued
            </span>
            {syncState.queueSummary?.sending > 0 && (
              <span className="rpm-sync-pill">
                <strong>{syncState.queueSummary.sending}</strong> syncing
              </span>
            )}
            <span className="rpm-sync-pill">
              <strong>{syncState.queueSummary?.delivered || 0}</strong> synchronized
            </span>
            {(syncState.queueSummary?.conflict > 0 || syncState.queueSummary?.failed > 0) && (
              <span
                className="rpm-sync-pill rpm-sync-attention"
                title="Events requiring review or resolution"
              >
                <AlertTriangle size={12} />
                <strong>
                  {(syncState.queueSummary?.conflict || 0) + (syncState.queueSummary?.failed || 0)}
                </strong>{' '}
                attention required
              </span>
            )}
            {syncState.queueSummary?.foreignPending > 0 && (
              <span
                className="rpm-sync-pill foreign-alert"
                title="Preserved offline events belonging to a different account. Not synchronized under this session."
              >
                <AlertTriangle size={12} />
                <strong>{syncState.queueSummary.foreignPending}</strong> other account (preserved)
              </span>
            )}
            <span className="rpm-sync-pill">
              Last sync {formatTime(syncState.lastSyncTime)}
            </span>
          </div>
          <div className="rpm-sync-group">
            <button
              className="button button-secondary rpm-sync-button"
              onClick={() => setShowSimulateForm(!showSimulateForm)}
            >
              <PlusCircle size={14} />
              {showSimulateForm ? 'Hide Queue Tool' : 'Queue Observation'}
            </button>
            <button
              className="button button-primary rpm-sync-button"
              onClick={handleSyncNow}
              disabled={
                syncState.isSyncing ||
                (!syncState.isOnline && (syncState.queueSummary?.pending || 0) === 0)
              }
            >
              <RefreshCw size={14} className={syncState.isSyncing ? 'rpm-spin' : ''} />
              {syncState.isSyncing ? 'Synchronizing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      )}

      {showSimulateForm && accessToken && (
        <div className="rpm-simulate-panel">
          <h3>Queue Local Observation (Offline-First Durability Test)</h3>
          <form className="rpm-simulate-form" onSubmit={handleQueueObservation}>
            <label>
              Patient
              <select value={simPatientId} onChange={(e) => setSimPatientId(e.target.value)}>
                {patients.length ? (
                  patients.map((p) => (
                    <option key={p.patient_id} value={p.patient_id}>
                      {p.patient_id} ({p.display_name || 'Patient'})
                    </option>
                  ))
                ) : (
                  <option value="PC-SYNTH01">PC-SYNTH01 (Synthetic)</option>
                )}
              </select>
            </label>
            <label>
              Vital Type
              <select value={simVitalType} onChange={(e) => setSimVitalType(e.target.value)}>
                {READING_TYPES.map(([key, label, unit]) => (
                  <option key={key} value={key}>
                    {label} ({unit})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Value
              <input
                type="number"
                step="any"
                value={simValue}
                onChange={(e) => setSimValue(e.target.value)}
                required
              />
            </label>
            <button className="button button-secondary" type="submit">
              Save to Offline Queue
            </button>
          </form>
          {simFeedback && <div className="rpm-queue-feedback">{simFeedback}</div>}
        </div>
      )}

      {syncState.lastSyncError && accessToken && (
        <div className="rpm-error-banner" role="alert" style={{ marginBottom: '14px' }}>
          <WifiOff size={18} />
          <div style={{ flex: 1 }}>
            <strong>Offline Queue Synchronization Paused</strong>
            <p style={{ margin: '4px 0 8px 0', fontSize: '0.9rem' }}>{syncState.lastSyncError}</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="button button-secondary"
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => {
                  syncManager.syncNow({ force: true }).catch(() => {})
                }}
              >
                Retry Synchronization
              </button>
              <button
                type="button"
                className="button button-outline"
                style={{ padding: '4px 10px', fontSize: '0.8rem', color: '#b91c1c', borderColor: '#fca5a5' }}
                onClick={async () => {
                  await syncManager.clearAllQueue()
                }}
              >
                Clear Offline Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {!accessToken && (
        <form className="rpm-login-panel" onSubmit={signIn}>
          <div>
            <span className="rpm-eyebrow">PROTECTED RPM WORKSPACE</span>
            <h2>Sign in to monitoring</h2>
            <p>
              Use the locally configured clinician account. No credentials are stored in the frontend.
            </p>
          </div>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="button button-primary" type="submit" disabled={authBusy}>
            {authBusy ? 'Signing in...' : 'Sign in'}
          </button>
          {error && (
            <p className="rpm-login-error" role="alert">
              {error}
            </p>
          )}
          <p className="rpm-login-note">
            Synthetic demo only. Configure credentials through backend environment variables.
          </p>
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <button
              type="button"
              className="rpm-link-btn"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.hash = '#/'
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#0d9488',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              ← Back to role selection
            </button>
          </div>
        </form>
      )}

      {error && accessToken && (
        <div className="rpm-error-banner" role="alert">
          <WifiOff size={18} />
          <div>
            <strong>RPM backend unavailable</strong>
            <span>
              {error}{' '}
              {hasData
                ? 'Showing the last successful snapshot. Data may be stale.'
                : 'No dashboard data has been loaded.'}
            </span>
          </div>
        </div>
      )}

      {loading && !hasData && (
        <div className="rpm-loading" role="status">
          <RefreshCw size={20} className="rpm-spin" /> Loading synthetic monitoring data...
        </div>
      )}

      {!loading && !hasData && !error && accessToken && (
        <div className="rpm-empty-state">
          <Activity size={22} />
          <h2>No monitoring data</h2>
          <p>The backend returned an empty patient census.</p>
        </div>
      )}

      {accessToken && hasData && (
        <>
          <div className="rpm-status-strip">
            <span>
              <span className="rpm-live-dot" />
              Backend snapshot loaded
            </span>
            <span>Last refresh {formatTime(lastRefresh)}</span>
            <span>Auto-refresh: 12s</span>
          </div>

          {/* Phase 2: Consolidated Clinical Metrics Row */}
          <div className="rpm-overview-metrics-grid" role="region" aria-label="Integrated Clinical Metrics">
            <div className="rpm-overview-metric-card">
              <div className="rpm-overview-metric-header">
                <span className="rpm-overview-metric-title">Total Authorized</span>
                <div className="rpm-overview-metric-icon rpm-icon-blue">
                  <Users size={16} />
                </div>
              </div>
              <div className="rpm-overview-metric-value">{summaryMetrics.total_patients}</div>
              <div className="rpm-overview-metric-subtext">Clinician assigned scope</div>
            </div>

            <div className="rpm-overview-metric-card">
              <div className="rpm-overview-metric-header">
                <span className="rpm-overview-metric-title">Patients Requiring Review</span>
                <div className="rpm-overview-metric-icon rpm-icon-rose">
                  <AlertTriangle size={16} />
                </div>
              </div>
              <div className="rpm-overview-metric-value">{summaryMetrics.patients_requiring_review}</div>
              <div className="rpm-overview-metric-subtext">Active alerts or telemetry gaps</div>
            </div>

            <div className="rpm-overview-metric-card">
              <div className="rpm-overview-metric-header">
                <span className="rpm-overview-metric-title">Active Demo Alerts</span>
                <div className="rpm-overview-metric-icon rpm-icon-amber">
                  <ShieldAlert size={16} />
                </div>
              </div>
              <div className="rpm-overview-metric-value">{summaryMetrics.active_alerts_count}</div>
              <div className="rpm-severity-pills-row">
                <span className="rpm-sev-pill crit">Crit: {summaryMetrics.active_alerts_by_severity?.critical || 0}</span>
                <span className="rpm-sev-pill high">High: {summaryMetrics.active_alerts_by_severity?.high || 0}</span>
                <span className="rpm-sev-pill med">Med: {summaryMetrics.active_alerts_by_severity?.medium || 0}</span>
                <span className="rpm-sev-pill low">Low: {summaryMetrics.active_alerts_by_severity?.low || 0}</span>
              </div>
            </div>

            <div className="rpm-overview-metric-card">
              <div className="rpm-overview-metric-header">
                <span className="rpm-overview-metric-title">Patients with Stale Data</span>
                <div className="rpm-overview-metric-icon rpm-icon-amber">
                  <Clock3 size={16} />
                </div>
              </div>
              <div className="rpm-overview-metric-value">{summaryMetrics.patients_with_stale_measurements}</div>
              <div className="rpm-overview-metric-subtext">Distinct patients (&gt; 15m delay)</div>
            </div>

            <div className="rpm-overview-metric-card">
              <div className="rpm-overview-metric-header">
                <span className="rpm-overview-metric-title">Patients with Missing Data</span>
                <div className="rpm-overview-metric-icon rpm-icon-rose">
                  <WifiOff size={16} />
                </div>
              </div>
              <div className="rpm-overview-metric-value">{summaryMetrics.patients_with_missing_measurements}</div>
              <div className="rpm-overview-metric-subtext">Distinct patients (missing vitals)</div>
            </div>

            <div className="rpm-overview-metric-card">
              <div className="rpm-overview-metric-header">
                <span className="rpm-overview-metric-title">Pending Escalations</span>
                <div className="rpm-overview-metric-icon rpm-icon-purple">
                  <TrendingUp size={16} />
                </div>
              </div>
              <div className="rpm-overview-metric-value">{summaryMetrics.pending_escalations_count}</div>
              <div className="rpm-overview-metric-subtext">CHW & supervisor notifications</div>
            </div>

            <div className="rpm-overview-metric-card">
              <div className="rpm-overview-metric-header">
                <span className="rpm-overview-metric-title">Data Synchronization</span>
                <div className="rpm-overview-metric-icon rpm-icon-emerald">
                  <RefreshCw size={16} />
                </div>
              </div>
              <div className="rpm-overview-metric-value" style={{ fontSize: '18px' }}>
                {syncState.isOnline ? 'Online' : 'Offline'}
              </div>
              <div className="rpm-overview-metric-subtext">
                Last refresh: {lastRefresh ? formatTime(lastRefresh) : 'Initial sync'}
              </div>
            </div>
          </div>

          {/* Phase 6: Clinical Visualizations Grid */}
          <div className="rpm-charts-grid" role="region" aria-label="Clinical Visualizations">
            <div className="rpm-chart-card">
              <div className="rpm-chart-title">
                <BarChart3 size={15} style={{ color: '#be123c' }} />
                <span>Active Alerts by Severity</span>
              </div>
              <p className="rpm-chart-desc">
                {summaryMetrics.active_alerts_count} active alert{summaryMetrics.active_alerts_count === 1 ? '' : 's'} across authorized patients
              </p>
              {summaryMetrics.active_alerts_count > 0 ? (
                <>
                  <div className="rpm-segmented-bar" aria-label="Severity proportions">
                    {alertPercents.crit > 0 && <div className="rpm-segment rose" style={{ width: `${alertPercents.crit}%` }} title={`Critical: ${alertCounts.critical}`} />}
                    {alertPercents.high > 0 && <div className="rpm-segment amber" style={{ width: `${alertPercents.high}%` }} title={`High: ${alertCounts.high}`} />}
                    {alertPercents.med > 0 && <div className="rpm-segment sky" style={{ width: `${alertPercents.med}%` }} title={`Medium: ${alertCounts.medium}`} />}
                    {alertPercents.low > 0 && <div className="rpm-segment emerald" style={{ width: `${alertPercents.low}%` }} title={`Low: ${alertCounts.low}`} />}
                  </div>
                  <div className="rpm-chart-legend">
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#f43f5e' }} /> Critical ({alertCounts.critical})</span>
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#f59e0b' }} /> High ({alertCounts.high})</span>
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#0ea5e9' }} /> Medium ({alertCounts.medium})</span>
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#10b981' }} /> Low ({alertCounts.low})</span>
                  </div>
                </>
              ) : (
                <p className="rpm-empty-inline" style={{ fontSize: '12px', margin: 0 }}>All physiological vitals within normal demonstration bounds.</p>
              )}
            </div>

            <div className="rpm-chart-card">
              <div className="rpm-chart-title">
                <PieChart size={15} style={{ color: '#0369a1' }} />
                <span>Telemetry Freshness Distribution</span>
              </div>
              <p className="rpm-chart-desc">
                Data-quality status across {summaryMetrics.total_patients} authorized patient{summaryMetrics.total_patients === 1 ? '' : 's'}
              </p>
              {summaryMetrics.total_patients > 0 ? (
                <>
                  <div className="rpm-segmented-bar" aria-label="Freshness proportions">
                    {freshnessPercents.recent > 0 && <div className="rpm-segment emerald" style={{ width: `${freshnessPercents.recent}%` }} title={`Recent: ${freshnessCounts.recent}`} />}
                    {freshnessPercents.stale > 0 && <div className="rpm-segment amber" style={{ width: `${freshnessPercents.stale}%` }} title={`Stale: ${freshnessCounts.stale}`} />}
                    {freshnessPercents.missing > 0 && <div className="rpm-segment rose" style={{ width: `${freshnessPercents.missing}%` }} title={`Missing: ${freshnessCounts.missing}`} />}
                  </div>
                  <div className="rpm-chart-legend">
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#10b981' }} /> Recent ({freshnessCounts.recent})</span>
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#f59e0b' }} /> Stale ({freshnessCounts.stale})</span>
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#f43f5e' }} /> Missing ({freshnessCounts.missing})</span>
                  </div>
                </>
              ) : (
                <p className="rpm-empty-inline" style={{ fontSize: '12px', margin: 0 }}>No authorized patients in scope.</p>
              )}
            </div>

            <div className="rpm-chart-card">
              <div className="rpm-chart-title">
                <Activity size={15} style={{ color: '#15803d' }} />
                <span>Monitoring Status Distribution</span>
              </div>
              <p className="rpm-chart-desc">
                Clinical triage distribution across authorized patients
              </p>
              {summaryMetrics.total_patients > 0 ? (
                <>
                  <div className="rpm-segmented-bar" aria-label="Monitoring status proportions">
                    {statusPercents.normal > 0 && <div className="rpm-segment emerald" style={{ width: `${statusPercents.normal}%` }} title={`Normal: ${statusCounts.normal}`} />}
                    {statusPercents.review > 0 && <div className="rpm-segment amber" style={{ width: `${statusPercents.review}%` }} title={`Needs Review: ${statusCounts.review}`} />}
                    {statusPercents.critical > 0 && <div className="rpm-segment rose" style={{ width: `${statusPercents.critical}%` }} title={`Critical: ${statusCounts.critical}`} />}
                  </div>
                  <div className="rpm-chart-legend">
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#10b981' }} /> Normal ({statusCounts.normal})</span>
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#f59e0b' }} /> Needs Review ({statusCounts.review})</span>
                    <span className="rpm-legend-item"><span className="rpm-legend-dot" style={{ background: '#f43f5e' }} /> Critical Attention ({statusCounts.critical})</span>
                  </div>
                </>
              ) : (
                <p className="rpm-empty-inline" style={{ fontSize: '12px', margin: 0 }}>No authorized patients in scope.</p>
              )}
            </div>
          </div>

          <div className="rpm-content-grid">
            <div className="rpm-main-column">
              <section className="rpm-section-panel">
                <div className="rpm-section-heading">
                  <div>
                    <span className="rpm-eyebrow">PATIENT CENSUS</span>
                    <h2>Monitoring overview</h2>
                  </div>
                  <span className="rpm-section-count">
                    {patients.length} synthetic patient{patients.length === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Phase 4: Search, Filters, and Sorting Bar */}
                <div className="rpm-table-controls-bar" role="search" aria-label="Filter patient census">
                  <div className="rpm-search-input-wrap">
                    <Search size={15} style={{ color: '#64748b' }} aria-hidden="true" />
                    <input
                      type="text"
                      className="rpm-search-input"
                      placeholder="Search authorized patients by ID or name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Search patients by identifier or name"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', color: '#64748b' }}
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="rpm-filter-group">
                    <select
                      className="rpm-control-select"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      aria-label="Filter by monitoring status"
                    >
                      <option value="all">All Monitoring Statuses</option>
                      <option value="critical">Critical Attention</option>
                      <option value="needs_review">Needs Review</option>
                      <option value="normal">Normal Monitoring</option>
                    </select>

                    <select
                      className="rpm-control-select"
                      value={severityFilter}
                      onChange={(e) => setSeverityFilter(e.target.value)}
                      aria-label="Filter by active alert severity"
                    >
                      <option value="all">All Severities</option>
                      <option value="critical">Critical Severity</option>
                      <option value="high">High Severity</option>
                      <option value="medium">Medium Severity</option>
                      <option value="low">Low Severity</option>
                      <option value="none">No Active Alerts</option>
                    </select>

                    <select
                      className="rpm-control-select"
                      value={freshnessFilter}
                      onChange={(e) => setFreshnessFilter(e.target.value)}
                      aria-label="Filter by telemetry freshness"
                    >
                      <option value="all">All Telemetry Freshness</option>
                      <option value="recent">All Vitals Current</option>
                      <option value="stale">Has Stale Vitals</option>
                      <option value="missing">Has Missing Vitals</option>
                    </select>

                    <select
                      className="rpm-control-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      aria-label="Sort patient census"
                    >
                      <option value="urgency">Sort: Urgency (Critical First)</option>
                      <option value="patient_id_asc">Sort: Patient ID (A → Z)</option>
                      <option value="patient_id_desc">Sort: Patient ID (Z → A)</option>
                      <option value="newest">Sort: Latest Reading (Newest)</option>
                      <option value="oldest">Sort: Latest Reading (Oldest)</option>
                      <option value="severity">Sort: Alert Severity (Highest)</option>
                    </select>

                    {isFiltered && (
                      <button
                        type="button"
                        className="rpm-clear-filters-btn"
                        onClick={() => {
                          setSearchQuery('')
                          setStatusFilter('all')
                          setSeverityFilter('all')
                          setFreshnessFilter('all')
                          setSortBy('urgency')
                        }}
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>

                  <span className="rpm-results-badge">
                    Showing {filteredPatients.length} of {patients.length} patient{patients.length === 1 ? '' : 's'}
                  </span>
                </div>

                {filteredPatients.length ? (
                  <PatientTable
                    patients={filteredPatients}
                    measurementsByPatient={measurementsByPatient}
                    alerts={alerts}
                    onSelect={handleSelectPatient}
                    selectedPatientId={selectedPatientId}
                    onNavigateToPatient={onNavigate}
                  />
                ) : (
                  <div className="rpm-empty-state" style={{ padding: '30px 20px', border: 'none' }}>
                    <p style={{ margin: '0 0 10px', color: '#64748b' }}>No authorized patients match the current search or filters.</p>
                    {isFiltered && (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          setSearchQuery('')
                          setStatusFilter('all')
                          setSeverityFilter('all')
                          setFreshnessFilter('all')
                          setSortBy('urgency')
                        }}
                      >
                        Reset All Filters
                      </button>
                    )}
                  </div>
                )}
              </section>

              <section className="rpm-section-panel">
                <div className="rpm-section-heading">
                  <div>
                    <span className="rpm-eyebrow">ATTENTION QUEUE</span>
                    <h2>Active demonstration alerts</h2>
                  </div>
                  <span className="rpm-section-count">{activeAlerts.length}</span>
                </div>
                {activeAlerts.length ? (
                  <div className="rpm-alert-list">
                    {activeAlerts.map((alert) => {
                      const patientMeasurements =
                        measurementsByPatient[alert.patient_id]?.all || []
                      const relatedEvent = alert.related_event_id
                        ? patientMeasurements.find((item) => item.event_id === alert.related_event_id)
                        : null

                      const action =
                        alert.status === 'open'
                          ? 'Acknowledge'
                          : alert.status === 'acknowledged'
                          ? 'Resolve'
                          : ''
                      const actionId = `${alert.alert_id}:${
                        alert.status === 'open' ? 'acknowledge' : 'resolve'
                      }`

                      const esc = alertEscalations[alert.alert_id]
                      const waitingMinutes = Math.max(
                        0,
                        Math.floor((new Date().getTime() - new Date(alert.created_at).getTime()) / 60000)
                      )

                      return (
                        <div className="rpm-alert-card" key={alert.alert_id}>
                          <span className={`rpm-severity rpm-severity-${alert.severity}`}>
                            {alert.severity}
                          </span>
                          <div className="rpm-alert-main">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong>{alert.reason?.code || alert.category}</strong>
                              {alert.status === 'acknowledged' ? (
                                <span className="rpm-escalation-pill stopped">Ack Stopped</span>
                              ) : alert.status === 'resolved' ? (
                                <span className="rpm-escalation-pill stopped">Resolved</span>
                              ) : esc?.current_level === 1 ? (
                                <span className="rpm-escalation-pill level-1">Level 1: CHW Notified (simulated)</span>
                              ) : esc?.current_level === 2 ? (
                                <span className="rpm-escalation-pill level-2">Level 2: Supervisor Escalated (simulated)</span>
                              ) : (
                                <span className="rpm-escalation-pill level-0">Pending Escalation</span>
                              )}
                            </div>
                            <span>
                              {alert.patient_id} ·{' '}
                              {relatedEvent
                                ? `${relatedEvent.value} ${formatUnit(relatedEvent.unit)}`
                                : alert.reason?.message || 'Observation alert'}
                            </span>
                            <small>
                              {formatTime(relatedEvent?.measured_at || alert.created_at)} ·{' '}
                              {alert.status?.toUpperCase()}
                            </small>
                            <div className="rpm-escalation-meta">
                              <span>Awaiting ack: {waitingMinutes}m</span>
                              {esc?.next_due_at && (
                                <span> · Next escalation: {formatTime(esc.next_due_at)}</span>
                              )}
                              <span> · <span className="rpm-simulated-tag">SIMULATED NOTIFICATIONS</span></span>
                            </div>
                            {esc?.notifications?.length > 0 && (
                              <div>
                                <button
                                  type="button"
                                  className="rpm-notif-drawer-toggle"
                                  onClick={() =>
                                    setExpandedAlerts((prev) => ({
                                      ...prev,
                                      [alert.alert_id]: !prev[alert.alert_id],
                                    }))
                                  }
                                >
                                  {expandedAlerts[alert.alert_id]
                                    ? 'Hide simulated notification history'
                                    : `Simulated notifications (${esc.notifications.length})`}
                                </button>
                                {expandedAlerts[alert.alert_id] && (
                                  <div className="rpm-notif-history">
                                    {esc.notifications.map((n) => (
                                      <div className="rpm-notif-card" key={n.notification_id}>
                                        <div className="rpm-notif-header">
                                          <span>
                                            Level {n.escalation_level} · {n.recipient_role} ({n.channel})
                                          </span>
                                          <span className={`rpm-notif-delivery ${n.delivery_status}`}>
                                            {n.delivery_status} (simulated)
                                          </span>
                                          <span>{formatTime(n.attempted_at)}</span>
                                        </div>
                                        <div className="rpm-notif-body">{n.message_body}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {showNoteInputForAlert === alert.alert_id && (
                              <div style={{ marginTop: '6px' }}>
                                <input
                                  type="text"
                                  placeholder="Add clinician note (optional)..."
                                  value={actionNote}
                                  onChange={(e) => setActionNote(e.target.value)}
                                  style={{
                                    fontSize: '11px',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    width: '100%',
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <span className="rpm-alert-id">{alert.alert_id.slice(0, 8)}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                            <button
                              type="button"
                              className="rpm-open-patient-btn"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                              onClick={() => {
                                const target = `/doctor/patients/${alert.patient_id}`
                                if (onNavigate) {
                                  onNavigate(target)
                                } else if (typeof window !== 'undefined') {
                                  window.location.hash = `#${target}`
                                }
                              }}
                              aria-label={`Open telemetry for patient ${alert.patient_id}`}
                            >
                              <span>View Patient</span>
                              <span>→</span>
                            </button>
                            {action && (
                              <button
                                className="button button-secondary rpm-alert-action"
                                onClick={() => performAlertAction(alert)}
                                disabled={actionKey === actionId}
                              >
                                {actionKey === actionId ? 'Saving...' : action}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="rpm-empty-inline">No active demonstration alerts returned.</p>
                )}
                <p className="rpm-panel-footnote">
                  <AlertTriangle size={14} /> Thresholds are software demonstration rules, not
                  clinically validated guidance.
                </p>
              </section>
            </div>

            <section className="rpm-section-panel rpm-quality-panel">
              <div className="rpm-section-heading">
                <div>
                  <span className="rpm-eyebrow">DATA QUALITY</span>
                  <h2>Freshness watch</h2>
                </div>
                <Clock3 size={19} />
              </div>
              {qualityConditions.length ? (
                qualityConditions.map((condition) => (
                  <div className="rpm-condition-card" key={condition.alert_id}>
                    <span
                      className={`rpm-condition-icon ${
                        condition.category === 'stale_reading' ? 'stale' : 'missing'
                      }`}
                    >
                      <WifiOff size={16} />
                    </span>
                    <div>
                      <strong>
                        {condition.category === 'stale_reading'
                          ? 'Stale reading'
                          : 'Missing measurement'}
                      </strong>
                      <span>
                        {condition.patient_id} ·{' '}
                        {condition.reason?.expected_measurement_type || condition.reason?.code}
                      </span>
                      <small>
                        {condition.reason?.message} · {formatTime(condition.created_at)}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rpm-empty-inline">No missing or stale conditions returned.</p>
              )}
              <div className="rpm-quality-note">
                A missing or stale status is a data-quality condition, not a normal vital reading.
              </div>
            </section>
          </div>
        </>
      )}

      {accessToken && (
        <button className="rpm-signout" onClick={signOut}>
          Sign out of RPM workspace
        </button>
      )}

      <PatientDetail
        patient={selectedPatient}
        measurements={selectedPatientMeasurements}
        alerts={alerts}
        loading={selectedPatientLoading}
        error={selectedPatientError}
        onClose={handleClosePatient}
        onPerformAlertAction={performAlertAction}
        actionKey={actionKey}
        onNavigateToPatient={onNavigate}
      />
    </section>
  )
}
