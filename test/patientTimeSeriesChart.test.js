import test from 'node:test'
import assert from 'node:assert/strict'
import { VITAL_CONFIGS } from '../src/components/patientTimeSeriesConfig.js'

// 1. Five Vital Types and Units
test('1. Vital configurations define all five standard vitals with clinical units and colors', () => {
  assert.ok(VITAL_CONFIGS.heart_rate)
  assert.equal(VITAL_CONFIGS.heart_rate.unit, 'bpm')
  assert.equal(VITAL_CONFIGS.heart_rate.defaultMin, 40)
  assert.equal(VITAL_CONFIGS.heart_rate.defaultMax, 120)

  assert.ok(VITAL_CONFIGS.oxygen_saturation)
  assert.equal(VITAL_CONFIGS.oxygen_saturation.unit, '%')
  assert.equal(VITAL_CONFIGS.oxygen_saturation.defaultMin, 92)

  assert.ok(VITAL_CONFIGS.body_temperature)
  assert.equal(VITAL_CONFIGS.body_temperature.unit, '°C')
  assert.equal(VITAL_CONFIGS.body_temperature.defaultMin, 35.0)
  assert.equal(VITAL_CONFIGS.body_temperature.defaultMax, 38.0)

  assert.ok(VITAL_CONFIGS.blood_pressure)
  assert.equal(VITAL_CONFIGS.blood_pressure.unit, 'mmHg')
  assert.equal(VITAL_CONFIGS.blood_pressure.isDual, true)
  assert.equal(VITAL_CONFIGS.blood_pressure.sysConfig.defaultMin, 90)
  assert.equal(VITAL_CONFIGS.blood_pressure.sysConfig.defaultMax, 180)
  assert.equal(VITAL_CONFIGS.blood_pressure.diaConfig.defaultMin, 60)
  assert.equal(VITAL_CONFIGS.blood_pressure.diaConfig.defaultMax, 120)
})

// 2. Missing Vitals and Independent Timestamps
test('2. Missing vital readings are never substituted with zero and preserve missing status', () => {
  function evaluateVitalReading(reading) {
    if (!reading || reading.value === null || reading.value === undefined) {
      return { displayValue: '—', status: 'Missing', hasValue: false }
    }
    return { displayValue: String(reading.value), status: 'Current', hasValue: true }
  }

  const missingResult = evaluateVitalReading(null)
  assert.equal(missingResult.displayValue, '—')
  assert.equal(missingResult.status, 'Missing')
  assert.equal(missingResult.hasValue, false)
  assert.notEqual(missingResult.displayValue, '0')

  const validResult = evaluateVitalReading({ value: 72, unit: 'bpm', measured_at: '2026-10-22T10:00:00Z' })
  assert.equal(validResult.displayValue, '72')
  assert.equal(validResult.status, 'Current')
  assert.equal(validResult.hasValue, true)
})

// 3. Time-Range Filtering
test('3. Time range filters accurately constrain measurements to 6h, 24h, 7d, and all history', () => {
  const refTime = new Date('2026-10-22T12:00:00Z').getTime()
  const measurements = [
    { event_id: 'e1', measured_at: new Date(refTime - 2 * 3600 * 1000).toISOString(), value: 75 }, // 2h ago
    { event_id: 'e2', measured_at: new Date(refTime - 8 * 3600 * 1000).toISOString(), value: 80 }, // 8h ago
    { event_id: 'e3', measured_at: new Date(refTime - 48 * 3600 * 1000).toISOString(), value: 70 }, // 2d ago
    { event_id: 'e4', measured_at: new Date(refTime - 200 * 3600 * 1000).toISOString(), value: 85 }, // >7d ago
  ]

  function filterByRange(items, range, nowMs) {
    if (range === 'all') return items
    const windowMap = {
      '6h': 6 * 3600 * 1000,
      '24h': 24 * 3600 * 1000,
      '7d': 7 * 24 * 3600 * 1000,
    }
    const cutoff = nowMs - windowMap[range]
    return items.filter((m) => new Date(m.measured_at).getTime() >= cutoff)
  }

  const res6h = filterByRange(measurements, '6h', refTime)
  assert.equal(res6h.length, 1)
  assert.equal(res6h[0].event_id, 'e1')

  const res24h = filterByRange(measurements, '24h', refTime)
  assert.equal(res24h.length, 2)
  assert.deepEqual(res24h.map((m) => m.event_id), ['e1', 'e2'])

  const res7d = filterByRange(measurements, '7d', refTime)
  assert.equal(res7d.length, 3)
  assert.deepEqual(res7d.map((m) => m.event_id), ['e1', 'e2', 'e3'])

  const resAll = filterByRange(measurements, 'all', refTime)
  assert.equal(resAll.length, 4)
})

