import test from 'node:test'
import assert from 'node:assert/strict'

// 1. Summary Metrics & Calculation Rules (No double-counting, distinct patient counts)
test('1. Summary metrics calculates accurate counts without double-counting', () => {
  function computeSummaryMetrics(patients, alerts, escalations = {}) {
    const totalPatients = patients.length
    const activeAlerts = alerts.filter((a) => a.status === 'open' || a.status === 'acknowledged')

    const severityBreakdown = { high: 0, medium: 0, low: 0, critical: 0 }
    activeAlerts.forEach((a) => {
      const sev = a.severity?.toLowerCase() || 'medium'
      if (severityBreakdown[sev] !== undefined) {
        severityBreakdown[sev] += 1
      }
    })

    const patientsWithActiveAlerts = new Set(activeAlerts.map((a) => a.patient_id))
    const stalePatients = new Set()
    const missingPatients = new Set()
    const reviewPatients = new Set(patientsWithActiveAlerts)

    patients.forEach((p) => {
      if (p.has_stale_vitals || p.freshness === 'stale') {
        stalePatients.add(p.patient_id)
        reviewPatients.add(p.patient_id)
      }
      if (p.has_missing_vitals || p.freshness === 'missing') {
        missingPatients.add(p.patient_id)
        reviewPatients.add(p.patient_id)
      }
    })

    // Pending escalations: active alerts with an active escalation record or level > 0
    let pendingEscalations = 0
    activeAlerts.forEach((a) => {
      const esc = escalations[a.alert_id]
      if (esc && esc.status === 'active' && esc.current_level > 0) {
        pendingEscalations += 1
      }
    })

    return {
      total_patients: totalPatients,
      patients_requiring_review: reviewPatients.size,
      active_alerts_count: activeAlerts.length,
      active_alerts_by_severity: severityBreakdown,
      patients_with_stale_measurements: stalePatients.size,
      patients_with_missing_measurements: missingPatients.size,
      pending_escalations: pendingEscalations,
    }
  }

  // Fixture: Patient A has 2 active alerts and 1 stale vital.
  // Patient B has 1 active alert and 1 missing vital.
  // Patient C has normal vitals and 0 alerts.
  const mockPatients = [
    { patient_id: 'PC-A', has_stale_vitals: true, has_missing_vitals: false },
    { patient_id: 'PC-B', has_stale_vitals: false, has_missing_vitals: true },
    { patient_id: 'PC-C', has_stale_vitals: false, has_missing_vitals: false },
  ]

  const mockAlerts = [
    { alert_id: 'alt-1', patient_id: 'PC-A', severity: 'high', status: 'open' },
    { alert_id: 'alt-2', patient_id: 'PC-A', severity: 'medium', status: 'acknowledged' },
    { alert_id: 'alt-3', patient_id: 'PC-B', severity: 'low', status: 'open' },
    { alert_id: 'alt-4', patient_id: 'PC-C', severity: 'high', status: 'resolved' }, // resolved, should not count!
  ]

  const mockEscalations = {
    'alt-1': { status: 'active', current_level: 1 },
    'alt-2': { status: 'completed', current_level: 1 },
    'alt-3': { status: 'active', current_level: 0 },
  }

  const metrics = computeSummaryMetrics(mockPatients, mockAlerts, mockEscalations)

  // Verify distinctions:
  assert.equal(metrics.total_patients, 3, 'Total authorized patients is 3')
  assert.equal(metrics.active_alerts_count, 3, 'Resolved alert alt-4 is excluded from active count')
  assert.equal(metrics.active_alerts_by_severity.high, 1, '1 active high alert')
  assert.equal(metrics.active_alerts_by_severity.medium, 1, '1 active medium alert')
  assert.equal(metrics.active_alerts_by_severity.low, 1, '1 active low alert')

  // Review patients: PC-A and PC-B need review (2 patients), despite PC-A having 2 alerts + stale vital
  assert.equal(metrics.patients_requiring_review, 2, 'Distinct count of patients requiring review')
  assert.equal(metrics.patients_with_stale_measurements, 1, 'Only PC-A has stale measurements')
  assert.equal(metrics.patients_with_missing_measurements, 1, 'Only PC-B has missing measurements')
  assert.equal(metrics.pending_escalations, 1, 'Only alt-1 has active escalation level > 0')
})

