import React from 'react'
import { AlertTriangle, Clock, FolderOpen, Loader2, ArrowLeft } from 'lucide-react'

/**
 * Accessible Loading state with spinner and live region.
 */
export function LoadingState({ message = 'Loading clinical data...', minHeight = '280px' }) {
  return (
    <div
      className="doc-state-container"
      style={{ minHeight }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="doc-spin-icon" size={28} />
      <p className="doc-state-message">{message}</p>
    </div>
  )
}

/**
 * Accessible Error state with optional retry.
 */
export function ErrorState({
  title = 'Failed to load monitoring data',
  message = 'An unexpected error occurred while communicating with the RPM service.',
  onRetry,
  minHeight = '280px',
}) {
  return (
    <div
      className="doc-state-container doc-state-error"
      style={{ minHeight }}
      role="alert"
      aria-live="assertive"
    >
      <div className="doc-state-icon-box error">
        <AlertTriangle size={28} />
      </div>
      <h3 className="doc-state-title">{title}</h3>
      <p className="doc-state-message">{message}</p>
      {onRetry && (
        <button
          type="button"
          className="button button-primary doc-retry-btn"
          onClick={onRetry}
        >
          Retry request
        </button>
      )}
    </div>
  )
}

/**
 * Accessible Empty state.
 */
export function EmptyState({
  icon: Icon = FolderOpen,
  title = 'No records found',
  message = 'There are no active records in this section.',
  action,
  minHeight = '240px',
}) {
  return (
    <div className="doc-state-container" style={{ minHeight }} role="region">
      <div className="doc-state-icon-box neutral">
        <Icon size={28} />
      </div>
      <h3 className="doc-state-title">{title}</h3>
      <p className="doc-state-message">{message}</p>
      {action && <div className="doc-state-action">{action}</div>}
    </div>
  )
}

/**
 * Clean, structured placeholder for routes scheduled in later refactor phases.
 * Clearly identifies section without fake patient data or dead-end buttons.
 */
export function PlaceholderPage({
  phaseNumber,
  sectionName,
  summary,
  upcomingFeatures = [],
  onBack,
}) {
  return (
    <div className="doc-placeholder-card" role="region" aria-labelledby="placeholder-heading">
      <div className="doc-placeholder-badge">
        <Clock size={14} />
        <span>SCHEDULED FOR PHASE {phaseNumber}</span>
      </div>
      <h2 id="placeholder-heading" className="doc-placeholder-title">
        {sectionName}
      </h2>
      <p className="doc-placeholder-summary">{summary}</p>

      {upcomingFeatures.length > 0 && (
        <div className="doc-placeholder-features">
          <h4>Planned in Phase {phaseNumber}:</h4>
          <ul>
            {upcomingFeatures.map((feat, idx) => (
              <li key={idx}>{feat}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="doc-placeholder-actions">
        {onBack ? (
          <button type="button" className="button button-secondary" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>Return to Integrated Overview</span>
          </button>
        ) : (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              window.location.hash = '#/doctor'
            }}
          >
            <ArrowLeft size={16} />
            <span>Return to Integrated Overview</span>
          </button>
        )}
      </div>
    </div>
  )
}