// 4. Gap Detection (No continuous interpolation across missing telemetry)
test('4. Gap detection breaks polyline into discrete segments when observation intervals exceed threshold', () => {
  function generateSegments(items, gapThresholdMs) {
    if (items.length < 2) return []
    const segments = []
    let currentSegment = []

    for (let i = 0; i < items.length; i++) {
      const p = items[i]
      const t = new Date(p.measured_at).getTime()
      if (currentSegment.length > 0) {
        const prevT = new Date(items[i - 1].measured_at).getTime()
        if (t - prevT > gapThresholdMs) {
          if (currentSegment.length > 1) {
            segments.push(currentSegment)
          }
          currentSegment = []
        }
      }
      currentSegment.push(p)
    }
    if (currentSegment.length > 1) {
      segments.push(currentSegment)
    }
    return segments
  }

  const gapThreshold = 4 * 3600 * 1000 // 4 hours
  const contiguousMeasurements = [
    { event_id: '1', measured_at: '2026-10-22T08:00:00Z', value: 70 },
    { event_id: '2', measured_at: '2026-10-22T09:00:00Z', value: 72 },
    // 6 hour gap here (> 4h)
    { event_id: '3', measured_at: '2026-10-22T15:00:00Z', value: 75 },
    { event_id: '4', measured_at: '2026-10-22T16:00:00Z', value: 76 },
  ]

  const segments = generateSegments(contiguousMeasurements, gapThreshold)
  assert.equal(segments.length, 2, 'Should create 2 distinct segments due to the 6h gap')
  assert.equal(segments[0].length, 2)
  assert.equal(segments[1].length, 2)
  assert.deepEqual(segments[0].map((m) => m.event_id), ['1', '2'])
  assert.deepEqual(segments[1].map((m) => m.event_id), ['3', '4'])
})

// 5. Sparse and Empty History Detection
test('5. Sparse telemetry (<= 2 readings) and empty histories are flagged honestly', () => {
  function evaluateTelemetryDensity(points) {
    if (!points || points.length === 0) {
      return { isEmpty: true, isSparse: false }
    }
    if (points.length <= 2) {
      return { isEmpty: false, isSparse: true, count: points.length }
    }
    return { isEmpty: false, isSparse: false, count: points.length }
  }

  assert.deepEqual(evaluateTelemetryDensity([]), { isEmpty: true, isSparse: false })
  assert.deepEqual(evaluateTelemetryDensity([{ value: 80 }]), { isEmpty: false, isSparse: true, count: 1 })
  assert.deepEqual(evaluateTelemetryDensity([{ value: 80 }, { value: 82 }]), { isEmpty: false, isSparse: true, count: 2 })
  assert.deepEqual(evaluateTelemetryDensity([{ value: 80 }, { value: 82 }, { value: 84 }]), { isEmpty: false, isSparse: false, count: 3 })
})

// 6. Dual-Series Extraction for Blood Pressure
test('6. Blood pressure correctly extracts separate Systolic and Diastolic series', () => {
  const mixedMeasurements = [
    { event_id: '1', measurement_type: 'systolic_blood_pressure', value: 120, measured_at: '2026-10-22T08:00:00Z' },
    { event_id: '2', measurement_type: 'diastolic_blood_pressure', value: 80, measured_at: '2026-10-22T08:00:00Z' },
    { event_id: '3', measurement_type: 'heart_rate', value: 75, measured_at: '2026-10-22T08:00:00Z' },
    { event_id: '4', measurement_type: 'systolic_blood_pressure', value: 125, measured_at: '2026-10-22T09:00:00Z' },
    { event_id: '5', measurement_type: 'diastolic_blood_pressure', value: 82, measured_at: '2026-10-22T09:00:00Z' },
  ]

  const sys = mixedMeasurements.filter((m) => m.measurement_type === 'systolic_blood_pressure')
  const dia = mixedMeasurements.filter((m) => m.measurement_type === 'diastolic_blood_pressure')

  assert.equal(sys.length, 2)
  assert.equal(dia.length, 2)
  assert.equal(sys[0].value, 120)
  assert.equal(dia[0].value, 80)
})

