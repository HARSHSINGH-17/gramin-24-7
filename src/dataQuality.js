/**
 * PahaadCare Remote Patient Monitoring (RPM)
 * Data Quality, Freshness, and Telemetry Evaluation Model
 *
 * Single authoritative source of truth for:
 * - Measurement quality & lifecycle states
 * - Demonstrator freshness rules (<= 15 minutes = current, > 15 minutes = stale)
 * - Distinction between Observation Timestamp (measured_at) and Ingestion Timestamp (received_at)
 * - Safe timestamp handling (future dates, invalid dates, clock discrepancies)
 * - Sparse history and telemetry gap detection
 * - Honest presentation (never substituting missing readings with 0)
 *
 * NOTE: Freshness windows are software demonstration rules for hackathon simulation,
 * NOT clinically validated diagnostic thresholds.
 */

export const DATA_QUALITY_STATUS = {
  CURRENT: 'current',
  STALE: 'stale',
  MISSING: 'missing',
  SPARSE: 'sparse',
  INVALID: 'invalid',
  FUTURE: 'future',
  PENDING: 'pending',
  SYNCING: 'syncing',
  DELIVERED: 'delivered',
  CONFLICT: 'conflict',
  FAILED: 'failed',
}

export const DEMO_FRESHNESS_CONFIG = {
  STALE_MINUTES: 15, // Demonstrator software threshold, not clinical guidance
  SPARSE_OBSERVATION_COUNT: 2,
  GAP_THRESHOLD_MINUTES: 60,
  DISCLAIMER: 'Demonstration freshness rule (15m window); synthetic simulation only, not clinical advice.',
}

/**
 * Format observation timestamp to user's local timezone
 */
