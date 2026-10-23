import React from 'react'
import {
  DoctorLayout,
  PageHeader,
  StatusBadge,
  PatientTimeSeriesChart,
  AlertsManager,
  LoadingState,
  ErrorState,
  EmptyState,
  PlaceholderPage,
} from './components'
import RpmDashboard, {
  READING_TYPES,
  formatTime,
  formatUnit,
  formatMeasurementTypeName,
  readingStatus,
  formatAge,
} from './RpmDashboard'
import ClinicianLogin from './ClinicianLogin'
import {
  getStoredToken,
  getStoredUser,
  clearStoredToken,
  logoutClinician,
  fetchPatients,
  fetchPatientDetail,
  fetchPatientMeasurements,
  fetchAlerts,
  fetchMonitorOverview,
  acknowledgeAlert,
  resolveAlert,
  fetchDemoThresholds,
  createLivePatient,
  checkBackendHealth,
} from './rpmApi'
import { syncManager } from './syncManager'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  CheckCircle,
  Clock,
  Droplets,
  HeartPulse,
  Search,
  Thermometer,
  User,
  Users,
  ShieldCheck,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Filter,
  UserPlus,
  Database,
} from 'lucide-react'

/**
 * PahaadCare Phase 3: Doctor Workspace Shell
 *
 * Provides dedicated clinician shell layout, topbar breadcrumbs, sidebar navigation,
 * and functional routing across:
 * - /doctor — Integrated Overview
 * - /doctor/patients — Authorized Patient Directory
 * - /doctor/patients/:patientId — Individual RPM Dashboard
 * - /doctor/alerts — Alerts & Escalations Queue
 */
