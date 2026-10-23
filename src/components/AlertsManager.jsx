import React from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Bell,
  CheckCircle,
  Clock,
  Filter,
  Info,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react'
import StatusBadge from './StatusBadge.jsx'
import { LoadingState, ErrorState, EmptyState } from './PageState.jsx'
import { formatTime, formatAge } from '../RpmDashboard'
import {
  acknowledgeAlert,
  resolveAlert,
  fetchAlertEscalation,
  fetchEscalationPolicies,
  fetchEscalationWorkerStatus,
  triggerEscalationProcess,
} from '../rpmApi'

export default function AlertsManager({
  alerts = [],
  patients = [],
  loading = false,
  error = '',
  onRefresh,
  onNavigate,
  currentUser = null,
}) {
  // Search, filter, sort, pagination state
  const [searchQuery, setSearchQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [severityFilter, setSeverityFilter] = React.useState('all')
  const [categoryFilter, setCategoryFilter] = React.useState('all')
  const [escalationFilter, setEscalationFilter] = React.useState('all')
  const [sortBy, setSortBy] = React.useState('urgency')
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  // Expanded escalation history state
  const [expandedAlertId, setExpandedAlertId] = React.useState(null)
  const [escalationDetails, setEscalationDetails] = React.useState({})
  const [escalationLoading, setEscalationLoading] = React.useState(false)

  // Worker status and policies state
  const [workerStatus, setWorkerStatus] = React.useState(null)
  const [policies, setPolicies] = React.useState([])
  const [showPolicies, setShowPolicies] = React.useState(false)
  const [evaluatingEscalations, setEvaluatingEscalations] = React.useState(false)
  const [actionFeedback, setActionFeedback] = React.useState(null)

  // Acknowledge & Resolve dialog state
  const [ackModalAlert, setAckModalAlert] = React.useState(null)
  const [ackNote, setAckNote] = React.useState('')
  const [ackLoading, setAckLoading] = React.useState(false)
  const [ackError, setAckError] = React.useState('')

  const [resolveModalAlert, setResolveModalAlert] = React.useState(null)
  const [resolveCode, setResolveCode] = React.useState('clinical_review_complete')
  const [resolveNote, setResolveNote] = React.useState('')
  const [resolveLoading, setResolveLoading] = React.useState(false)
  const [resolveError, setResolveError] = React.useState('')

  // Load worker status and policies on mount
  React.useEffect(() => {
    let isMounted = true
    Promise.all([
      fetchEscalationWorkerStatus().catch(() => null),
      fetchEscalationPolicies().catch(() => ({ items: [] })),
    ]).then(([workerRes, policiesRes]) => {
      if (isMounted) {
        if (workerRes) setWorkerStatus(workerRes)
        if (policiesRes?.items) setPolicies(policiesRes.items)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  // Helper to load escalation state for a specific alert
  const handleToggleExpandEscalation = async (alertId) => {
    if (expandedAlertId === alertId) {
      setExpandedAlertId(null)
      return
    }

    setExpandedAlertId(alertId)
    if (!escalationDetails[alertId]) {
      setEscalationLoading(true)
      try {
        const escRes = await fetchAlertEscalation(alertId)
        setEscalationDetails((prev) => ({ ...prev, [alertId]: escRes }))
      } catch (err) {
        setEscalationDetails((prev) => ({
          ...prev,
          [alertId]: { error: err.message || 'Could not load escalation state.' },
        }))
      } finally {
        setEscalationLoading(false)
      }
    }
  }

  // Trigger manual escalation evaluation
  const handleTriggerEscalation = async () => {
    setEvaluatingEscalations(true)
    setActionFeedback(null)
    try {
      const res = await triggerEscalationProcess()
      const count = res?.processed_count || 0
      setActionFeedback({
        type: 'success',
        message: `Escalation engine evaluated. Processed ${count} due escalation event(s).`,
      })
      if (onRefresh) onRefresh()
      // Refresh worker status
      const updatedWorker = await fetchEscalationWorkerStatus().catch(() => null)
      if (updatedWorker) setWorkerStatus(updatedWorker)
    } catch (err) {
      setActionFeedback({
        type: 'danger',
        message: err.message || 'Failed to trigger escalation evaluation.',
      })
    } finally {
      setEvaluatingEscalations(false)
    }
  }

  // Acknowledge submission handler
  const handleConfirmAcknowledge = async () => {
    if (!ackModalAlert) return
    setAckLoading(true)
    setAckError('')
    try {
      await acknowledgeAlert(ackModalAlert.alert_id, {
        actorId: currentUser?.username || 'clinician',
        note: ackNote.trim() || 'Acknowledged in clinician triage queue',
      })
      setAckModalAlert(null)
      setAckNote('')
      if (onRefresh) onRefresh()
      setActionFeedback({
        type: 'success',
        message: `Alert ${ackModalAlert.alert_id.slice(0, 8)} successfully acknowledged. Escalation timer halted.`,
      })
    } catch (err) {
      setAckError(err.message || 'Failed to acknowledge alert.')
    } finally {
      setAckLoading(false)
    }
  }

  // Resolve submission handler
  const handleConfirmResolve = async () => {
    if (!resolveModalAlert) return
    setResolveLoading(true)
    setResolveError('')
    try {
      await resolveAlert(resolveModalAlert.alert_id, {
        actorId: currentUser?.username || 'clinician',
        resolutionCode: resolveCode,
        note: resolveNote.trim() || 'Resolved following clinical review',
      })
      setResolveModalAlert(null)
      setResolveNote('')
      if (onRefresh) onRefresh()
      setActionFeedback({
        type: 'success',
        message: `Alert ${resolveModalAlert.alert_id.slice(0, 8)} successfully resolved. Lifecycle closed.`,
      })
    } catch (err) {
      setResolveError(err.message || 'Failed to resolve alert.')
    } finally {
      setResolveLoading(false)
    }
  }

  // 1. Calculate Truthful Summary Totals across all alerts in clinician scope
  const now = new Date()
  const nowMs = now.getTime()

  const summary = React.useMemo(() => {
    let openCount = 0
    let ackCount = 0
    let overdueCount = 0
    let resolvedCount = 0

    for (const a of alerts) {
      if (a.status === 'open') {
        openCount++
        // Check if overdue (>15 mins open or escalation due passed)
        const createdMs = new Date(a.created_at).getTime()
        if (nowMs - createdMs > 15 * 60 * 1000) {
          overdueCount++
        }
      } else if (a.status === 'acknowledged') {
        ackCount++
      } else if (a.status === 'resolved') {
        resolvedCount++
      }
    }

    return {
      total: alerts.length,
      open: openCount,
      acknowledged: ackCount,
      overdue: overdueCount,
      resolved: resolvedCount,
    }
  }, [alerts, nowMs])

  // 2. Filter Alerts
  const filteredAlerts = React.useMemo(() => {
    return alerts.filter((a) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchesPatientId = a.patient_id?.toLowerCase().includes(q)
        const patientMatch = patients.find((p) => p.patient_id === a.patient_id)
        const matchesPatientName = patientMatch?.display_name?.toLowerCase().includes(q)
        const matchesReasonCode = a.reason?.code?.toLowerCase().includes(q)
        const matchesMessage = a.reason?.message?.toLowerCase().includes(q)
        const matchesSeverity = a.severity?.toLowerCase().includes(q)
        if (
          !matchesPatientId &&
          !matchesPatientName &&
          !matchesReasonCode &&
          !matchesMessage &&
          !matchesSeverity
        ) {
          return false
        }
      }

      // Lifecycle status filter
      if (statusFilter === 'open' && a.status !== 'open') return false
      if (statusFilter === 'acknowledged' && a.status !== 'acknowledged') return false
      if (statusFilter === 'resolved' && a.status !== 'resolved') return false
      if (statusFilter === 'overdue') {
        if (a.status !== 'open') return false
        const createdMs = new Date(a.created_at).getTime()
        if (nowMs - createdMs <= 15 * 60 * 1000) return false
      }

      // Severity filter
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false

      // Category filter
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false

      return true
    })
  }, [alerts, searchQuery, statusFilter, severityFilter, categoryFilter, patients, nowMs])

  // 3. Sort Alerts
  const sortedAlerts = React.useMemo(() => {
    const sevRank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
    return [...filteredAlerts].sort((a, b) => {
      if (sortBy === 'urgency') {
        // Overdue & Critical open alerts first
        const isAOpen = a.status === 'open'
        const isBOpen = b.status === 'open'
        if (isAOpen !== isBOpen) return isBOpen ? 1 : -1

        const rankA = sevRank[a.severity] || 0
        const rankB = sevRank[b.severity] || 0
        if (rankB !== rankA) return rankB - rankA

        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }

      if (sortBy === 'severity') {
        const rankA = sevRank[a.severity] || 0
        const rankB = sevRank[b.severity] || 0
        if (rankB !== rankA) return rankB - rankA
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }

      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }

      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }

      return 0
    })
  }, [filteredAlerts, sortBy])

  // 4. Pagination
  const totalPages = Math.max(1, Math.ceil(sortedAlerts.length / pageSize))
  const paginatedAlerts = sortedAlerts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const isFiltered =
    Boolean(searchQuery) ||
    statusFilter !== 'all' ||
    severityFilter !== 'all' ||
    categoryFilter !== 'all' ||
    escalationFilter !== 'all'

  return (
    <div className="doc-alerts-manager" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Action feedback message */}
      {actionFeedback && (
        <div
          className={`doc-banner doc-banner-${actionFeedback.type}`}
          role="status"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {actionFeedback.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit' }}
            onClick={() => setActionFeedback(null)}
            aria-label="Dismiss feedback"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 1. Summary Cards with Truthful Counts */}
      <div className="doc-directory-metrics-bar">
        <div className="doc-dir-metric-card" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('all')}>
          <span className="doc-dir-metric-label">Total In Scope</span>
          <strong className="doc-dir-metric-val">{summary.total}</strong>
          <span className="doc-dir-metric-sub">All registered alerts</span>
        </div>
        <div
          className="doc-dir-metric-card"
          style={{ cursor: 'pointer', borderColor: summary.open > 0 ? '#fecdd3' : 'var(--line)' }}
          onClick={() => setStatusFilter('open')}
        >
          <span className="doc-dir-metric-label">Open Alerts</span>
          <strong className="doc-dir-metric-val" style={{ color: summary.open > 0 ? '#e11d48' : '#059669' }}>
            {summary.open}
          </strong>
          <span className="doc-dir-metric-sub">Requiring clinician triage</span>
        </div>
        <div
          className="doc-dir-metric-card"
          style={{ cursor: 'pointer', borderColor: summary.overdue > 0 ? '#fed7aa' : 'var(--line)' }}
          onClick={() => setStatusFilter('overdue')}
        >
          <span className="doc-dir-metric-label">Overdue Alerts</span>
          <strong className="doc-dir-metric-val" style={{ color: summary.overdue > 0 ? '#c2410c' : '#64748b' }}>
            {summary.overdue}
          </strong>
          <span className="doc-dir-metric-sub">&gt;15m unacknowledged</span>
        </div>
        <div
          className="doc-dir-metric-card"
          style={{ cursor: 'pointer' }}
          onClick={() => setStatusFilter('acknowledged')}
        >
          <span className="doc-dir-metric-label">Acknowledged</span>
          <strong className="doc-dir-metric-val" style={{ color: '#0d9488' }}>
            {summary.acknowledged}
          </strong>
          <span className="doc-dir-metric-sub">Active in review</span>
        </div>
        <div
          className="doc-dir-metric-card"
          style={{ cursor: 'pointer' }}
          onClick={() => setStatusFilter('resolved')}
        >
          <span className="doc-dir-metric-label">Resolved</span>
          <strong className="doc-dir-metric-val" style={{ color: '#059669' }}>
            {summary.resolved}
          </strong>
          <span className="doc-dir-metric-sub">Completed lifecycle</span>
        </div>
      </div>

      {/* 2. Escalation Engine & Worker Operational Strip */}
      <div
        className="doc-patient-meta-banner"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={16} style={{ color: '#0d9488' }} />
            <strong style={{ fontSize: '13px', color: '#1e293b' }}>Escalation Worker:</strong>
            <span
              className={`doc-badge doc-badge-${
                workerStatus?.enabled && workerStatus?.is_running ? 'success' : 'neutral'
              }`}
            >
              {workerStatus?.enabled && workerStatus?.is_running
                ? `Active (${workerStatus.interval_seconds}s cycle)`
                : 'Standby / Manual'}
            </span>
          </div>
          {workerStatus?.last_run_at && (
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Last cycle: {formatTime(workerStatus.last_run_at)} ({workerStatus.run_count} runs)
            </span>
          )}
          <span className="doc-badge doc-badge-info" style={{ fontSize: '11px' }}>
            Simulated Notification Adapter
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="button button-secondary"
            style={{ fontSize: '12px', padding: '5px 10px' }}
            onClick={() => setShowPolicies((prev) => !prev)}
            aria-expanded={showPolicies}
          >
            {showPolicies ? 'Hide Escalation Policies' : 'View Escalation Policies'}
          </button>

          <button
            type="button"
            className="button button-primary"
            style={{ fontSize: '12px', padding: '5px 12px' }}
            onClick={handleTriggerEscalation}
            disabled={evaluatingEscalations}
            title="Immediately evaluate and dispatch due escalations via background worker"
          >
            <RefreshCw size={12} className={evaluatingEscalations ? 'doc-spin-icon' : ''} />
            <span>{evaluatingEscalations ? 'Evaluating...' : 'Evaluate Due Escalations'}</span>
          </button>
        </div>
      </div>

      {/* 3. Collapsible Multi-Tier Escalation Policies Ladder */}
      {showPolicies && (
        <div
          className="rpm-section-panel"
          style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '16px' }}
        >
          <div style={{ marginBottom: '10px' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '14.5px', color: '#1e293b' }}>
              Configured Multi-Tier Escalation Policies
            </h4>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
              Defines SLA escalation timelines from Level 1 (Frontline Community Health Worker) to Level 2 (Supervisor / Medical Officer).
            </p>
          </div>

          <div className="rpm-table-wrap" style={{ margin: 0 }}>
            <table className="rpm-table" style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th>Policy ID & Name</th>
                  <th>Category</th>
                  <th>Trigger Severity</th>
                  <th>Level 1 Role</th>
                  <th>Escalation Delay</th>
                  <th>Level 2 Role</th>
                  <th>Stop Criteria</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((pol) => (
                  <tr key={pol.policy_id}>
                    <td>
                      <strong>{pol.name}</strong>
                      <div style={{ fontSize: '10.5px', color: '#64748b' }}>{pol.policy_id}</div>
                    </td>
                    <td>{pol.category || 'All Categories'}</td>
                    <td>
                      <span className="doc-badge doc-badge-warning">{pol.min_severity?.toUpperCase()}</span>
                    </td>
                    <td>{pol.initial_target_role?.replace(/_/g, ' ')}</td>
                    <td>{Math.round(pol.escalation_delay_seconds / 60)} minutes</td>
                    <td>{pol.subsequent_target_role?.replace(/_/g, ' ')}</td>
                    <td>
                      <span style={{ fontSize: '11.5px', color: '#059669' }}>
                        {pol.stop_on_acknowledge ? '✓ On Acknowledge' : ''}
                        {pol.stop_on_resolve ? ' · ✓ On Resolve' : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Search, Filters, and Sorting Controls Bar */}
      <div className="rpm-table-controls-bar" role="search" aria-label="Filter clinical alerts queue">
        <div className="rpm-search-input-wrap">
          <Search size={15} style={{ color: '#64748b' }} aria-hidden="true" />
          <input
            type="text"
            className="rpm-search-input"
            placeholder="Search alerts by patient ID, name, or rule code..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            aria-label="Search alerts"
          />
          {searchQuery && (
            <button
              type="button"
              style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px', color: '#64748b' }}
              onClick={() => {
                setSearchQuery('')
                setCurrentPage(1)
              }}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="rpm-filter-group">
          {/* Status filter */}
          <select
            className="rpm-control-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            aria-label="Filter by lifecycle status"
          >
            <option value="all">All Lifecycle States ({summary.total})</option>
            <option value="open">Open Only ({summary.open})</option>
            <option value="overdue">Overdue (&gt;15m) ({summary.overdue})</option>
            <option value="acknowledged">Acknowledged ({summary.acknowledged})</option>
            <option value="resolved">Resolved ({summary.resolved})</option>
          </select>

          {/* Severity filter */}
          <select
            className="rpm-control-select"
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value)
              setCurrentPage(1)
            }}
            aria-label="Filter by alert severity"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical Severity</option>
            <option value="high">High Severity</option>
            <option value="medium">Medium Severity</option>
            <option value="low">Low Severity</option>
          </select>

          {/* Category filter */}
          <select
            className="rpm-control-select"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setCurrentPage(1)
            }}
            aria-label="Filter by alert category"
          >
            <option value="all">All Categories</option>
            <option value="abnormal_measurement">Abnormal Measurement</option>
            <option value="missing_measurement">Missing Measurement</option>
            <option value="stale_reading">Stale Telemetry</option>
          </select>

          {/* Sort order */}
          <select
            className="rpm-control-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort alerts"
          >
            <option value="urgency">Sort: Clinical Urgency</option>
            <option value="severity">Sort: Highest Severity First</option>
            <option value="newest">Sort: Created (Newest First)</option>
            <option value="oldest">Sort: Created (Oldest First)</option>
          </select>

          {isFiltered && (
            <button
              type="button"
              className="rpm-clear-filters-btn"
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('all')
                setSeverityFilter('all')
                setCategoryFilter('all')
                setEscalationFilter('all')
                setSortBy('urgency')
                setCurrentPage(1)
              }}
            >
              Clear Filters
            </button>
          )}
        </div>

        <span className="rpm-results-badge">
          Showing {sortedAlerts.length} of {alerts.length} alert{alerts.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* 5. Alerts List / Table */}
      {loading ? (
        <LoadingState message="Loading clinician alert queue..." />
      ) : error ? (
        <ErrorState title="Alert triage unavailable" message={error} onRetry={onRefresh} />
      ) : paginatedAlerts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {paginatedAlerts.map((alert) => {
            const isExpanded = expandedAlertId === alert.alert_id
            const esc = escalationDetails[alert.alert_id]
            const patient = patients.find((p) => p.patient_id === alert.patient_id)
            const createdMs = new Date(alert.created_at).getTime()
            const isOverdue = alert.status === 'open' && nowMs - createdMs > 15 * 60 * 1000

            return (
              <div
                key={alert.alert_id}
                className="rpm-alert-card"
                style={{
                  background: alert.status === 'open' ? '#fffbfb' : '#ffffff',
                  border: isOverdue ? '1.5px solid #f87171' : '1px solid var(--line)',
                  borderRadius: '10px',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <StatusBadge
                      status={alert.status?.toUpperCase()}
                      tone={
                        alert.status === 'resolved'
                          ? 'green'
                          : alert.status === 'acknowledged'
                          ? 'amber'
                          : 'rose'
                      }
                    />
                    <span
                      className={`doc-badge doc-badge-${
                        alert.severity === 'critical' ? 'critical' : alert.severity === 'high' ? 'warning' : 'info'
                      }`}
                    >
                      {alert.severity?.toUpperCase()} SEVERITY
                    </span>
                    {isOverdue && (
                      <span className="doc-badge doc-badge-critical" style={{ animation: 'pulse 2s infinite' }}>
                        OVERDUE (&gt;15M)
                      </span>
                    )}
                    <span className="doc-badge doc-badge-neutral">
                      {alert.category?.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} />
                    <span>Created {formatTime(alert.created_at)}</span>
                    <span>({formatAge(alert.created_at, now)})</span>
                  </div>
                </div>

                {/* Patient and Trigger Description */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '15.5px', color: 'var(--ink)' }}>
                      Patient {alert.patient_id}
                    </strong>
                    {patient?.display_name && (
                      <span style={{ color: '#475569', fontSize: '14px' }}>
                        ({patient.display_name})
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 6px', fontSize: '13.5px', color: '#334155' }}>
                    {alert.reason?.message || alert.category}
                  </p>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Trigger rule: <code>{alert.reason?.code || alert.category}</code> (version {alert.reason?.rule_version || '1.0'})
                  </div>
                </div>

                {/* Lifecycle metadata if acknowledged or resolved */}
                {(alert.acknowledgement || alert.resolution) && (
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {alert.acknowledgement && (
                      <div style={{ color: '#0d9488' }}>
                        ✓ Acknowledged at {formatTime(alert.acknowledgement.acknowledged_at)} by{' '}
                        <strong>{alert.acknowledgement.acknowledged_by}</strong>
                        {alert.acknowledgement.note && ` — "${alert.acknowledgement.note}"`}
                      </div>
                    )}
                    {alert.resolution && (
                      <div style={{ color: '#059669' }}>
                        ✓ Resolved at {formatTime(alert.resolution.resolved_at)} by{' '}
                        <strong>{alert.resolution.resolved_by}</strong> (Code: {alert.resolution.resolution_code})
                        {alert.resolution.note && ` — "${alert.resolution.note}"`}
                      </div>
                    )}
                  </div>
                )}

                {/* Escalation history expander button */}
                <div>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: '#0d9488',
                      fontWeight: 600,
                    }}
                    onClick={() => handleToggleExpandEscalation(alert.alert_id)}
                    aria-expanded={isExpanded}
                  >
                    <Zap size={13} />
                    <span>
                      {isExpanded
                        ? 'Hide Escalation & Notification Dispatch Ladder'
                        : 'Inspect Escalation Ladder & Mock Notifications'}
                    </span>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {/* Expanded Escalation State & Notifications */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '12px 14px',
                        background: '#f1f5f9',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      {escalationLoading && !esc ? (
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          Loading escalation telemetry...
                        </div>
                      ) : esc?.error ? (
                        <div style={{ fontSize: '12px', color: '#dc2626' }}>{esc.error}</div>
                      ) : esc ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                            <div>
                              <strong>Policy:</strong> {esc.policy_id} ·{' '}
                              <strong>Level:</strong> {esc.current_level} ·{' '}
                              <strong>Status:</strong>{' '}
                              <span className="doc-badge doc-badge-neutral">{esc.status}</span>
                            </div>
                            <div>
                              <strong>Attempts:</strong> {esc.attempts_count} ·{' '}
                              {esc.next_due_at ? (
                                <span>Next due: {formatTime(esc.next_due_at)}</span>
                              ) : (
                                <span style={{ color: '#059669' }}>Escalation timer stopped</span>
                              )}
                            </div>
                          </div>

                          {/* Mock notifications log */}
                          <div style={{ marginTop: '6px' }}>
                            <strong style={{ fontSize: '12px', color: '#334155' }}>
                              Simulated Dispatch History ({esc.notifications?.length || 0}):
                            </strong>
                            {esc.notifications && esc.notifications.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                {esc.notifications.map((notif) => (
                                  <div
                                    key={notif.notification_id}
                                    style={{
                                      background: '#ffffff',
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      border: '1px solid #e2e8f0',
                                      fontSize: '11.5px',
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                      <span>
                                        <strong>Level {notif.escalation_level} ({notif.recipient_role})</strong> · Target:{' '}
                                        <code>{notif.recipient_target}</code>
                                      </span>
                                      <span style={{ color: '#059669', fontWeight: 600 }}>
                                        {notif.delivery_status?.toUpperCase()}
                                      </span>
                                    </div>
                                    <p style={{ margin: '2px 0 0', color: '#475569' }}>
                                      {notif.message_body}
                                    </p>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', color: '#94a3b8', fontSize: '10.5px' }}>
                                      <span>Attempted: {formatTime(notif.attempted_at)}</span>
                                      <span className="doc-badge doc-badge-info" style={{ fontSize: '10px' }}>
                                        Simulated · No External Dispatch
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '12px' }}>
                                No mock notifications dispatched yet. Alert will escalate if unacknowledged when timer expires.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          No escalation rule registered for this alert.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer action buttons */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '10px',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => onNavigate && onNavigate(`/doctor/patients/${alert.patient_id}`)}
                  >
                    View Patient Telemetry →
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {alert.status === 'open' && (
                      <button
                        type="button"
                        className="button button-primary"
                        style={{ fontSize: '12.5px', padding: '6px 14px' }}
                        onClick={() => {
                          setAckModalAlert(alert)
                          setAckNote('')
                          setAckError('')
                        }}
                      >
                        Acknowledge Alert
                      </button>
                    )}
                    {(alert.status === 'open' || alert.status === 'acknowledged') && (
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ fontSize: '12.5px', padding: '6px 14px' }}
                        onClick={() => {
                          setResolveModalAlert(alert)
                          setResolveCode('clinical_review_complete')
                          setResolveNote('')
                          setResolveError('')
                        }}
                      >
                        Resolve Alert
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="doc-pagination-bar" style={{ marginTop: '10px' }}>
              <span className="doc-pagination-info">
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, sortedAlerts.length)} of {sortedAlerts.length} alert{sortedAlerts.length === 1 ? '' : 's'}
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
          )}
        </div>
      ) : (
        <EmptyState
          icon={CheckCircle}
          title="No alerts match current criteria"
          message={
            isFiltered
              ? 'No clinical alerts found matching your selected search query and filters.'
              : 'All authorized patients are currently within normal baseline parameters.'
          }
          action={
            isFiltered ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setSearchQuery('')
                  setStatusFilter('all')
                  setSeverityFilter('all')
                  setCategoryFilter('all')
                  setEscalationFilter('all')
                  setSortBy('urgency')
                  setCurrentPage(1)
                }}
              >
                Reset All Filters
              </button>
            ) : null
          }
        />
      )}

      {/* Acknowledge Alert Modal */}
      {ackModalAlert && (
        <div className="doc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ack-modal-title">
          <div className="doc-modal-box">
            <div className="doc-modal-header">
              <h3 id="ack-modal-title">Acknowledge Clinical Alert</h3>
              <button
                type="button"
                className="doc-modal-close"
                onClick={() => setAckModalAlert(null)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>
            <div className="doc-modal-body">
              <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#475569' }}>
                Acknowledging this alert accepts clinical monitoring responsibility for Patient{' '}
                <strong>{ackModalAlert.patient_id}</strong>. Automated escalation timers will be halted.
              </p>

              {ackError && (
                <div className="doc-banner doc-banner-danger" style={{ marginBottom: '10px' }}>
                  {ackError}
                </div>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', fontWeight: 600 }}>
                Clinician Triage Note (Optional):
                <textarea
                  className="doc-modal-textarea"
                  rows={3}
                  placeholder="e.g., Contacted health worker, patient vitals reassessed..."
                  value={ackNote}
                  onChange={(e) => setAckNote(e.target.value)}
                />
              </label>
            </div>
            <div className="doc-modal-footer">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setAckModalAlert(null)}
                disabled={ackLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleConfirmAcknowledge}
                disabled={ackLoading}
              >
                {ackLoading ? 'Acknowledging...' : 'Confirm Acknowledgment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Alert Modal */}
      {resolveModalAlert && (
        <div className="doc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="resolve-modal-title">
          <div className="doc-modal-box">
            <div className="doc-modal-header">
              <h3 id="resolve-modal-title">Resolve Clinical Alert</h3>
              <button
                type="button"
                className="doc-modal-close"
                onClick={() => setResolveModalAlert(null)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>
            <div className="doc-modal-body">
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#475569' }}>
                Resolving closes the active alert lifecycle for Patient{' '}
                <strong>{resolveModalAlert.patient_id}</strong>. Future threshold violations will generate fresh alert records.
              </p>

              {resolveError && (
                <div className="doc-banner doc-banner-danger" style={{ marginBottom: '10px' }}>
                  {resolveError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', fontWeight: 600 }}>
                  Resolution Clinical Code:
                  <select
                    className="rpm-control-select"
                    value={resolveCode}
                    onChange={(e) => setResolveCode(e.target.value)}
                  >
                    <option value="clinical_review_complete">Clinician Review Complete</option>
                    <option value="treatment_administered">Treatment / Medication Administered</option>
                    <option value="transferred_care">Transferred to Higher Facility</option>
                    <option value="false_positive_sensor">False Positive / Sensor Artifact</option>
                    <option value="resolved_spontaneously">Resolved Spontaneously</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', fontWeight: 600 }}>
                  Resolution Remarks & Follow-up (Optional):
                  <textarea
                    className="doc-modal-textarea"
                    rows={3}
                    placeholder="e.g., Oxygen saturation restored to 96% after oxygen concentrator adjustment..."
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="doc-modal-footer">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setResolveModalAlert(null)}
                disabled={resolveLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleConfirmResolve}
                disabled={resolveLoading}
              >
                {resolveLoading ? 'Resolving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
