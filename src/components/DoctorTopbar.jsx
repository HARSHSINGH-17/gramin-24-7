import React from 'react'
import {
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  User,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Database,
  X,
} from 'lucide-react'

/**
 * DoctorTopbar provides breadcrumb navigation, live connection/sync indicators,
 * durable offline queue inspection modal, and authenticated clinician profile information.
 */
export default function DoctorTopbar({
  currentRoute = '/doctor',
  user,
  isOnline = true,
  syncState = null,
  onSyncNow = null,
  lastRefresh = null,
  onRefresh,
  refreshing = false,
  onSignOut,
}) {
  const [showSyncModal, setShowSyncModal] = React.useState(false)
  const [syncingNow, setSyncingNow] = React.useState(false)

  // Compute breadcrumb items
  const breadcrumbs = React.useMemo(() => {
    const items = [{ label: 'Doctor Workspace', path: '/doctor' }]

    if (currentRoute === '/doctor' || currentRoute === '' || currentRoute === '/') {
      items.push({ label: 'Integrated Overview', path: '/doctor' })
    } else if (currentRoute.startsWith('/doctor/patients/')) {
      const patientId = currentRoute.replace('/doctor/patients/', '').split('/')[0]
      items.push({ label: 'Patient Directory', path: '/doctor/patients' })
      items.push({ label: patientId, path: currentRoute })
    } else if (currentRoute === '/doctor/patients') {
      items.push({ label: 'Patient Directory', path: '/doctor/patients' })
    } else if (currentRoute === '/doctor/alerts') {
      items.push({ label: 'Alerts & Escalations', path: '/doctor/alerts' })
    } else {
      items.push({ label: 'Overview', path: '/doctor' })
    }

    return items
  }, [currentRoute])

  const formatRefreshTime = (date) => {
    if (!date) return 'Not yet loaded'
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return 'Just now'
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const formatTimestamp = (date) => {
    if (!date) return 'None recorded'
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return 'Invalid date'
    return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })
  }

  const handleManualSync = async () => {
    if (!onSyncNow || syncingNow) return
    setSyncingNow(true)
    try {
      await onSyncNow()
    } finally {
      setSyncingNow(false)
    }
  }

  const pendingCount = syncState?.queueSummary?.pending || 0
  const sendingCount = syncState?.queueSummary?.sending || 0
  const deliveredCount = syncState?.queueSummary?.delivered || 0
  const conflictCount = syncState?.queueSummary?.conflict || 0
  const failedCount = syncState?.queueSummary?.failed || 0
  const foreignCount = syncState?.queueSummary?.foreignPending || 0
  const isSyncActive = Boolean(syncState?.isSyncing || syncingNow)

  return (
    <header className="doc-topbar" role="banner">
      {/* Breadcrumb Navigation */}
      <nav className="doc-breadcrumbs" aria-label="Breadcrumb">
        <ol className="doc-breadcrumb-list">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1
            return (
              <li key={crumb.path + idx} className="doc-breadcrumb-item">
                {isLast ? (
                  <span className="doc-breadcrumb-current" aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="doc-breadcrumb-link"
                      onClick={() => {
                        window.location.hash = '#' + crumb.path
                      }}
                    >
                      {crumb.label}
                    </button>
                    <ChevronRight size={14} className="doc-breadcrumb-sep" aria-hidden="true" />
                  </>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Right-aligned Status & Actions */}
      <div className="doc-topbar-actions">
        {/* Simulated data badge */}
        <span className="doc-badge doc-badge-simulated" title="Demonstration Mode: Synthetic Data Active">
          <span className="doc-pulsing-dot" aria-hidden="true" />
          <span>SIMULATED DATA — DEMO ONLY</span>
        </span>

        {/* Truthful Network & Sync Status indicator button */}
        <button
          type="button"
          className={`doc-net-indicator ${isOnline ? 'online' : 'offline'}`}
          style={{ cursor: 'pointer', border: '1px solid', padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          onClick={() => setShowSyncModal(true)}
          role="status"
          aria-label={isOnline ? 'Online: Click to inspect offline sync queue' : 'Offline: Click to inspect offline sync queue'}
          title="Click to view durable IndexedDB queue, conflict states, and server delivery confirmation."
        >
          {isSyncActive ? (
            <RefreshCw size={13} className="doc-spin-icon" aria-hidden="true" />
          ) : isOnline ? (
            <Wifi size={13} aria-hidden="true" />
          ) : (
            <WifiOff size={13} aria-hidden="true" />
          )}
          <span>
            {isSyncActive
              ? 'SYNCING...'
              : pendingCount > 0
              ? `${isOnline ? 'ONLINE' : 'OFFLINE'} · ${pendingCount} QUEUED`
              : conflictCount > 0 || failedCount > 0
              ? `${isOnline ? 'ONLINE' : 'OFFLINE'} · ATTENTION (${conflictCount + failedCount})`
              : isOnline
              ? 'ONLINE'
              : 'OFFLINE'}
          </span>
        </button>

        {/* Refresh button with status */}
        {onRefresh && (
          <button
            type="button"
            className="button button-secondary doc-topbar-btn"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh clinical dashboard data"
            title={`Last updated: ${formatRefreshTime(lastRefresh)}`}
          >
            <RefreshCw size={14} className={refreshing ? 'doc-spin-icon' : ''} aria-hidden="true" />
            <span className="doc-refresh-text">{refreshing ? 'Updating...' : 'Refresh'}</span>
          </button>
        )}

        {/* Clinician Pill */}
        {user && (
          <div className="doc-topbar-user" title={`Logged in as ${user.username} (${user.role})`}>
            <div className="doc-topbar-avatar" aria-hidden="true">
              <User size={13} />
            </div>
            <span className="doc-topbar-username">{user.username || 'Clinician'}</span>
            <span className="doc-topbar-role">{user.role?.toUpperCase() || 'CLINICIAN'}</span>
          </div>
        )}

        {/* Sign Out / Back Action */}
        {user ? (
          onSignOut && (
            <button
              type="button"
              className="button button-secondary doc-topbar-signout"
              onClick={onSignOut}
              aria-label="Sign out of clinician workspace"
            >
              Sign out
            </button>
          )
        ) : (
          <button
            type="button"
            className="button button-secondary doc-topbar-signout"
            onClick={() => {
              window.location.hash = '#/'
            }}
            aria-label="Back to role selection"
          >
            ← Back to Roles
          </button>
        )}
      </div>

      {/* Durable Offline Queue & Synchronization Inspector Modal */}
      {showSyncModal && (
        <div
          className="doc-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sync-modal-title"
          onClick={() => setShowSyncModal(false)}
        >
          <div
            className="doc-modal-box"
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="doc-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} style={{ color: '#0d9488' }} />
                <h3 id="sync-modal-title" style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                  Offline Queue & Synchronization Lifecycle
                </h3>
              </div>
              <button
                type="button"
                className="doc-modal-close"
                onClick={() => setShowSyncModal(false)}
                aria-label="Close sync modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="doc-modal-body">
              {/* Honest Delivery Disclaimer */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '12.5px',
                  color: '#475569',
                  lineHeight: '1.5',
                }}
              >
                <strong style={{ color: '#0f172a' }}>Delivery Confirmation Policy: </strong>
                Network connectivity does not imply confirmed delivery. Observations created offline remain
                durably stored in client-side IndexedDB until the backend server confirms receipt with HTTP 200/202.
              </div>

              {/* Status Breakdown Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '10px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                    Pending in Queue
                  </span>
                  <strong style={{ fontSize: '20px', color: pendingCount > 0 ? '#b45309' : '#0f172a' }}>
                    {pendingCount}
                  </strong>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>IndexedDB durable</span>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                    In Flight (Syncing)
                  </span>
                  <strong style={{ fontSize: '20px', color: sendingCount > 0 ? '#2563eb' : '#0f172a' }}>
                    {sendingCount}
                  </strong>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>Single-flight guarded</span>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                    Server Confirmed
                  </span>
                  <strong style={{ fontSize: '20px', color: '#059669' }}>
                    {deliveredCount}
                  </strong>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>Idempotent delivery</span>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                    Conflicts Quarantined
                  </span>
                  <strong style={{ fontSize: '20px', color: conflictCount > 0 ? '#e11d48' : '#0f172a' }}>
                    {conflictCount}
                  </strong>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>Mismatched payload</span>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                    Permanent Failures
                  </span>
                  <strong style={{ fontSize: '20px', color: failedCount > 0 ? '#e11d48' : '#0f172a' }}>
                    {failedCount}
                  </strong>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>Halted retry loop</span>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                    Other User Account
                  </span>
                  <strong style={{ fontSize: '20px', color: '#64748b' }}>
                    {foreignCount}
                  </strong>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>Account isolated</span>
                </div>
              </div>

              {/* Error Banner if any */}
              {syncState?.lastSyncError && (
                <div
                  style={{
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: '#e11d48',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <AlertTriangle size={14} />
                  <span>{syncState.lastSyncError}</span>
                </div>
              )}

              {/* Metadata Details List */}
              <div style={{ fontSize: '12.5px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Active Connection Status:</span>
                  <strong>{isOnline ? 'Online (Network reachable)' : 'Offline (No internet connectivity)'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>User Account Isolation:</span>
                  <strong>Bound to {user?.username || 'Current Session'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Last Successful Synchronization:</span>
                  <span>{formatTimestamp(syncState?.lastSyncTime)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: '#64748b' }}>Retry Backoff Policy:</span>
                  <span>Exponential with jitter (Max 30s)</span>
                </div>
              </div>
            </div>

            <div className="doc-modal-footer">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowSyncModal(false)}
              >
                Close
              </button>
              {onSyncNow && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleManualSync}
                  disabled={isSyncActive || (!isOnline && pendingCount === 0)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={14} className={isSyncActive ? 'doc-spin-icon' : ''} />
                  <span>{isSyncActive ? 'Synchronizing Batch...' : 'Synchronize Now'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