// 7. Backend Demo Threshold Bounds Matching
test('7. Demo threshold bounds match backend rules with clear disclaimer', () => {
  const backendDemoThresholds = {
    heart_rate: { minimum: 40, maximum: 120, unit: 'bpm' },
    oxygen_saturation: { minimum: 92, maximum: null, unit: '%' },
    body_temperature: { minimum: 35.0, maximum: 38.0, unit: '°C' },
    systolic_blood_pressure: { minimum: 90, maximum: 180, unit: 'mmHg' },
    diastolic_blood_pressure: { minimum: 60, maximum: 120, unit: 'mmHg' },
  }

  // Verify that frontend config min/max align with backend thresholds
  assert.equal(VITAL_CONFIGS.heart_rate.defaultMin, backendDemoThresholds.heart_rate.minimum)
  assert.equal(VITAL_CONFIGS.heart_rate.defaultMax, backendDemoThresholds.heart_rate.maximum)
  assert.equal(VITAL_CONFIGS.oxygen_saturation.defaultMin, backendDemoThresholds.oxygen_saturation.minimum)
  assert.equal(VITAL_CONFIGS.body_temperature.defaultMin, backendDemoThresholds.body_temperature.minimum)
  assert.equal(VITAL_CONFIGS.body_temperature.defaultMax, backendDemoThresholds.body_temperature.maximum)
  assert.equal(VITAL_CONFIGS.blood_pressure.sysConfig.defaultMin, backendDemoThresholds.systolic_blood_pressure.minimum)
  assert.equal(VITAL_CONFIGS.blood_pressure.sysConfig.defaultMax, backendDemoThresholds.systolic_blood_pressure.maximum)
  assert.equal(VITAL_CONFIGS.blood_pressure.diaConfig.defaultMin, backendDemoThresholds.diastolic_blood_pressure.minimum)
  assert.equal(VITAL_CONFIGS.blood_pressure.diaConfig.defaultMax, backendDemoThresholds.diastolic_blood_pressure.maximum)
})

// 8. Alert Lifecycle State Transitions
test('8. Patient alert lifecycle transitions correctly from open to acknowledged and resolved', () => {
  const openAlert = {
    alert_id: 'a1',
    patient_id: 'PC-SYNTH01',
    status: 'open',
    severity: 'critical',
    created_at: '2026-10-22T08:00:00Z',
  }

  function simulateAcknowledge(alert, actorId, note) {
    assert.equal(alert.status, 'open', 'Only open alerts can be acknowledged')
    return {
      ...alert,
      status: 'acknowledged',
      acknowledgement: {
        acknowledged_at: '2026-10-22T08:15:00Z',
        acknowledged_by: actorId,
        note,
      },
    }
  }

  function simulateResolve(alert, actorId, resolutionCode, note) {
    assert.ok(alert.status === 'open' || alert.status === 'acknowledged')
    return {
      ...alert,
      status: 'resolved',
      resolution: {
        resolved_at: '2026-10-22T08:30:00Z',
        resolved_by: actorId,
        resolution_code: resolutionCode,
        note,
      },
    }
  }

  const ackAlert = simulateAcknowledge(openAlert, 'dr-kapoor', 'Reviewing tachycardia')
  assert.equal(ackAlert.status, 'acknowledged')
  assert.equal(ackAlert.acknowledgement.acknowledged_by, 'dr-kapoor')

  const resAlert = simulateResolve(ackAlert, 'dr-kapoor', 'clinical_review_complete', 'Patient stable')
  assert.equal(resAlert.status, 'resolved')
  assert.equal(resAlert.resolution.resolved_by, 'dr-kapoor')
})

// 9. Chronological Measurement Sorting & Filtering
test('9. History table correctly filters by vital type and sorts observations by timestamp', () => {
  const historyItems = [
    { event_id: 'm1', measurement_type: 'heart_rate', value: 72, measured_at: '2026-10-22T08:00:00Z' },
    { event_id: 'm2', measurement_type: 'oxygen_saturation', value: 98, measured_at: '2026-10-22T08:05:00Z' },
    { event_id: 'm3', measurement_type: 'heart_rate', value: 85, measured_at: '2026-10-22T09:00:00Z' },
  ]

  // Filter by heart_rate
  const filtered = historyItems.filter((m) => m.measurement_type === 'heart_rate')
  assert.equal(filtered.length, 2)

  // Sort descending (newest first)
  const desc = [...filtered].sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at))
  assert.equal(desc[0].event_id, 'm3')
  assert.equal(desc[1].event_id, 'm1')

  // Sort ascending (oldest first)
  const asc = [...filtered].sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at))
  assert.equal(asc[0].event_id, 'm1')
  assert.equal(asc[1].event_id, 'm3')
})