export default function DoctorWorkspace({
  currentRoute: propRoute,
  onNavigate,
  onLogout,
}) {
  const [token, setToken] = React.useState(() => getStoredToken())
  const [user, setUser] = React.useState(() => getStoredUser())

  // Route tracking
  const [route, setRoute] = React.useState(() => {
    if (propRoute) return propRoute
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    const clean = hash.replace(/^#\/?/, '').trim()
    return clean ? `/${clean}` : '/doctor'
  })

  // Synchronize route with window hash
  React.useEffect(() => {
    const handleHash = () => {
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      const clean = hash.replace(/^#\/?/, '').trim()
      setRoute(clean ? `/${clean}` : '/doctor')
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  // Sync state and durable queue telemetry
  const [syncState, setSyncState] = React.useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    lastSyncTime: null,
    queueSummary: { pending: 0, sending: 0, delivered: 0, conflict: 0, failed: 0, foreignPending: 0 },
    lastSyncError: null,
  })

  React.useEffect(() => {
    syncManager.init().catch(() => {})
    const unsubscribe = syncManager.subscribe((snapshot) => {
      setSyncState(snapshot)
    })
    return () => unsubscribe()
  }, [])


  // Data state for Directory and Alerts views
  const [patients, setPatients] = React.useState([])
  const [alerts, setAlerts] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [lastRefresh, setLastRefresh] = React.useState(null)

  // Directory Search, Filters, Sorting, and Pagination
  const [patientSearch, setPatientSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [severityFilter, setSeverityFilter] = React.useState('all')
  const [freshnessFilter, setFreshnessFilter] = React.useState('all')
  const [sortBy, setSortBy] = React.useState('urgency')
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  // Alert filter
  const [alertFilter, setAlertFilter] = React.useState('all')

  // Selected individual patient measurements, alerts, and access state
  const [individualMeasurements, setIndividualMeasurements] = React.useState([])
  const [individualPatient, setIndividualPatient] = React.useState(null)
  const [patientAlerts, setPatientAlerts] = React.useState([])
  const [demoThresholds, setDemoThresholds] = React.useState({})
  const [patientLastRefresh, setPatientLastRefresh] = React.useState(null)
  const [individualLoading, setIndividualLoading] = React.useState(false)
  const [individualError, setIndividualError] = React.useState('')
  const [accessDenied, setAccessDenied] = React.useState(false)
  const [notFound, setNotFound] = React.useState(false)

  // Chart state
  const [chartTimeRange, setChartTimeRange] = React.useState('24h')
  const [chartVital, setChartVital] = React.useState('heart_rate')

  // History table filtering, sorting, and pagination
  const [historyFilter, setHistoryFilter] = React.useState('all')
  const [historySort, setHistorySort] = React.useState('desc')
  const [historyPage, setHistoryPage] = React.useState(1)
  const [historyPageSize, setHistoryPageSize] = React.useState(10)

  // Patient alert triage actions
  const [alertActionLoading, setAlertActionLoading] = React.useState(null)
  const [alertActionError, setAlertActionError] = React.useState('')

  // Live Patient Registration Modal & Database Info
  const [isAddPatientOpen, setIsAddPatientOpen] = React.useState(false)
  const [addPatientLoading, setAddPatientLoading] = React.useState(false)
  const [addPatientError, setAddPatientError] = React.useState('')
  const [addPatientSuccess, setAddPatientSuccess] = React.useState('')
  const [backendInfo, setBackendInfo] = React.useState({ online: true, database: 'postgresql' })
  const [newPatientForm, setNewPatientForm] = React.useState({
    display_name: '',
    age: '',
    gender: 'Female',
    phone: '',
    village: '',
    district: '',
  })

  React.useEffect(() => {
    let isMounted = true
    checkBackendHealth()
      .then((res) => {
        if (!isMounted) return
        if (res.ok) {
          setBackendInfo({ online: true, database: res.data?.database || 'postgresql' })
        } else {
          setBackendInfo({ online: false, database: 'offline' })
        }
      })
      .catch(() => {
        if (isMounted) setBackendInfo({ online: false, database: 'offline' })
      })
    return () => {
      isMounted = false
    }
  }, [])

  const handleCreatePatientSubmit = async (e) => {
    if (e) e.preventDefault()
    setAddPatientError('')
    setAddPatientSuccess('')
    if (!newPatientForm.display_name.trim()) {
      setAddPatientError('Patient display name is required.')
      return
    }
    setAddPatientLoading(true)
    try {
      const payload = {
        display_name: newPatientForm.display_name.trim(),
        age: newPatientForm.age ? parseInt(newPatientForm.age, 10) : null,
        gender: newPatientForm.gender,
        phone: newPatientForm.phone.trim() || null,
        village: newPatientForm.village.trim() || null,
        district: newPatientForm.district.trim() || null,
        status: 'Active',
      }
      await createLivePatient(payload)
      setAddPatientSuccess('Patient registered into live database successfully!')
      setNewPatientForm({
        display_name: '',
        age: '',
        gender: 'Female',
        phone: '',
        village: '',
        district: '',
      })
      await loadWorkspaceData()
      setTimeout(() => {
        setIsAddPatientOpen(false)
        setAddPatientSuccess('')
      }, 1000)
    } catch (err) {
      setAddPatientError(err.message || 'Failed to create live patient record.')
    } finally {
      setAddPatientLoading(false)
    }
  }

  // Sign out handler
  const handleSignOut = React.useCallback(async () => {
    try {
      const currentToken = getStoredToken()
      if (currentToken) {
        await logoutClinician(currentToken)
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      clearStoredToken()
      try {
        sessionStorage.removeItem('pc-lang-selected')
      } catch {}
      setToken('')
      setUser(null)
      if (onLogout) onLogout()
      window.location.hash = '#/'
    }
  }, [onLogout])

  const handleNavigate = (path) => {
    const clean = path.startsWith('/') ? path : `/${path}`
    window.location.hash = `#${clean}`
    setRoute(clean)
    if (onNavigate) onNavigate(clean)
  }

  // Authoritative data fetch for Directory & Alerts
  const loadWorkspaceData = React.useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      // 1. Try authoritative monitor overview first to get full vital telemetry and freshness
      try {
        const overviewRes = await fetchMonitorOverview({
          onUnauthorized: () => {
            clearStoredToken()
            setToken('')
          },
        })
        if (overviewRes && Array.isArray(overviewRes.patients)) {
          setPatients(overviewRes.patients)
          setAlerts(overviewRes.alerts || [])
          setLastRefresh(new Date())
          return
        }
      } catch (overviewErr) {
        // Fallback to basic patients and alerts endpoints if overview endpoint fails
      }

      // 2. Fallback to basic patients list
      const [patientsRes, alertsRes] = await Promise.all([
        fetchPatients({
          onUnauthorized: () => {
            clearStoredToken()
            setToken('')
          },
        }),
        fetchAlerts({
          onUnauthorized: () => {
            clearStoredToken()
            setToken('')
          },
        }),
      ])
      setPatients(patientsRes?.items || [])
      setAlerts(alertsRes?.items || [])
      setLastRefresh(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load clinician workspace data.')
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    if (token) {
      loadWorkspaceData()
    }
  }, [token, loadWorkspaceData])

  const handleSyncNow = React.useCallback(async () => {
    try {
      await syncManager.syncNow({ force: true })
      await loadWorkspaceData()
    } catch {
      // Sync errors handled and tracked in syncManager snapshot
    }
  }, [loadWorkspaceData])

  // Individual patient measurements fetch with 401/403/404 handling and AbortController
  const patientIdMatch = route.match(/^\/doctor\/patients\/([a-zA-Z0-9_-]+)/)
  const activePatientId = patientIdMatch ? patientIdMatch[1] : null

  const loadPatientData = React.useCallback(async (signal) => {
    if (!activePatientId || !token) return
    setIndividualLoading(true)
    setIndividualError('')
    setAccessDenied(false)
    setNotFound(false)

    try {
      const [patientRes, measurementsRes, alertsRes, threshRes] = await Promise.all([
        fetchPatientDetail(activePatientId, {
          signal,
          onUnauthorized: () => {
            clearStoredToken()
            setToken('')
          },
        }).catch((err) => {
          if (err?.name === 'AbortError') throw err
          const msg = String(err?.message || '')
          if (msg.includes('403') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('forbidden')) {
            setAccessDenied(true)
          } else if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            setNotFound(true)
          }
          throw err
        }),
        fetchPatientMeasurements(activePatientId, {
          limit: 100,
          signal,
          onUnauthorized: () => {
            clearStoredToken()
            setToken('')
          },
        }).catch((err) => {
          if (err?.name === 'AbortError') throw err
          const msg = String(err?.message || '')
          if (msg.includes('403') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('forbidden')) {
            setAccessDenied(true)
          } else if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            setNotFound(true)
          }
          throw err
        }),
        fetchAlerts({
          patientId: activePatientId,
          limit: 50,
          signal,
          onUnauthorized: () => {
            clearStoredToken()
            setToken('')
          },
        }).catch((err) => {
          if (err?.name === 'AbortError') throw err
          return { items: [] }
        }),
        (!demoThresholds || Object.keys(demoThresholds).length === 0
          ? fetchDemoThresholds({ signal }).catch(() => null)
          : Promise.resolve(null)),
      ])

      setIndividualPatient(patientRes)
      setIndividualMeasurements(measurementsRes?.items || [])
      setPatientAlerts(alertsRes?.items || [])
      if (threshRes?.thresholds) {
        setDemoThresholds(threshRes.thresholds)
      }
      setPatientLastRefresh(new Date())
    } catch (err) {
      if (err?.name === 'AbortError') return
      setIndividualError(err?.message || `Could not load telemetry for patient ${activePatientId}.`)
    } finally {
      setIndividualLoading(false)
    }
  }, [activePatientId, token, demoThresholds])

  React.useEffect(() => {
    if (!activePatientId || !token) {
      setIndividualMeasurements([])
      setIndividualPatient(null)
      setPatientAlerts([])
      setAccessDenied(false)
      setNotFound(false)
      return
    }

    const controller = new AbortController()
    loadPatientData(controller.signal)
    return () => {
      controller.abort()
    }
  }, [activePatientId, token, loadPatientData])

  const handleAcknowledgePatientAlert = async (alertId) => {
    if (!alertId) return
    setAlertActionLoading(alertId)
    setAlertActionError('')
    try {
      await acknowledgeAlert(alertId, {
        actorId: user?.username || 'demo-clinician',
        note: 'Acknowledged via individual patient dashboard triage',
      })
      const alertsRes = await fetchAlerts({ patientId: activePatientId })
      setPatientAlerts(alertsRes?.items || [])
    } catch (err) {
      setAlertActionError(err?.message || 'Failed to acknowledge alert.')
    } finally {
      setAlertActionLoading(null)
    }
  }

  const handleResolvePatientAlert = async (alertId) => {
    if (!alertId) return
    setAlertActionLoading(alertId)
    setAlertActionError('')
    try {
      await resolveAlert(alertId, {
        actorId: user?.username || 'demo-clinician',
        resolutionCode: 'clinical_review_complete',
        note: 'Resolved via individual patient dashboard triage review',
      })
      const alertsRes = await fetchAlerts({ patientId: activePatientId })
      setPatientAlerts(alertsRes?.items || [])
    } catch (err) {
      setAlertActionError(err?.message || 'Failed to resolve alert.')
    } finally {
      setAlertActionLoading(null)
    }
  }


  // If unauthenticated: render dedicated ClinicianLogin gate with role guards
  // and one-click demo login option.
  if (!token) {
    return (
      <ClinicianLogin
        onLoginSuccess={() => {
          setToken(getStoredToken())
          setUser(getStoredUser())
        }}
        onGoToPatientPortal={() => {
          if (onNavigate) onNavigate('/patient')
          else if (typeof window !== 'undefined') window.location.hash = '#/patient'
        }}
      />
    )
  }

  // Filtered and Sorted patients for Directory view
  const filteredPatients = patients.filter((p) => {
    const q = patientSearch.trim().toLowerCase()
    if (q) {
      const matchesId = p.patient_id.toLowerCase().includes(q)
      const matchesName = p.display_name && p.display_name.toLowerCase().includes(q)
      if (!matchesId && !matchesName) return false
    }

    if (statusFilter !== 'all') {
      const pStatus = p.monitoring_status || 'normal'
      if (pStatus !== statusFilter) return false
    }

    if (severityFilter !== 'all') {
      const pSev = p.highest_severity || 'none'
      if (pSev !== severityFilter) return false
    }

    if (freshnessFilter !== 'all') {
      const pFresh = p.freshness_status || (p.has_stale_vitals ? 'stale' : p.has_missing_vitals ? 'missing' : 'recent')
      if (pFresh !== freshnessFilter) return false
    }

    return true
  })

  const sortedPatients = [...filteredPatients].sort((a, b) => {
    const sevRank = { critical: 4, high: 3, medium: 2, low: 1, none: 0 }
    if (sortBy === 'urgency') {
      const aRank = sevRank[a.highest_severity] || 0
      const bRank = sevRank[b.highest_severity] || 0
      if (bRank !== aRank) return bRank - aRank
      return (b.active_alerts_count || 0) - (a.active_alerts_count || 0)
    }
    if (sortBy === 'name') {
      return (a.display_name || '').localeCompare(b.display_name || '')
    }
    if (sortBy === 'id') {
      return a.patient_id.localeCompare(b.patient_id)
    }
    if (sortBy === 'freshness') {
      const freshRank = { missing: 3, stale: 2, recent: 1 }
      const aF = freshRank[a.freshness_status] || 1
      const bF = freshRank[b.freshness_status] || 1
      return bF - aF
    }
    if (sortBy === 'latest') {
      const aTime = a.latest_measurement_at ? new Date(a.latest_measurement_at).getTime() : 0
      const bTime = b.latest_measurement_at ? new Date(b.latest_measurement_at).getTime() : 0
      return bTime - aTime
    }
    return 0
  })

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(sortedPatients.length / pageSize))
  const paginatedPatients = sortedPatients.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // Filtered alerts for Alerts view
  const filteredAlerts = alerts.filter((a) => {
    if (alertFilter === 'active') return a.status === 'open' || a.status === 'acknowledged'
    if (alertFilter === 'open') return a.status === 'open'
    if (alertFilter === 'acknowledged') return a.status === 'acknowledged'
    if (alertFilter === 'resolved') return a.status === 'resolved'
    return true
  })

  // Render content based on active route
  const renderContent = () => {
    // View 1: Individual RPM Dashboard (/doctor/patients/:patientId)
    if (activePatientId) {
      if (accessDenied) {
        return (
          <section className="doc-individual-view" aria-labelledby="access-denied-heading">
            <div className="doc-access-denied-panel" role="alert">
              <div className="doc-access-denied-icon">
                <ShieldAlert size={30} />
              </div>
              <h2 id="access-denied-heading">Clinical Scope Access Denied</h2>
              <p>
                You are not authorized to view or monitor physiological telemetry for patient{' '}
                <strong>{activePatientId}</strong>. Access is strictly limited to clinicians
                assigned to this patient record.
              </p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => handleNavigate('/doctor/patients')}
              >
                ← Return to Authorized Patient Directory
              </button>
            </div>
          </section>
        )
      }

      if (notFound) {
        return (
          <section className="doc-individual-view" aria-labelledby="not-found-heading">
            <PageHeader
              eyebrow="PATIENT LOOKUP · 404 NOT FOUND"
              title={`Patient ${activePatientId} Not Found`}
              description="No active patient record was found matching this identifier."
              actions={
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => handleNavigate('/doctor/patients')}
                >
                  ← Back to Patient Directory
                </button>
              }
            />
            <EmptyState
              icon={User}
              title="Patient does not exist"
              message={`Patient ${activePatientId} could not be located in the Gramin 24*7 RPM registry.`}
              action={
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => handleNavigate('/doctor/patients')}
                >
                  Return to Patient Directory
                </button>
              }
            />
          </section>
        )
      }

      const directoryPatient = patients.find((p) => p.patient_id === activePatientId)
      const patientDisplayName =
        individualPatient?.display_name || directoryPatient?.display_name || activePatientId
      const assignedClinician =
        directoryPatient?.assigned_clinician_id ||
        directoryPatient?.assigned_clinician ||
        individualPatient?.assigned_clinician_id ||
        user?.username ||
        'Primary Care Team'

      // Calculate overall monitoring and data-quality status
      const activePatientAlerts = patientAlerts.filter(
        (a) => a.status === 'open' || a.status === 'acknowledged'
      )
      const hasCriticalAlert = activePatientAlerts.some((a) => a.severity === 'critical')
      const hasHighAlert = activePatientAlerts.some((a) => a.severity === 'high')
      const hasStaleVitals = READING_TYPES.some(([typeKey]) => {
        const latest = individualMeasurements.find((m) => m.measurement_type === typeKey)
        return readingStatus(latest).label === 'Stale'
      })
      const hasMissingVitals = READING_TYPES.some(([typeKey]) => {
        const latest = individualMeasurements.find((m) => m.measurement_type === typeKey)
        return !latest
      })

      let overallStatus = { label: 'Normal Monitoring', tone: 'green' }
      if (hasCriticalAlert) {
        overallStatus = { label: 'Critical Attention', tone: 'rose' }
      } else if (hasHighAlert || hasStaleVitals) {
        overallStatus = { label: 'Needs Review', tone: 'amber' }
      } else if (hasMissingVitals) {
        overallStatus = { label: 'Incomplete Telemetry', tone: 'neutral' }
      }

      // Filter and sort historical measurements for chronological table
      const filteredHistoryMeasurements = individualMeasurements.filter((m) => {
        if (historyFilter !== 'all' && m.measurement_type !== historyFilter) return false
        return true
      })
      const sortedHistoryMeasurements = [...filteredHistoryMeasurements].sort((a, b) => {
        const timeA = new Date(a.measured_at).getTime() || 0
        const timeB = new Date(b.measured_at).getTime() || 0
        return historySort === 'asc' ? timeA - timeB : timeB - timeA
      })
      const totalHistoryPages = Math.max(1, Math.ceil(sortedHistoryMeasurements.length / historyPageSize))
      const paginatedHistoryMeasurements = sortedHistoryMeasurements.slice(
        (historyPage - 1) * historyPageSize,
        historyPage * historyPageSize
      )

      return (
        <section className="doc-individual-view" aria-labelledby="patient-rpm-heading">
          <PageHeader
            eyebrow="INDIVIDUAL RPM · PATIENT TELEMETRY"
            title={`Patient Monitoring: ${activePatientId}`}
            description={`${patientDisplayName} · Longitudinal physiological telemetry and condition tracking`}
            actions={
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => loadPatientData()}
                  disabled={individualLoading}
                  title="Refresh latest telemetry measurements"
                >
                  <RefreshCw size={14} className={individualLoading ? 'doc-spin-icon' : ''} />
                  <span>{individualLoading ? 'Refreshing...' : 'Refresh Telemetry'}</span>
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => handleNavigate('/doctor/patients')}
                >
                  ← Back to Patient Directory
                </button>
              </div>
            }
          />

          {/* Patient Overview & Metadata Banner */}
          <div className="doc-patient-meta-banner">
            <div className="doc-meta-item">
              <span className="doc-meta-label">Patient ID:</span>
              <strong>{activePatientId}</strong>
            </div>
            <div className="doc-meta-item">
              <span className="doc-meta-label">Display Name:</span>
              <span>{patientDisplayName}</span>
            </div>
            <div className="doc-meta-item">
              <span className="doc-meta-label">Assigned Clinician:</span>
              <span>{assignedClinician}</span>
            </div>
            <div className="doc-meta-item">
              <span className="doc-meta-label">Last Refreshed:</span>
              <span>{patientLastRefresh ? formatTime(patientLastRefresh) : 'Just now'}</span>
            </div>
            <div className="doc-meta-item">
              <span className="doc-meta-label">Data Quality Status:</span>
              <StatusBadge status={overallStatus.label} tone={overallStatus.tone} />
            </div>
            <div className="doc-meta-item">
              <span className="doc-badge doc-badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={12} />
                SIMULATED DATA — DEMO ONLY
              </span>
            </div>
          </div>

          {individualLoading ? (
            <LoadingState message={`Fetching physiological telemetry for ${activePatientId}...`} />
          ) : individualError ? (
            <ErrorState
              title={`Unable to load telemetry for ${activePatientId}`}
              message={individualError}
              onRetry={() => loadPatientData()}
            />
          ) : (
            <div className="doc-individual-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 1. Summary Vital KPI Cards (5 vital types with independent freshness) */}
              <div className="rpm-metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                {READING_TYPES.map(([typeKey, typeLabel, defaultUnit, Icon]) => {
                  const latest = individualMeasurements.find((m) => m.measurement_type === typeKey)
                  const status = readingStatus(latest)
                  const hasValue = latest && latest.value !== null && latest.value !== undefined

                  return (
                    <div className="rpm-metric-card" key={typeKey}>
                      <div className="rpm-metric-top">
                        <span className="rpm-metric-label">{typeLabel}</span>
                        <div className="rpm-metric-icon" aria-hidden="true">
                          <Icon size={18} />
                        </div>
                      </div>
                      <div className="rpm-metric-value">
                        {hasValue ? latest.value : '—'}
                        <small>{latest ? formatUnit(latest.unit) : defaultUnit}</small>
                      </div>
                      <div className="rpm-metric-footer">
                        <StatusBadge
                          status={status.label}
                          tone={status.tone}
                        />
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {latest ? `${formatTime(latest.measured_at)} (${formatAge(latest.measured_at)})` : 'No reading recorded'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 2. Interactive Historical Time-Series Chart */}
              <PatientTimeSeriesChart
                measurements={individualMeasurements}
                alerts={patientAlerts}
                thresholds={demoThresholds}
                timeRange={chartTimeRange}
                onTimeRangeChange={setChartTimeRange}
                activeVital={chartVital}
                onVitalChange={setChartVital}
              />

              {/* 3. Patient-Specific Alerts & Escalation Triage */}
              <div className="rpm-section-panel">
                <div className="rpm-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span className="rpm-eyebrow">ALERT TRIAGE & ESCALATION LADDER</span>
                    <h3 style={{ margin: '4px 0 0', fontSize: '18px', color: '#1e293b' }}>
                      Patient Alert History ({patientAlerts.length})
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="doc-badge doc-badge-neutral" style={{ fontSize: '11px' }}>
                      Simulated Notification Dispatch
                    </span>
                  </div>
                </div>

                {alertActionError && (
                  <div className="doc-banner doc-banner-danger" role="alert" style={{ marginBottom: '14px' }}>
                    <AlertTriangle size={15} />
                    <span>{alertActionError}</span>
                  </div>
                )}

                {patientAlerts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {patientAlerts.map((alert) => {
                      const isActing = alertActionLoading === alert.alert_id
                      const hasEscalation = alert.escalation_level || (alert.escalations && alert.escalations.length > 0)
                      return (
                        <div
                          key={alert.alert_id}
                          className="rpm-alert-item-card"
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '14px 16px',
                            background: alert.status === 'open' ? '#fffbfb' : '#ffffff',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <StatusBadge
                                status={alert.status?.toUpperCase()}
                                tone={alert.status === 'resolved' ? 'green' : alert.status === 'acknowledged' ? 'amber' : 'rose'}
                              />
                              <span
                                className={`doc-badge doc-badge-${
                                  alert.severity === 'critical' ? 'critical' : alert.severity === 'high' ? 'warning' : 'info'
                                }`}
                              >
                                {alert.severity?.toUpperCase()} SEVERITY
                              </span>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                                {alert.reason?.message || alert.category?.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                              Triggered: {formatTime(alert.created_at)}
                            </span>
                          </div>

                          <div style={{ fontSize: '12.5px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div>
                              <strong>Rule Trigger:</strong> <code>{alert.reason?.code || alert.category}</code> (version {alert.reason?.rule_version || '1.0'})
                            </div>
                            {alert.acknowledgement && (
                              <div style={{ fontSize: '12px', color: '#0d9488' }}>
                                ✓ Acknowledged at {formatTime(alert.acknowledgement.acknowledged_at)} by {alert.acknowledgement.acknowledged_by}
                                {alert.acknowledgement.note ? ` — "${alert.acknowledgement.note}"` : ''}
                              </div>
                            )}
                            {alert.resolution && (
                              <div style={{ fontSize: '12px', color: '#059669' }}>
                                ✓ Resolved at {formatTime(alert.resolution.resolved_at)} by {alert.resolution.resolved_by} (Code: {alert.resolution.resolution_code})
                                {alert.resolution.note ? ` — "${alert.resolution.note}"` : ''}
                              </div>
                            )}
                            {hasEscalation && (
                              <div style={{ fontSize: '12px', color: '#b45309', background: '#fffbeb', padding: '4px 8px', borderRadius: '4px' }}>
                                ⚡ Escalation Level: {alert.escalation_level || '1'} (Automated Supervisor / CHW Dispatch)
                              </div>
                            )}
                          </div>

                          {/* Clinician Action Buttons */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                            {alert.status === 'open' && (
                              <button
                                type="button"
                                className="button button-primary"
                                style={{ fontSize: '12px', padding: '5px 12px' }}
                                disabled={isActing}
                                onClick={() => handleAcknowledgePatientAlert(alert.alert_id)}
                              >
                                {isActing ? 'Acknowledging...' : 'Acknowledge Alert'}
                              </button>
                            )}
                            {(alert.status === 'open' || alert.status === 'acknowledged') && (
                              <button
                                type="button"
                                className="button button-secondary"
                                style={{ fontSize: '12px', padding: '5px 12px' }}
                                disabled={isActing}
                                onClick={() => handleResolvePatientAlert(alert.alert_id)}
                              >
                                {isActing ? 'Resolving...' : 'Resolve Alert'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={CheckCircle}
                    title="No active or past alerts"
                    message={`No threshold breaches or missing data alerts have been recorded for patient ${activePatientId}.`}
                  />
                )}
              </div>

              {/* 4. Chronological Measurement History and Data Quality */}
              <div className="rpm-section-panel">
                <div className="rpm-section-heading">
                  <div>
                    <span className="rpm-eyebrow">CHRONOLOGICAL MEASUREMENT TELEMETRY</span>
                    <h3 style={{ margin: '4px 0 0', fontSize: '18px', color: '#1e293b' }}>
                      Observation History & Data Quality Audit ({sortedHistoryMeasurements.length})
                    </h3>
                  </div>
                </div>

                {/* Filtering and Sorting Bar */}
                <div className="rpm-history-filters">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '12.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Filter size={14} /> Vital Type:
                      <select
                        className="rpm-control-select"
                        value={historyFilter}
                        onChange={(e) => {
                          setHistoryFilter(e.target.value)
                          setHistoryPage(1)
                        }}
                        aria-label="Filter history by vital type"
                      >
                        <option value="all">All Vitals</option>
                        <option value="heart_rate">Heart Rate (bpm)</option>
                        <option value="oxygen_saturation">SpO₂ (%)</option>
                        <option value="body_temperature">Temperature (°C)</option>
                        <option value="systolic_blood_pressure">Systolic BP (mmHg)</option>
                        <option value="diastolic_blood_pressure">Diastolic BP (mmHg)</option>
                      </select>
                    </label>

                    <label style={{ fontSize: '12.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ArrowUpDown size={14} /> Sort Order:
                      <select
                        className="rpm-control-select"
                        value={historySort}
                        onChange={(e) => {
                          setHistorySort(e.target.value)
                          setHistoryPage(1)
                        }}
                        aria-label="Sort history by timestamp"
                      >
                        <option value="desc">Newest First</option>
                        <option value="asc">Oldest First</option>
                      </select>
                    </label>
                  </div>

                  <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                    Showing {paginatedHistoryMeasurements.length} of {sortedHistoryMeasurements.length} observation{sortedHistoryMeasurements.length === 1 ? '' : 's'}
                  </span>
                </div>

                {sortedHistoryMeasurements.length > 0 ? (
                  <>
                    <div className="rpm-table-wrap">
                      <table className="rpm-table" aria-label="Chronological physiological measurements table">
                        <thead>
                          <tr>
                            <th scope="col">Measurement Type</th>
                            <th scope="col">Recorded Value</th>
                            <th scope="col">Observation Timestamp</th>
                            <th scope="col">Received / Synced Timestamp</th>
                            <th scope="col">Data Quality / Freshness</th>
                            <th scope="col">Source / Device</th>
                            <th scope="col">Associated Alert Rule</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedHistoryMeasurements.map((m) => {
                            const status = readingStatus(m)
                            const matchingAlert = patientAlerts.find(
                              (a) => a.related_event_id === m.event_id || a.reason?.expected_measurement_type === m.measurement_type
                            )
                            const isDistinctSync = m.received_at && m.received_at !== m.measured_at

                            return (
                              <tr key={m.event_id} className="rpm-history-row">
                                <td>
                                  <strong>{formatMeasurementTypeName(m.measurement_type)}</strong>
                                </td>
                                <td>
                                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                                    {m.value}
                                  </span>{' '}
                                  <small style={{ color: '#64748b' }}>{formatUnit(m.unit)}</small>
                                </td>
                                <td>
                                  <div>{formatTime(m.measured_at)}</div>
                                  <small style={{ color: '#94a3b8', fontSize: '11px' }}>{formatAge(m.measured_at)}</small>
                                </td>
                                <td>
                                  {isDistinctSync ? (
                                    <div>
                                      <div>{formatTime(m.received_at)}</div>
                                      <small style={{ color: '#0d9488', fontSize: '10.5px' }}>Batch Synced</small>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                                      {m.received_at ? formatTime(m.received_at) : 'Direct ingest'}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <StatusBadge status={status.label} tone={status.tone} />
                                </td>
                                <td>
                                  <span className="doc-badge doc-badge-neutral">
                                    {m.source || 'patient'}
                                  </span>
                                  {m.device_reference?.device_id && (
                                    <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                                      ID: {m.device_reference.device_id}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {matchingAlert ? (
                                    <span
                                      className={`doc-badge doc-badge-${
                                        matchingAlert.severity === 'critical'
                                          ? 'critical'
                                          : matchingAlert.severity === 'high'
                                          ? 'warning'
                                          : 'info'
                                      }`}
                                      title={matchingAlert.reason?.message}
                                    >
                                      {matchingAlert.reason?.code || matchingAlert.category}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>
                                      Within demo bounds
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* History Pagination Bar */}
                    {totalHistoryPages > 1 && (
                      <div className="doc-pagination-bar" style={{ marginTop: '12px' }}>
                        <span className="doc-pagination-info">
                          Page {historyPage} of {totalHistoryPages}
                        </span>
                        <div className="doc-pagination-controls">
                          <button
                            type="button"
                            className="doc-page-btn"
                            disabled={historyPage <= 1}
                            onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                            aria-label="Previous history page"
                          >
                            <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} />
                          </button>
                          {Array.from({ length: totalHistoryPages }, (_, i) => i + 1).map((pageNum) => (
                            <button
                              key={pageNum}
                              type="button"
                              className={`doc-page-btn ${historyPage === pageNum ? 'active' : ''}`}
                              onClick={() => setHistoryPage(pageNum)}
                            >
                              {pageNum}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="doc-page-btn"
                            disabled={historyPage >= totalHistoryPages}
                            onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                            aria-label="Next history page"
                          >
                            <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    title="No measurements recorded"
                    message={
                      historyFilter === 'all'
                        ? `No telemetry observations have been recorded for patient ${activePatientId}.`
                        : `No ${formatMeasurementTypeName(historyFilter)} observations recorded.`
                    }
                  />
                )}
              </div>
            </div>
          )}
        </section>
      )

    }

    // View 2: Patient Directory (/doctor/patients)
    if (route === '/doctor/patients') {
      const reviewCount = patients.filter(
        (p) => p.monitoring_status === 'needs_review' || p.monitoring_status === 'critical_attention'
      ).length
      const normalCount = patients.filter((p) => p.monitoring_status === 'normal').length
      const activeAlertsCount = alerts.filter(
        (a) => a.status === 'open' || a.status === 'acknowledged'
      ).length

      const isFiltered =
        patientSearch ||
        statusFilter !== 'all' ||
        severityFilter !== 'all' ||
        freshnessFilter !== 'all'

      return (
        <section className="doc-directory-view" aria-labelledby="patient-directory-heading">
          <PageHeader
            eyebrow="PATIENT CENSUS · DIRECTORY"
            title="Authorized Patient Directory"
            description="All active patients authorized under your clinical remote monitoring assignment."
            actions={
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setIsAddPatientOpen(true)
                    setAddPatientError('')
                    setAddPatientSuccess('')
                  }}
                  title="Add new patient into live database"
                >
                  <UserPlus size={14} />
                  <span>+ Register Live Patient</span>
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={loadWorkspaceData}
                  disabled={loading}
                >
                  <RefreshCw size={14} className={loading ? 'doc-spin-icon' : ''} />
                  <span>{loading ? 'Refreshing...' : 'Refresh Directory'}</span>
                </button>
              </div>
            }
          />

          {/* Live Database Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '11.5px',
                fontWeight: '600',
                background: backendInfo.online ? '#ecfdf5' : '#fef2f2',
                color: backendInfo.online ? '#065f46' : '#991b1b',
                border: `1px solid ${backendInfo.online ? '#a7f3d0' : '#fecaca'}`,
              }}
            >
              <Database size={13} />
              {backendInfo.online
                ? `Live Telemetry Database: ${backendInfo.database.toUpperCase()} · Deployment Ready`
                : 'Offline Demo Fallback'}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '11.5px',
                fontWeight: '700',
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fcd34d',
              }}
            >
              <ShieldCheck size={13} />
              SIMULATED DATA — DEMO ONLY
            </span>
          </div>

          {/* Add Live Patient Modal */}
          {isAddPatientOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-patient-modal-title"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '20px',
              }}
            >
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '24px',
                  width: '100%',
                  maxWidth: '520px',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: '#ecfdf5', color: '#0d9488', padding: '10px', borderRadius: '10px' }}>
                      <UserPlus size={22} />
                    </div>
                    <div>
                      <h3 id="add-patient-modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                        Register Real Live Patient
                      </h3>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        Persists directly into the {backendInfo.database.toUpperCase()} database
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddPatientOpen(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
                    aria-label="Close modal"
                  >
                    <X size={20} />
                  </button>
                </div>

                {addPatientError && (
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px', marginBottom: '14px' }}>
                    {addPatientError}
                  </div>
                )}

                {addPatientSuccess && (
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: '13px', marginBottom: '14px' }}>
                    {addPatientSuccess}
                  </div>
                )}

                <form onSubmit={handleCreatePatientSubmit}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Patient Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Anand Rawat"
                        value={newPatientForm.display_name}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, display_name: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Age (Years)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        placeholder="e.g. 54"
                        value={newPatientForm.age}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, age: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Gender
                      </label>
                      <select
                        value={newPatientForm.gender}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, gender: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', boxSizing: 'border-box' }}
                      >
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        placeholder="10-digit mobile number"
                        value={newPatientForm.phone}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Village / Locality
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Almora Hills"
                        value={newPatientForm.village}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, village: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        District
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Almora"
                        value={newPatientForm.district}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, district: e.target.value })}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setIsAddPatientOpen(false)}
                      disabled={addPatientLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={addPatientLoading}
                    >
                      {addPatientLoading ? 'Registering...' : 'Register Patient'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Directory Summary Metrics Cards */}
          <div className="doc-directory-metrics-bar">
            <div className="doc-dir-metric-card">
              <span className="doc-dir-metric-label">Authorized Patients</span>
              <strong className="doc-dir-metric-val">{patients.length}</strong>
              <span className="doc-dir-metric-sub">In clinician scope</span>
            </div>
            <div className="doc-dir-metric-card">
              <span className="doc-dir-metric-label">Requiring Review</span>
              <strong className="doc-dir-metric-val" style={{ color: reviewCount > 0 ? '#b45309' : '#059669' }}>
                {reviewCount}
              </strong>
              <span className="doc-dir-metric-sub">Urgent alerts or data gaps</span>
            </div>
            <div className="doc-dir-metric-card">
              <span className="doc-dir-metric-label">Normal Monitoring</span>
              <strong className="doc-dir-metric-val" style={{ color: '#059669' }}>
                {normalCount}
              </strong>
              <span className="doc-dir-metric-sub">Stable telemetry</span>
            </div>
            <div className="doc-dir-metric-card">
              <span className="doc-dir-metric-label">Active Clinical Alerts</span>
              <strong className="doc-dir-metric-val" style={{ color: activeAlertsCount > 0 ? '#e11d48' : '#64748b' }}>
                {activeAlertsCount}
              </strong>
              <span className="doc-dir-metric-sub">Open or acknowledged</span>
            </div>
          </div>

          {/* Search, Filters, and Sorting Bar */}
          <div className="rpm-table-controls-bar" role="search" aria-label="Filter patient directory">
            <div className="rpm-search-input-wrap">
              <Search size={15} style={{ color: '#64748b' }} aria-hidden="true" />
              <input
                type="text"
                className="rpm-search-input"
                placeholder="Search authorized patients by ID or name..."
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value)
                  setCurrentPage(1)
                }}
                aria-label="Search patients by identifier or name"
              />
              {patientSearch && (
                <button
                  type="button"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', color: '#64748b' }}
                  onClick={() => {
                    setPatientSearch('')
                    setCurrentPage(1)
                  }}
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
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                aria-label="Filter by monitoring status"
              >
                <option value="all">All Monitoring Statuses</option>
                <option value="critical_attention">Critical Attention</option>
                <option value="needs_review">Needs Review</option>
                <option value="normal">Normal Monitoring</option>
              </select>

              <select
                className="rpm-control-select"
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value)
                  setCurrentPage(1)
                }}
                aria-label="Filter by alert severity"
              >
                <option value="all">All Alert Severities</option>
                <option value="critical">Critical Severity</option>
                <option value="high">High Severity</option>
                <option value="medium">Medium Severity</option>
                <option value="low">Low Severity</option>
                <option value="none">Clear (No Active Alerts)</option>
              </select>

              <select
                className="rpm-control-select"
                value={freshnessFilter}
                onChange={(e) => {
                  setFreshnessFilter(e.target.value)
                  setCurrentPage(1)
                }}
                aria-label="Filter by data freshness"
              >
                <option value="all">All Freshness States</option>
                <option value="recent">Current Telemetry (≤15m)</option>
                <option value="stale">Stale Telemetry (&gt;15m)</option>
                <option value="missing">Missing Measurements</option>
              </select>

              <select
                className="rpm-control-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort patients"
              >
                <option value="urgency">Sort: Clinical Urgency</option>
                <option value="name">Sort: Patient Name (A-Z)</option>
                <option value="id">Sort: Patient ID</option>
                <option value="freshness">Sort: Data Freshness</option>
                <option value="latest">Sort: Latest Measurement Time</option>
              </select>

              {isFiltered && (
                <button
                  type="button"
                  className="rpm-clear-filters-btn"
                  onClick={() => {
                    setPatientSearch('')
                    setStatusFilter('all')
                    setSeverityFilter('all')
                    setFreshnessFilter('all')
                    setSortBy('urgency')
                    setCurrentPage(1)
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            <span className="rpm-results-badge">
              Showing {sortedPatients.length} of {patients.length} patient{patients.length === 1 ? '' : 's'}
            </span>
          </div>

          {loading ? (
            <LoadingState message="Loading authorized patient census..." />
          ) : error ? (
            <ErrorState title="Directory unavailable" message={error} onRetry={loadWorkspaceData} />
          ) : sortedPatients.length > 0 ? (
            <div className="rpm-section-panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="rpm-table-wrap" style={{ margin: 0 }}>
                <table className="rpm-table" aria-label="Authorized Patients Directory Table">
                  <thead>
                    <tr>
                      <th scope="col">Patient</th>
                      <th scope="col">Assigned Care Team</th>
                      <th scope="col">Heart Rate</th>
                      <th scope="col">SpO₂</th>
                      <th scope="col">Temp</th>
                      <th scope="col">Systolic BP</th>
                      <th scope="col">Diastolic BP</th>
                      <th scope="col">Freshness / Last Update</th>
                      <th scope="col">Active Alerts</th>
                      <th scope="col">Monitoring Status</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPatients.map((p) => {
                      const vitals = p.latest_measurements || {}
                      const hr = vitals.heart_rate
                      const spo2 = vitals.oxygen_saturation
                      const temp = vitals.body_temperature
                      const sys = vitals.systolic_blood_pressure
                      const dia = vitals.diastolic_blood_pressure

                      const latestTime = p.latest_measurement_at
                      const freshness = p.freshness_status || 'recent'
                      const alertCount = p.active_alerts_count || 0
                      const highestSev = p.highest_severity || 'none'
                      const monStatus = p.monitoring_status || 'normal'

                      const renderVital = (m, unit) => {
                        if (!m || m.value === null || m.value === undefined) {
                          return (
                            <div className="rpm-vital-cell-box">
                              <span className="rpm-vital-missing">Missing</span>
                              <div className="rpm-vital-meta-row">
                                <StatusBadge status="Missing" tone="rose" />
                              </div>
                            </div>
                          )
                        }
                        const age = formatAge(m.measured_at, new Date())
                        const tone = m.freshness === 'stale' ? 'amber' : 'green'
                        const label = m.freshness === 'stale' ? 'Stale' : 'Recent'
                        return (
                          <div className="rpm-vital-cell-box">
                            <div className="rpm-vital-value-row">
                              <strong>{m.value}</strong>
                              <small>{m.unit || unit}</small>
                            </div>
                            <div className="rpm-vital-meta-row">
                              <StatusBadge status={label} tone={tone} />
                              {age && <span>{age}</span>}
                            </div>
                          </div>
                        )
                      }

                      return (
                        <tr key={p.patient_id}>
                          <th scope="row">
                            <button
                              type="button"
                              className="rpm-patient-button"
                              onClick={() => handleNavigate(`/doctor/patients/${p.patient_id}`)}
                              title={`View patient ${p.patient_id}`}
                            >
                              <span className="rpm-avatar">
                                {p.patient_id.slice(3, 4) || 'P'}
                              </span>
                              <span>
                                <strong>{p.patient_id}</strong>
                                <small>{p.display_name || 'Patient'} · SIMULATED</small>
                              </span>
                            </button>
                          </th>
                          <td>
                            <span className="doc-badge doc-badge-neutral">
                              <ShieldCheck size={11} />
                              <span>{user?.username ? `Dr. ${user.username}` : 'Clinical RPM Team'}</span>
                            </span>
                          </td>
                          <td>{renderVital(hr, 'bpm')}</td>
                          <td>{renderVital(spo2, '%')}</td>
                          <td>{renderVital(temp, '°C')}</td>
                          <td>{renderVital(sys, 'mmHg')}</td>
                          <td>{renderVital(dia, 'mmHg')}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <span
                                className={`doc-badge doc-badge-${
                                  freshness === 'recent'
                                    ? 'green'
                                    : freshness === 'stale'
                                    ? 'amber'
                                    : 'rose'
                                }`}
                              >
                                {freshness.toUpperCase()}
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={11} />
                                {formatTime(latestTime)}
                              </span>
                            </div>
                          </td>
                          <td>
                            {alertCount > 0 ? (
                              <span className="rpm-alert-count">
                                <AlertTriangle size={14} />
                                {alertCount} active
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
                                monStatus === 'critical_attention'
                                  ? 'rose'
                                  : monStatus === 'needs_review'
                                  ? 'amber'
                                  : 'green'
                              }`}
                            >
                              {monStatus === 'critical_attention'
                                ? 'Critical Attention'
                                : monStatus === 'needs_review'
                                ? 'Needs Review'
                                : 'Normal'}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="rpm-open-patient-btn"
                              onClick={() => handleNavigate(`/doctor/patients/${p.patient_id}`)}
                              title={`Open individual RPM page for ${p.patient_id}`}
                            >
                              <span>Open RPM</span>
                              <span>→</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              <div className="doc-pagination-bar">
                <span className="doc-pagination-info">
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, sortedPatients.length)} of {sortedPatients.length}{' '}
                  patients
                </span>
                <div className="doc-pagination-controls">
                  <label style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Per page:
                    <select
                      className="doc-page-size-select"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setCurrentPage(1)
                      }}
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="doc-page-btn"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      className={`doc-page-btn ${currentPage === pageNum ? 'active' : ''}`}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="doc-page-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="No patients match your search or filters"
              message={`No authorized patients found matching your current filter criteria.`}
              action={
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setPatientSearch('')
                    setStatusFilter('all')
                    setSeverityFilter('all')
                    setFreshnessFilter('all')
                    setSortBy('urgency')
                    setCurrentPage(1)
                  }}
                >
                  Reset all filters
                </button>
              }
            />
          )}
        </section>
      )
    }

    // View 3: Alerts & Escalations (/doctor/alerts)
    if (route === '/doctor/alerts') {
      return (
        <section className="doc-alerts-view" aria-labelledby="alerts-heading">
          <PageHeader
            eyebrow="ALERT MANAGEMENT · ESCALATION LADDER"
            title="Clinical Alerts & Escalation Queue"
            description="Centralized triage queue for abnormal threshold violations, missing telemetry, and automated multi-tier escalation."
            actions={
              <button
                type="button"
                className="button button-secondary"
                onClick={loadWorkspaceData}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'doc-spin-icon' : ''} />
                <span>{loading ? 'Refreshing...' : 'Refresh Alerts'}</span>
              </button>
            }
          />

          <div style={{ marginBottom: '16px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '11.5px',
                fontWeight: '700',
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fcd34d',
              }}
            >
              <ShieldCheck size={13} />
              SIMULATED DATA — DEMO ONLY
            </span>
          </div>

          <AlertsManager
            alerts={alerts}
            patients={patients}
            loading={loading}
            error={error}
            onRefresh={loadWorkspaceData}
            onNavigate={handleNavigate}
            currentUser={user}
          />
        </section>
      )
    }

    // View 4: Integrated Overview (/doctor)
    // Preserves 100% of the tested Milestone 1-6 integration (KPI tiles, snapshot banner,
    // active demo alerts, offline sync bar, queue simulator, patient census table,
    // and slideout detail panel).
    return <RpmDashboard onNavigate={handleNavigate} />
  }

  return (
    <DoctorLayout
      currentRoute={route}
      user={user}
      isOnline={syncState.isOnline}
      syncState={syncState}
      onSyncNow={handleSyncNow}
      lastRefresh={lastRefresh}
      onRefresh={loadWorkspaceData}
      refreshing={loading}
      onSignOut={handleSignOut}
      onNavigate={handleNavigate}
    >
      {renderContent()}
    </DoctorLayout>
  )
}
