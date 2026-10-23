import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DATA_QUALITY_STATUS,
  DEMO_FRESHNESS_CONFIG,
  formatObservationTime,
  formatIngestionTime,
  formatRelativeAge,
  formatStandardUnit,
  evaluateMeasurementQuality,
  detectTelemetryGaps,
  isSparseTelemetry,
} from '../src/dataQuality.js'

test('1. Data Quality Model defines all required clinical and sync states', () => {
  assert.equal(DATA_QUALITY_STATUS.CURRENT, 'current')
  assert.equal(DATA_QUALITY_STATUS.STALE, 'stale')
  assert.equal(DATA_QUALITY_STATUS.MISSING, 'missing')
  assert.equal(DATA_QUALITY_STATUS.SPARSE, 'sparse')
  assert.equal(DATA_QUALITY_STATUS.INVALID, 'invalid')
  assert.equal(DATA_QUALITY_STATUS.FUTURE, 'future')
  assert.equal(DATA_QUALITY_STATUS.PENDING, 'pending')
  assert.equal(DATA_QUALITY_STATUS.SYNCING, 'syncing')
  assert.equal(DATA_QUALITY_STATUS.DELIVERED, 'delivered')
  assert.equal(DATA_QUALITY_STATUS.CONFLICT, 'conflict')
  assert.equal(DATA_QUALITY_STATUS.FAILED, 'failed')
  assert.equal(DEMO_FRESHNESS_CONFIG.STALE_MINUTES, 15)
  assert.match(DEMO_FRESHNESS_CONFIG.DISCLAIMER, /Demonstration freshness rule/i)
})

test('2. Current measurements (<=15m) are evaluated honestly as current', () => {
  const baseTime = new Date('2026-10-23T03:00:00Z')
  const reading = {
    event_id: 'evt-curr-1',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 72,
    unit: 'bpm',
    measured_at: '2026-10-23T02:55:00Z', // 5m old
    received_at: '2026-10-23T02:55:05Z',
  }

  const quality = evaluateMeasurementQuality(reading, baseTime)
  assert.equal(quality.status, DATA_QUALITY_STATUS.CURRENT)
  assert.equal(quality.label, 'Current')
  assert.equal(quality.tone, 'received')
  assert.equal(quality.isCurrent, true)
  assert.equal(quality.isStale, false)
  assert.equal(quality.value, 72)
  assert.equal(quality.displayValue, '72')
  assert.equal(quality.isSynchronized, true)
})

test('3. Stale measurements (>15m) are flagged with demo freshness explanation', () => {
  const baseTime = new Date('2026-10-23T03:00:00Z')
  const reading = {
    event_id: 'evt-stale-1',
    patient_id: 'PC-TEST01',
    measurement_type: 'oxygen_saturation',
    value: 97,
    unit: '%',
    measured_at: '2026-10-23T02:30:00Z', // 30m old (> 15m demo threshold)
  }

  const quality = evaluateMeasurementQuality(reading, baseTime)
  assert.equal(quality.status, DATA_QUALITY_STATUS.STALE)
  assert.match(quality.label, /Stale/)
  assert.equal(quality.tone, 'stale')
  assert.equal(quality.isStale, true)
  assert.equal(quality.isCurrent, false)
  assert.match(quality.explanation, /15m/)
})

test('4. Missing measurements never fabricate values or substitute 0', () => {
  const baseTime = new Date('2026-10-23T03:00:00Z')

  // Case A: null reading object
  const nullQuality = evaluateMeasurementQuality(null, baseTime)
  assert.equal(nullQuality.status, DATA_QUALITY_STATUS.MISSING)
  assert.equal(nullQuality.value, null)
  assert.equal(nullQuality.displayValue, 'Missing')
  assert.notEqual(nullQuality.value, 0)

  // Case B: explicit missing outcome
  const explicitMissing = {
    event_id: 'evt-miss-1',
    patient_id: 'PC-TEST01',
    measurement_type: 'body_temperature',
    outcome: 'missing',
    value: null,
  }
  const missQuality = evaluateMeasurementQuality(explicitMissing, baseTime)
  assert.equal(missQuality.status, DATA_QUALITY_STATUS.MISSING)
  assert.equal(missQuality.value, null)
  assert.equal(missQuality.displayValue, 'Missing')
})

test('5. Invalid and rejected measurements preserve failure reason without clinical acceptance', () => {
  const baseTime = new Date('2026-10-23T03:00:00Z')
  const reading = {
    event_id: 'evt-rej-1',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 450, // Impossible physiological heart rate
    outcome: 'rejected',
    error: 'Heart rate 450 exceeds physiological ceiling (300 bpm)',
    measured_at: '2026-10-23T02:58:00Z',
  }

  const quality = evaluateMeasurementQuality(reading, baseTime)
  assert.equal(quality.status, DATA_QUALITY_STATUS.INVALID)
  assert.equal(quality.isRejected, true)
  assert.equal(quality.tone, 'critical')
  assert.match(quality.explanation, /450 exceeds physiological ceiling/)
})

test('6. Future-dated measurements are flagged honestly for clock drift', () => {
  const baseTime = new Date('2026-10-23T03:00:00Z')
  const reading = {
    event_id: 'evt-fut-1',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 80,
    measured_at: '2026-10-23T03:20:00Z', // 20m in future
  }

  const quality = evaluateMeasurementQuality(reading, baseTime)
  assert.equal(quality.status, DATA_QUALITY_STATUS.FUTURE)
  assert.equal(quality.label, 'Future Timestamp')
  assert.equal(quality.tone, 'amber')
  assert.match(quality.explanation, /clock drift/i)
})

test('7. Observation timestamp is kept distinct from server ingestion timestamp', () => {
  const measuredAt = '2026-10-23T01:15:00.000Z'
  const receivedAt = '2026-10-23T02:45:00.000Z'

  const formattedObs = formatObservationTime(measuredAt)
  const formattedIng = formatIngestionTime(receivedAt)
  const formattedDirect = formatIngestionTime(null)

  assert.notEqual(formattedObs, formattedIng)
  assert.equal(formattedDirect, 'Direct ingest / Pending confirmation')
})

test('8. Telemetry gap detection detects intervals exceeding threshold and breaks continuity', () => {
  const measurements = [
    { measured_at: '2026-10-23T00:00:00Z', value: 70 },
    { measured_at: '2026-10-23T00:15:00Z', value: 72 },
    // 3 hour gap here (> 60m threshold)
    { measured_at: '2026-10-23T03:15:00Z', value: 74 },
    { measured_at: '2026-10-23T03:30:00Z', value: 75 },
  ]

  const gaps = detectTelemetryGaps(measurements, 60)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].durationMinutes, 180)
  assert.equal(gaps[0].fromTime, '2026-10-23T00:15:00Z')
  assert.equal(gaps[0].toTime, '2026-10-23T03:15:00Z')
})

test('9. Sparse telemetry identifies patients with insufficient longitudinal data (<= 2 readings)', () => {
  assert.equal(isSparseTelemetry([]), true)
  assert.equal(isSparseTelemetry([{ value: 70 }]), true)
  assert.equal(isSparseTelemetry([{ value: 70 }, { value: 72 }]), true)
  assert.equal(isSparseTelemetry([{ value: 70 }, { value: 72 }, { value: 74 }]), false)
})