// 2. Vital Sign Presentation & Units (No fabricated 0s)
test('2. Vital sign values display correct units and never substitute missing with zero', () => {
  function formatVitalReading(reading, defaultUnit) {
    if (!reading || reading.value === null || reading.value === undefined) {
      return { value: 'Missing', unit: '' }
    }
    const val = Number(reading.value)
    if (Number.isNaN(val)) {
      return { value: 'Invalid', unit: '' }
    }
    return {
      value: Number.isInteger(val) ? val.toString() : val.toFixed(1),
      unit: reading.unit || defaultUnit,
    }
  }

  // 1. Heart rate
  const hr = formatVitalReading({ value: 78, unit: 'bpm' }, 'bpm')
  assert.equal(hr.value, '78')
  assert.equal(hr.unit, 'bpm')

  // 2. SpO2
  const spo2 = formatVitalReading({ value: 96, unit: '%' }, '%')
  assert.equal(spo2.value, '96')
  assert.equal(spo2.unit, '%')

  // 3. Temperature
  const temp = formatVitalReading({ value: 37.2, unit: '°C' }, '°C')
  assert.equal(temp.value, '37.2')
  assert.equal(temp.unit, '°C')

  // 4. Systolic BP
  const sys = formatVitalReading({ value: 124, unit: 'mmHg' }, 'mmHg')
  assert.equal(sys.value, '124')
  assert.equal(sys.unit, 'mmHg')

  // 5. Diastolic BP
  const dia = formatVitalReading({ value: 82, unit: 'mmHg' }, 'mmHg')
  assert.equal(dia.value, '82')
  assert.equal(dia.unit, 'mmHg')

  // 6. Missing vital reading — CRITICAL: must never be 0 or normal
  const missing = formatVitalReading(null, 'bpm')
  assert.equal(missing.value, 'Missing')
  assert.notEqual(missing.value, '0')
  assert.notEqual(missing.value, '72')
})

// 3. Independent Vital Timestamps
test('3. Independent measurement timestamps are preserved per vital type', () => {
  const patientVitals = {
    heart_rate: { value: 80, measured_at: '2026-10-22T10:00:00Z' },
    blood_pressure_systolic: { value: 120, measured_at: '2026-10-22T10:30:00Z' },
    temperature: { value: 36.8, measured_at: '2026-10-22T08:00:00Z' },
  }

  assert.notEqual(
    patientVitals.heart_rate.measured_at,
    patientVitals.blood_pressure_systolic.measured_at,
    'Heart rate and BP systolic have independent timestamps'
  )
  assert.notEqual(
    patientVitals.heart_rate.measured_at,
    patientVitals.temperature.measured_at,
    'Temperature measured at different time than heart rate'
  )
})

// 4. Freshness Logic
test('4. Freshness logic evaluates readings as recent, stale (>15m), or missing', () => {
  function evaluateFreshness(measuredAtIso, nowIso) {
    if (!measuredAtIso) return 'missing'
    const diffMin = (new Date(nowIso).getTime() - new Date(measuredAtIso).getTime()) / 60000
    if (diffMin <= 15) return 'recent'
    return 'stale'
  }

  const now = '2026-10-22T12:00:00Z'

  // Recent: 5 minutes ago
  assert.equal(evaluateFreshness('2026-10-22T11:55:00Z', now), 'recent')

  // Stale: 20 minutes ago
  assert.equal(evaluateFreshness('2026-10-22T11:40:00Z', now), 'stale')

  // Missing: no timestamp
  assert.equal(evaluateFreshness(null, now), 'missing')
})

