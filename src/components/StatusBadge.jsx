import React from 'react'
import { CheckCircle2, Clock3, AlertCircle, Check, Wifi, WifiOff } from 'lucide-react'

/**
 * Reusable StatusBadge for monitoring metrics, connection states, and alert statuses.
 */
export default function StatusBadge({ status, label, tone, icon, className = '' }) {
  const resolvedTone =
    tone ||
    (() => {
      switch (status?.toLowerCase()) {
        case 'online':
        case 'received':
        case 'resolved':
        case 'normal':
          return 'green'
        case 'stale':
        case 'acknowledged':
        case 'pending':
        case 'warning':
          return 'amber'
        case 'offline':
        case 'missing':
        case 'open':
        case 'critical':
        case 'error':
          return 'rose'
        default:
          return 'neutral'
      }
    })()

  const defaultIcon = (() => {
    if (icon) return icon
    switch (resolvedTone) {
      case 'green':
        return status === 'online' ? <Wifi size={12} /> : <CheckCircle2 size={12} />
      case 'amber':
        return <Clock3 size={12} />
      case 'rose':
        return status === 'offline' ? <WifiOff size={12} /> : <AlertCircle size={12} />
      default:
        return null
    }
  })()

  const displayText = label || status || 'Unknown'

  return (
    <span
      className={`doc-badge doc-badge-${resolvedTone} ${className}`}
      role="status"
      aria-label={`Status: ${displayText}`}
    >
      {defaultIcon && <span className="doc-badge-icon" aria-hidden="true">{defaultIcon}</span>}
      <span className="doc-badge-label">{displayText}</span>
    </span>
  )
}
