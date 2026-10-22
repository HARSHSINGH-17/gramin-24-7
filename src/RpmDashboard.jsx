import React from 'react'
import {
  Activity,
  AlertTriangle,
  Clock3,
  Droplets,
  HeartPulse,
  RefreshCw,
  Thermometer,
  WifiOff,
  X,
} from 'lucide-react'
import {
  DEMO_STALE_THRESHOLD_MINUTES,
  SessionExpiredError,
  AccessDeniedError,
  getStoredToken,
  clearStoredToken,
  loginClinician,
  logoutClinician,
  fetchPatients,
  fetchPatientMeasurements,
  fetchAlerts,
  acknowledgeAlert,
  resolveAlert,
} from './rpmApi'

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
  if (reading.outcome === 'stale') {
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
  return { label: 'Received', tone: 'received' }
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
  measurementsByPatient,
  alerts,
  onSelect,
  selectedPatientId,
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
            <th scope="col">Last received</th>
            <th scope="col">Alerts</th>
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
                  const reading = latestByType[type]
                  const shown = displayReading(reading, defaultUnit)
                  return (
                    <td key={type}>
                      <div className="rpm-reading-cell">
                        <strong>{shown.value}</strong>
                        {shown.unit && <small>{shown.unit}</small>}
                        <StatusBadge status={readingStatus(reading, now)} />
                      </div>
                    </td>
                  )
                })}
                <td>
                  <span className="rpm-time">
                    <Clock3 size={14} />
                    {formatTime(mostRecent?.received_at || mostRecent?.measured_at)}
                  </span>
                </td>
                <td>
                  {patientAlerts.length ? (
                    <span className="rpm-alert-count">
                      <AlertTriangle size={14} />
                      {patientAlerts.length} active
                    </span>
                  ) : (
                    <span className="rpm-clear">No active alerts</span>
                  )}
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

export default function RpmDashboard() {
  const [accessToken, setAccessToken] = React.useState(() => getStoredToken())
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [authBusy, setAuthBusy] = React.useState(false)

  const [patients, setPatients] = React.useState([])
  const [alerts, setAlerts] = React.useState([])
  const [measurementsByPatient, setMeasurementsByPatient] = React.useState({})
  const [selectedPatientId, setSelectedPatientId] = React.useState(null)
  const [selectedPatientMeasurements, setSelectedPatientMeasurements] = React.useState([])
  const [selectedPatientLoading, setSelectedPatientLoading] = React.useState(false)
  const [selectedPatientError, setSelectedPatientError] = React.useState('')

  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState('')
  const [lastRefresh, setLastRefresh] = React.useState(null)
  const [actionKey, setActionKey] = React.useState('')
  const [actionNote, setActionNote] = React.useState('')
  const [showNoteInputForAlert, setShowNoteInputForAlert] = React.useState(null)

  const isFetchingRef = React.useRef(false)
  const activeDetailControllerRef = React.useRef(null)
  const selectedPatientIdRef = React.useRef(selectedPatientId)
  selectedPatientIdRef.current = selectedPatientId

  const handleUnauthorized = React.useCallback(() => {
    clearStoredToken()
    setAccessToken('')
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
        // 1. Fetch Patients & Alerts in parallel
        const [patientsRes, alertsRes] = await Promise.all([
          fetchPatients({ signal, onUnauthorized: handleUnauthorized }),
          fetchAlerts({ signal, onUnauthorized: handleUnauthorized }),
        ])

        const patientList = patientsRes?.items || []
        const alertList = alertsRes?.items || []

        // 2. Fetch latest measurements for visible census patients
        const measurementMap = {}
        await Promise.all(
          patientList.map(async (patient) => {
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
              measurementMap[patient.patient_id] = {
                all: items,
                latest: latestByType,
              }
            } catch (pErr) {
              if (pErr.name === 'AbortError') throw pErr
              measurementMap[patient.patient_id] = { all: [], latest: {} }
            }
          })
        )

        setPatients(patientList)
        setAlerts(alertList)
        setMeasurementsByPatient(measurementMap)
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

  async function signIn(event) {
    event.preventDefault()
    setAuthBusy(true)
    setError('')
    try {
      const res = await loginClinician(username, password)
      setPassword('')
      setAccessToken(res.access_token)
      setLastRefresh(null)
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

  // Count total measurements returned across census
  const totalMeasurementsCount = Object.values(measurementsByPatient).reduce(
    (acc, cur) => acc + (cur?.all?.length || 0),
    0
  )

  // Count stale or missing measurements across census
  const now = new Date()
  let staleCount = 0
  let missingCount = 0
  for (const patient of patients) {
    const patientData = measurementsByPatient[patient.patient_id]?.latest || {}
    for (const [type] of READING_TYPES) {
      const reading = patientData[type]
      const status = readingStatus(reading, now)
      if (status.tone === 'stale') staleCount++
      if (status.tone === 'missing') missingCount++
    }
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
            SIMULATED DATA
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

          <div className="rpm-metrics-grid">
            <Metric
              icon={HeartPulse}
              label="Synthetic patients"
              value={patients.length}
              tone="green"
            />
            <Metric
              icon={Activity}
              label="Returned measurements"
              value={totalMeasurementsCount}
              tone="blue"
            />
            <Metric
              icon={AlertTriangle}
              label="Active demo alerts"
              value={activeAlerts.length}
              tone="amber"
            />
            <Metric
              icon={WifiOff}
              label="Missing / stale"
              value={`${missingCount} / ${staleCount}`}
              tone="rose"
            />
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
                {patients.length ? (
                  <PatientTable
                    patients={patients}
                    measurementsByPatient={measurementsByPatient}
                    alerts={alerts}
                    onSelect={setSelectedPatientId}
                    selectedPatientId={selectedPatientId}
                  />
                ) : (
                  <p className="rpm-empty-inline">No synthetic patients were returned.</p>
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

                      return (
                        <div className="rpm-alert-card" key={alert.alert_id}>
                          <span className={`rpm-severity rpm-severity-${alert.severity}`}>
                            {alert.severity}
                          </span>
                          <div className="rpm-alert-main">
                            <strong>{alert.reason?.code || alert.category}</strong>
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
        onClose={() => setSelectedPatientId(null)}
        onPerformAlertAction={performAlertAction}
        actionKey={actionKey}
      />
    </section>
  )
}