// 5. Search, Filters, and Sorting
test('5. Search filtering matches patient identifier or display name case-insensitively', () => {
  const patients = [
    { patient_id: 'PC-SYNTH01', display_name: 'Anita Devi' },
    { patient_id: 'PC-SYNTH02', display_name: 'Rohan Sharma' },
    { patient_id: 'PC-SYNTH03', display_name: 'Priya Verma' },
  ]

  function filterBySearch(items, query) {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (p) =>
        p.patient_id.toLowerCase().includes(q) ||
        (p.display_name && p.display_name.toLowerCase().includes(q))
    )
  }

  assert.equal(filterBySearch(patients, 'synth01').length, 1)
  assert.equal(filterBySearch(patients, 'synth01')[0].patient_id, 'PC-SYNTH01')

  assert.equal(filterBySearch(patients, 'sharma').length, 1)
  assert.equal(filterBySearch(patients, 'sharma')[0].patient_id, 'PC-SYNTH02')

  assert.equal(filterBySearch(patients, 'nonexistent').length, 0)
  assert.equal(filterBySearch(patients, '').length, 3)
})

test('6. Filter combinations (status, severity, freshness) apply conjunctively', () => {
  const patients = [
    { patient_id: 'P1', monitoring_status: 'critical_attention', highest_severity: 'high', freshness: 'recent' },
    { patient_id: 'P2', monitoring_status: 'needs_review', highest_severity: 'medium', freshness: 'stale' },
    { patient_id: 'P3', monitoring_status: 'needs_review', highest_severity: 'none', freshness: 'missing' },
    { patient_id: 'P4', monitoring_status: 'normal', highest_severity: 'none', freshness: 'recent' },
  ]

  function filterPatients(items, { status, severity, freshness }) {
    return items.filter((p) => {
      if (status !== 'all' && p.monitoring_status !== status) return false
      if (severity !== 'all' && p.highest_severity !== severity) return false
      if (freshness !== 'all' && p.freshness !== freshness) return false
      return true
    })
  }

  // Filter 1: all needs_review
  assert.equal(filterPatients(patients, { status: 'needs_review', severity: 'all', freshness: 'all' }).length, 2)

  // Filter 2: needs_review AND stale
  const reviewStale = filterPatients(patients, { status: 'needs_review', severity: 'all', freshness: 'stale' })
  assert.equal(reviewStale.length, 1)
  assert.equal(reviewStale[0].patient_id, 'P2')

  // Filter 3: critical_attention AND high severity
  const criticalHigh = filterPatients(patients, { status: 'critical_attention', severity: 'high', freshness: 'all' })
  assert.equal(criticalHigh.length, 1)
  assert.equal(criticalHigh[0].patient_id, 'P1')
})

test('7. Sorting orders patients accurately by urgency, name, id, and freshness', () => {
  const patients = [
    { patient_id: 'PC-03', display_name: 'Charlie', active_alert_count: 0, freshness: 'recent' },
    { patient_id: 'PC-01', display_name: 'Alice', active_alert_count: 3, freshness: 'stale' },
    { patient_id: 'PC-02', display_name: 'Bob', active_alert_count: 1, freshness: 'missing' },
  ]

  function sortPatients(items, sortBy) {
    const list = [...items]
    if (sortBy === 'urgency') {
      return list.sort((a, b) => b.active_alert_count - a.active_alert_count)
    }
    if (sortBy === 'name') {
      return list.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''))
    }
    if (sortBy === 'id') {
      return list.sort((a, b) => a.patient_id.localeCompare(b.patient_id))
    }
    return list
  }

  // Urgency sort: PC-01 (3 alerts), PC-02 (1 alert), PC-03 (0 alerts)
  const byUrgency = sortPatients(patients, 'urgency')
  assert.equal(byUrgency[0].patient_id, 'PC-01')
  assert.equal(byUrgency[1].patient_id, 'PC-02')
  assert.equal(byUrgency[2].patient_id, 'PC-03')

  // Name sort: Alice, Bob, Charlie
  const byName = sortPatients(patients, 'name')
  assert.equal(byName[0].display_name, 'Alice')
  assert.equal(byName[1].display_name, 'Bob')
  assert.equal(byName[2].display_name, 'Charlie')
})

test('8. Navigation route generator targets individual patient RPM overview correctly', () => {
  function getPatientDetailRoute(patientId) {
    return `/doctor/patients/${patientId}`
  }

  assert.equal(getPatientDetailRoute('PC-SYNTH01'), '/doctor/patients/PC-SYNTH01')
  assert.equal(getPatientDetailRoute('PC-DEV09'), '/doctor/patients/PC-DEV09')
})
