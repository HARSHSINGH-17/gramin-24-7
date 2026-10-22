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

const API_BASE_URL = ((typeof window !== 'undefined' && window.__RPM_API_BASE_URL) || import.meta.env.VITE_RPM_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

const READING_TYPES = [
  ['heart_rate', 'Heart rate', 'bpm', HeartPulse],
  ['oxygen_saturation', 'SpO2', '%', Droplets],
  ['body_temperature', 'Temperature', 'C', Thermometer],
  ['systolic_blood_pressure', 'Systolic BP', 'mmHg', Activity],
  ['diastolic_blood_pressure', 'Diastolic BP', 'mmHg', Activity],
]

function formatTime(value) {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid timestamp'
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function readingStatus(reading) {
  if (!reading) return { label: 'Missing', tone: 'missing' }
  if (reading.outcome === 'stale') return { label: 'Stale', tone: 'stale' }
  return { label: 'Received', tone: 'received' }
}

function displayReading(reading, unit) {
  if (!reading || reading.value === null || reading.value === undefined) {
    return { value: 'Missing', unit: '' }
  }
  return { value: reading.value, unit }
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div className={`rpm-metric rpm-metric-${tone}`}>
      <span className="rpm-metric-icon"><Icon size={18} /></span>
      <span className="rpm-metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusBadge({ status }) {
  return <span className={`rpm-status rpm-status-${status.tone}`}>{status.label}</span>
}

function PatientTable({ patients, onSelect }) {
  return (
    <div className="rpm-table-wrap">
      <table className="rpm-table">
        <caption className="sr-only">Synthetic patient monitoring status</caption>
        <thead>
          <tr>
            <th scope="col">Patient</th>
            {READING_TYPES.map(([, label, unit]) => <th scope="col" key={label}>{label}<small>{unit}</small></th>)}
            <th scope="col">Last received</th>
            <th scope="col">Alerts</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => {
            const latest = patient.latest_measurements || {}
            return (
              <tr key={patient.patient_id}>
                <th scope="row">
                  <button className="rpm-patient-button" onClick={() => onSelect(patient.patient_id)}>
                    <span className="rpm-avatar">S</span>
                    <span>
                      <strong>{patient.patient_id}</strong>
                      <small>{patient.display_name} · SIMULATED</small>
                    </span>
                  </button>
                </th>
                {READING_TYPES.map(([type, , unit]) => {
                  const reading = latest[type]
                  const shown = displayReading(reading, unit)
                  return (
                    <td key={type}>
                      <div className="rpm-reading-cell">
                        <strong>{shown.value}</strong>{shown.unit && <small>{shown.unit}</small>}
                        <StatusBadge status={readingStatus(reading)} />
                      </div>
                    </td>
                  )
                })}
                <td>
                  <span className="rpm-time"><Clock3 size={14} />{formatTime(Object.values(latest).sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at))[0]?.received_at)}</span>
                </td>
                <td>
                  {patient.alert_ids?.length ? <span className="rpm-alert-count"><AlertTriangle size={14} />{patient.alert_ids.length} active</span> : <span className="rpm-clear">No active alerts</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PatientDetail({ patient, measurements, conditions, alerts, onClose }) {
  if (!patient) return null
  const patientMeasurements = measurements.filter((item) => item.patient_id === patient.patient_id)
  const patientAlerts = alerts.filter((alert) => alert.patient_id === patient.patient_id)
  return (
    <aside className="rpm-detail-panel" aria-label={`Details for ${patient.patient_id}`}>
      <div className="rpm-detail-heading">
        <div>
          <span className="rpm-eyebrow">PATIENT DETAIL · SIMULATED</span>
          <h2>{patient.patient_id}</h2>
          <p>{patient.display_name}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close patient details"><X size={18} /></button>
      </div>
      <div className="rpm-detail-summary">
        <strong>{patientMeasurements.length}</strong>
        <span>returned measurements</span>
        <strong>{patientAlerts.length}</strong>
        <span>active alerts</span>
      </div>
      {patientAlerts.length > 0 && (
        <section className="rpm-detail-section">
          <h3>Active alerts</h3>
          {patientAlerts.map((alert) => (
            <div className="rpm-alert-row" key={alert.alert_id}>
              <AlertTriangle size={16} />
              <div><strong>{alert.reason?.code || alert.category}</strong><small>{alert.severity} · {alert.status}</small></div>
            </div>
          ))}
        </section>
      )}
      {conditions.filter((condition) => condition.patient_id === patient.patient_id).length > 0 && (
        <section className="rpm-detail-section">
          <h3>Data quality</h3>
          {conditions.filter((condition) => condition.patient_id === patient.patient_id).map((condition) => (
            <div className="rpm-quality-row" key={condition.event_id}>
              <WifiOff size={15} /><span>{condition.reason || condition.outcome}</span><small>{formatTime(condition.measured_at || condition.received_at)}</small>
            </div>
          ))}
        </section>
      )}
      <section className="rpm-detail-section">
        <h3>Measurement history</h3>
        {patientMeasurements.length === 0 ? <p className="rpm-empty-inline">No measurements returned.</p> : (
          <div className="rpm-history-list">
            {[...patientMeasurements].sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at)).map((item) => (
              <div className="rpm-history-row" key={item.event_id}>
                <span><strong>{item.measurement_type}</strong><small>{formatTime(item.measured_at)}</small></span>
                <span><strong>{item.value} {item.unit}</strong><small>Received {formatTime(item.received_at)}</small></span>
                <StatusBadge status={readingStatus(item)} />
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="rpm-detail-note">Synthetic observations only. No clinical decision should be based on this prototype.</p>
    </aside>
  )
}

export default function RpmDashboard({ apiBaseUrl = API_BASE_URL }) {
  const [snapshot, setSnapshot] = React.useState(null)
  const [accessToken, setAccessToken] = React.useState(() => {
    try { return sessionStorage.getItem('pahaadcare-rpm-token') || '' } catch { return '' }
  })
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [authBusy, setAuthBusy] = React.useState(false)
  const [selectedPatientId, setSelectedPatientId] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [lastRefresh, setLastRefresh] = React.useState(null)
  const [actionKey, setActionKey] = React.useState('')

  const clearSession = React.useCallback(() => {
    try { sessionStorage.removeItem('pahaadcare-rpm-token') } catch {}
    setAccessToken('')
  }, [])

  const loadDashboard = React.useCallback(async (signal, explicitToken = accessToken) => {
    if (!explicitToken) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/demo/rpm-dashboard`, {
        signal,
        headers: { Authorization: `Bearer ${explicitToken}` },
      })
      if (response.status === 401) {
        clearSession()
        throw new Error('Your session has expired or been revoked. Please sign in again.')
      }
      if (response.status === 403) {
        throw new Error('Access denied: your identity does not have permission to view this monitoring census.')
      }
      if (!response.ok) throw new Error(`Backend request failed (${response.status})`)
      const nextSnapshot = await response.json()
      if (!nextSnapshot?.is_simulated || !Array.isArray(nextSnapshot.patients) || !Array.isArray(nextSnapshot.measurements) || !Array.isArray(nextSnapshot.alerts) || !Array.isArray(nextSnapshot.conditions)) {
        throw new Error('Backend returned an unsupported dashboard response')
      }
      setSnapshot(nextSnapshot)
      setError('')
      setLastRefresh(new Date())
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(requestError.message || 'Could not reach the RPM backend.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, apiBaseUrl, clearSession])

  React.useEffect(() => {
    if (!accessToken) {
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    loadDashboard(controller.signal)
    return () => controller.abort()
  }, [accessToken, loadDashboard])

  async function signIn(event) {
    event.preventDefault()
    setAuthBusy(true)
    setError('')
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error?.message || 'Sign-in failed.')
      try { sessionStorage.setItem('pahaadcare-rpm-token', payload.access_token) } catch {}
      setPassword('')
      setAccessToken(payload.access_token)
      setLastRefresh(null)
    } catch (requestError) {
      setError(requestError.message || 'Sign-in failed.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function signOut() {
    try {
      if (accessToken) {
        await fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {})
      }
    } finally {
      clearSession()
      setSnapshot(null)
      setError('')
      setSelectedPatientId(null)
    }
  }

  async function performAlertAction(alert) {
    const action = alert.status === 'open' ? 'acknowledge' : 'resolve'
    const key = `${alert.alert_id}:${action}`
    setActionKey(key)
    try {
      const body = action === 'acknowledge'
        ? { actor_id: 'demo-clinician' }
        : { actor_id: 'demo-clinician', resolution_code: 'demo_review_complete' }
      const response = await fetch(`${apiBaseUrl}/api/v1/alerts/${alert.alert_id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 401) {
        clearSession()
        throw new Error('Your session has expired or been revoked. Please sign in again.')
      }
      if (response.status === 403) {
        throw new Error('Access denied: you are not authorized to modify alerts for this patient.')
      }
      if (response.status === 409) {
        const errorDetail = payload?.error?.message || 'This alert is no longer actionable in its current state.'
        throw new Error(`Alert not actionable: ${errorDetail}`)
      }
      if (!response.ok) throw new Error(payload?.error?.message || `Alert action failed (${response.status})`)
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message || 'Could not update the alert.')
    } finally {
      setActionKey('')
    }
  }

  const patients = snapshot?.patients || []
  const selectedPatient = patients.find((patient) => patient.patient_id === selectedPatientId) || null
  const summary = snapshot?.summary || {}

  return (
    <section className="page-content rpm-dashboard" aria-labelledby="rpm-title">
      <div className="rpm-dashboard-header">
        <div>
          <span className="rpm-eyebrow">REMOTE PATIENT MONITORING · DEMO WORKSPACE</span>
          <h1 id="rpm-title">Clinician monitoring</h1>
          <p className="subheading">A focused view of synthetic readings, data quality, and demonstration alerts.</p>
        </div>
        <div className="rpm-header-actions">
          <span className="rpm-simulated-badge"><span />SIMULATED DATA</span>
          {accessToken && <button className="button button-secondary" onClick={() => loadDashboard()} disabled={loading}><RefreshCw size={16} className={loading ? 'rpm-spin' : ''} /> Refresh</button>}
        </div>
      </div>

      {!accessToken && (
        <form className="rpm-login-panel" onSubmit={signIn}>
          <div><span className="rpm-eyebrow">PROTECTED RPM WORKSPACE</span><h2>Sign in to monitoring</h2><p>Use the locally configured clinician account. No credentials are stored in the frontend.</p></div>
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          <button className="button button-primary" type="submit" disabled={authBusy}>{authBusy ? 'Signing in...' : 'Sign in'}</button>
          {error && <p className="rpm-login-error" role="alert">{error}</p>}
          <p className="rpm-login-note">Synthetic demo only. Configure credentials through backend environment variables.</p>
        </form>
      )}
      {error && (
        accessToken && <div className="rpm-error-banner" role="alert"><WifiOff size={18} /><div><strong>RPM backend unavailable</strong><span>{error} {snapshot ? 'Showing the last successful snapshot.' : 'No dashboard data has been loaded.'}</span></div></div>
      )}
      {loading && !snapshot && <div className="rpm-loading" role="status"><RefreshCw size={20} className="rpm-spin" /> Loading synthetic monitoring data...</div>}
      {!loading && !snapshot && !error && <div className="rpm-empty-state"><Activity size={22} /><h2>No monitoring data</h2><p>The backend returned an empty dashboard snapshot.</p></div>}

      {snapshot && (
        <>
          <div className="rpm-status-strip">
            <span><span className="rpm-live-dot" />Backend snapshot loaded</span>
            <span>Generated {formatTime(snapshot.generated_at)}</span>
            <span>Last refresh {formatTime(lastRefresh)}</span>
          </div>
          <div className="rpm-metrics-grid">
            <Metric icon={HeartPulse} label="Synthetic patients" value={summary.synthetic_patient_count ?? 0} tone="green" />
            <Metric icon={Activity} label="Returned measurements" value={summary.measurement_event_count ?? 0} tone="blue" />
            <Metric icon={AlertTriangle} label="Active demo alerts" value={summary.active_alert_count ?? 0} tone="amber" />
            <Metric icon={WifiOff} label="Missing / stale" value={`${summary.missing_condition_count ?? 0} / ${summary.stale_condition_count ?? 0}`} tone="rose" />
          </div>
          <div className="rpm-content-grid">
            <div className="rpm-main-column">
              <section className="rpm-section-panel">
                <div className="rpm-section-heading"><div><span className="rpm-eyebrow">PATIENT CENSUS</span><h2>Monitoring overview</h2></div><span className="rpm-section-count">{patients.length} synthetic patient{patients.length === 1 ? '' : 's'}</span></div>
                {patients.length ? <PatientTable patients={patients} onSelect={setSelectedPatientId} /> : <p className="rpm-empty-inline">No synthetic patients were returned.</p>}
              </section>
              <section className="rpm-section-panel">
                <div className="rpm-section-heading"><div><span className="rpm-eyebrow">ATTENTION QUEUE</span><h2>Active demonstration alerts</h2></div><span className="rpm-section-count">{snapshot.alerts.length}</span></div>
                {snapshot.alerts.length ? (
                  <div className="rpm-alert-list">
                    {snapshot.alerts.map((alert) => {
                      const event = snapshot.measurements.find((item) => item.event_id === alert.related_event_id)
                      const action = alert.status === 'open' ? 'Acknowledge' : alert.status === 'acknowledged' ? 'Resolve' : ''
                      const actionId = `${alert.alert_id}:${alert.status === 'open' ? 'acknowledge' : 'resolve'}`
                      return <div className="rpm-alert-card" key={alert.alert_id}><span className={`rpm-severity rpm-severity-${alert.severity}`}>{alert.severity}</span><div className="rpm-alert-main"><strong>{alert.reason?.code || alert.category}</strong><span>{alert.patient_id} · {event ? `${event.value} ${event.unit}` : 'No measurement attached'}</span><small>{formatTime(event?.measured_at || alert.created_at)} · {alert.status}</small></div><span className="rpm-alert-id">{alert.alert_id.slice(0, 8)}</span>{action && <button className="button button-secondary rpm-alert-action" onClick={() => performAlertAction(alert)} disabled={actionKey === actionId}>{actionKey === actionId ? 'Saving...' : action}</button>}</div>
                    })}
                  </div>
                ) : <p className="rpm-empty-inline">No active demonstration alerts returned.</p>}
                <p className="rpm-panel-footnote"><AlertTriangle size={14} /> Thresholds are software demonstration rules, not clinically validated guidance.</p>
              </section>
            </div>
            <section className="rpm-section-panel rpm-quality-panel">
              <div className="rpm-section-heading"><div><span className="rpm-eyebrow">DATA QUALITY</span><h2>Freshness watch</h2></div><Clock3 size={19} /></div>
              {snapshot.conditions.length ? snapshot.conditions.map((condition) => <div className="rpm-condition-card" key={condition.event_id}><span className={`rpm-condition-icon ${condition.outcome}`}><WifiOff size={16} /></span><div><strong>{condition.outcome === 'stale' ? 'Stale reading' : 'Missing measurement'}</strong><span>{condition.patient_id} · {condition.measurement_type}</span><small>{condition.reason} · {formatTime(condition.received_at)}</small></div></div>) : <p className="rpm-empty-inline">No missing or stale conditions returned.</p>}
              <div className="rpm-quality-note">A missing or stale status is a data-quality condition, not a normal vital reading.</div>
            </section>
          </div>
        </>
      )}
      {accessToken && <button className="rpm-signout" onClick={signOut}>Sign out of RPM workspace</button>}
      <PatientDetail patient={selectedPatient} measurements={snapshot?.measurements || []} conditions={snapshot?.conditions || []} alerts={snapshot?.alerts || []} onClose={() => setSelectedPatientId(null)} />
    </section>
  )
}