export function formatObservationTime(value) {
  if (!value) return 'No observation timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid timestamp'
  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Format server ingestion or batch synchronization timestamp
 */
export function formatIngestionTime(value) {
  if (!value) return 'Direct ingest / Pending confirmation'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid timestamp'
  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Format relative elapsed age of an observation timestamp
 */
export function formatRelativeAge(value, now = new Date()) {
  if (!value) return 'No timestamp'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'

  const diffMs = now.getTime() - date.getTime()
  if (diffMs < -60000) {
    // Measurement is in the future
    const aheadMin = Math.round(Math.abs(diffMs) / 60000)
    return `+${aheadMin}m ahead (clock drift)`
  }

  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))
  if (diffMinutes === 0) return '<1m ago'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const hours = Math.floor(diffMinutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Format clinical unit code to standard display unit
 */
export function formatStandardUnit(unit) {
  if (!unit) return ''
  switch (unit) {
    case 'beats_per_minute':
    case 'bpm':
      return 'bpm'
    case 'percent':
    case '%':
      return '%'
    case 'celsius':
    case '°C':
      return '°C'
    case 'mmHg':
      return 'mmHg'
    default:
      return unit
  }
}

/**
 * Evaluate measurement quality and freshness state
 * Single authoritative calculation for vitals across Overview, Directory, and Patient Detail.
 */
export function evaluateMeasurementQuality(reading, now = new Date()) {
  // 1. Missing or unrecorded observation
  if (!reading || reading.value === null || reading.value === undefined || reading.outcome === 'missing') {
    return {
      status: DATA_QUALITY_STATUS.MISSING,
      label: 'Missing',
      tone: 'missing',
      badgeTone: 'missing',
      value: null,
      displayValue: 'Missing',
      explanation: 'No observation recorded for this vital window.',
      observationTime: null,
      observationAge: 'No data',
      isCurrent: false,
      isStale: false,
      isMissing: true,
      isRejected: false,
      isSynchronized: false,
    }
  }

  // 2. Explicitly invalid or rejected measurement
  if (
    reading.outcome === 'rejected' ||
    reading.is_valid === false ||
    reading.status === 'failed' ||
    reading.status === 'rejected'
  ) {
    return {
      status: DATA_QUALITY_STATUS.INVALID,
      label: 'Invalid / Rejected',
      tone: 'critical',
      badgeTone: 'rose',
      value: reading.value,
      displayValue: String(reading.value),
      explanation: reading.error || 'Measurement failed clinical physiological bounds validation.',
      observationTime: reading.measured_at ? formatObservationTime(reading.measured_at) : null,
      observationAge: reading.measured_at ? formatRelativeAge(reading.measured_at, now) : '',
      isCurrent: false,
      isStale: false,
      isMissing: false,
      isRejected: true,
      isSynchronized: Boolean(reading.received_at),
    }
  }

  // 3. Offline pending or syncing
  if (reading.status === 'pending' || reading.queue_status === 'pending') {
    return {
      status: DATA_QUALITY_STATUS.PENDING,
      label: 'Offline Queued',
      tone: 'neutral',
      badgeTone: 'neutral',
      value: reading.value,
      displayValue: String(reading.value),
      explanation: 'Stored in durable browser IndexedDB; pending network synchronization.',
      observationTime: formatObservationTime(reading.measured_at),
      observationAge: formatRelativeAge(reading.measured_at, now),
      isCurrent: false,
      isStale: false,
      isMissing: false,
      isRejected: false,
      isSynchronized: false,
    }
  }

  // 4. Conflicting event
  if (reading.status === 'conflict' || reading.queue_status === 'conflict') {
    return {
      status: DATA_QUALITY_STATUS.CONFLICT,
      label: 'Sync Conflict',
      tone: 'critical',
      badgeTone: 'rose',
      value: reading.value,
      displayValue: String(reading.value),
      explanation: 'Event ID exists on server with conflicting payload. Quarantined.',
      observationTime: formatObservationTime(reading.measured_at),
      observationAge: formatRelativeAge(reading.measured_at, now),
      isCurrent: false,
      isStale: false,
      isMissing: false,
      isRejected: false,
      isSynchronized: false,
    }
  }

  // 5. Evaluate observation timestamp freshness
  let isFuture = false
  let isStale = false

  if (reading.outcome === 'stale' || reading.freshness === 'stale') {
    isStale = true
  } else if (reading.measured_at) {
    const measuredDate = new Date(reading.measured_at)
    if (!Number.isNaN(measuredDate.getTime())) {
      const diffMs = now.getTime() - measuredDate.getTime()
      if (diffMs < -60000) {
        // More than 1 minute into the future
        isFuture = true
      } else {
        const ageMinutes = diffMs / (1000 * 60)
        if (ageMinutes > DEMO_FRESHNESS_CONFIG.STALE_MINUTES) {
          isStale = true
        }
      }
    }
  }

  if (isFuture) {
    return {
      status: DATA_QUALITY_STATUS.FUTURE,
      label: 'Future Timestamp',
      tone: 'amber',
      badgeTone: 'amber',
      value: reading.value,
      displayValue: String(reading.value),
      explanation: 'Observation timestamp is ahead of server clock; potential client clock drift.',
      observationTime: formatObservationTime(reading.measured_at),
      observationAge: formatRelativeAge(reading.measured_at, now),
      isCurrent: false,
      isStale: false,
      isMissing: false,
      isRejected: false,
      isSynchronized: Boolean(reading.received_at),
    }
  }

  if (isStale) {
    return {
      status: DATA_QUALITY_STATUS.STALE,
      label: 'Stale (>15m)',
      tone: 'stale',
      badgeTone: 'amber',
      value: reading.value,
      displayValue: String(reading.value),
      explanation: `Observation is older than the demo freshness threshold (${DEMO_FRESHNESS_CONFIG.STALE_MINUTES}m).`,
      observationTime: formatObservationTime(reading.measured_at),
      observationAge: formatRelativeAge(reading.measured_at, now),
      isCurrent: false,
      isStale: true,
      isMissing: false,
      isRejected: false,
      isSynchronized: Boolean(reading.received_at),
    }
  }

  // 6. Current and valid
  return {
    status: DATA_QUALITY_STATUS.CURRENT,
    label: 'Current',
    tone: 'received',
    badgeTone: 'green',
    value: reading.value,
    displayValue: String(reading.value),
    explanation: 'Observation is within active demonstration freshness window (≤15m).',
    observationTime: formatObservationTime(reading.measured_at),
    observationAge: formatRelativeAge(reading.measured_at, now),
    isCurrent: true,
    isStale: false,
    isMissing: false,
    isRejected: false,
    isSynchronized: Boolean(reading.received_at),
  }
}

/**
 * Detect significant observation gaps in chronological time-series observations
 */
export function detectTelemetryGaps(measurements = [], maxGapMinutes = DEMO_FRESHNESS_CONFIG.GAP_THRESHOLD_MINUTES) {
  if (!measurements || measurements.length <= 1) return []

  const sorted = [...measurements].sort((a, b) => {
    const tA = new Date(a.measured_at).getTime() || 0
    const tB = new Date(b.measured_at).getTime() || 0
    return tA - tB
  })

  const gaps = []
  for (let i = 1; i < sorted.length; i++) {
    const prevTime = new Date(sorted[i - 1].measured_at).getTime()
    const currTime = new Date(sorted[i].measured_at).getTime()
    if (!Number.isNaN(prevTime) && !Number.isNaN(currTime)) {
      const gapMin = (currTime - prevTime) / 60000
      if (gapMin > maxGapMinutes) {
        gaps.push({
          startIndex: i - 1,
          endIndex: i,
          fromTime: sorted[i - 1].measured_at,
          toTime: sorted[i].measured_at,
          durationMinutes: Math.round(gapMin),
        })
      }
    }
  }
  return gaps
}

/**
 * Determine if patient's vital telemetry history is sparse (<= 2 readings)
 */
export function isSparseTelemetry(measurements = []) {
  return !measurements || measurements.length <= DEMO_FRESHNESS_CONFIG.SPARSE_OBSERVATION_COUNT
}
