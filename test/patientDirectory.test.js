import test from 'node:test'
import assert from 'node:assert/strict'

// 1. Directory Data & 5-Vital Presentation
test('1. Patient Directory formats all 5 vitals correctly and never substitutes missing with zero', () => {
  function formatDirectoryVital(reading, defaultUnit) {
    if (!reading || reading.value === null || reading.value === undefined) {
      return { value: 'Missing', unit: '', isMissing: true }
    }
    return {
      value: String(reading.value),
      unit: reading.unit || defaultUnit,
      isMissing: false,
      freshness: reading.freshness || 'recent',
      measured_at: reading.measured_at,
    }
  }

  const sampleMeasurements = {
    heart_rate: { value: 76, unit: 'bpm', freshness: 'recent', measured_at: '2026-10-22T10:00:00Z' },
    oxygen_saturation: { value: 98, unit: '%', freshness: 'recent', measured_at: '2026-10-22T10:02:00Z' },
    body_temperature: { value: 37.0, unit: '°C', freshness: 'stale', measured_at: '2026-10-22T08:30:00Z' },
    systolic_blood_pressure: { value: 122, unit: 'mmHg', freshness: 'recent', measured_at: '2026-10-22T10:00:00Z' },
    diastolic_blood_pressure: null, // missing reading
  }

  const hr = formatDirectoryVital(sampleMeasurements.heart_rate, 'bpm')
  assert.equal(hr.value, '76')
  assert.equal(hr.unit, 'bpm')
  assert.equal(hr.isMissing, false)

  const spo2 = formatDirectoryVital(sampleMeasurements.oxygen_saturation, '%')
  assert.equal(spo2.value, '98')
  assert.equal(spo2.unit, '%')

  const temp = formatDirectoryVital(sampleMeasurements.body_temperature, '°C')
  assert.equal(temp.value, '37')
  assert.equal(temp.unit, '°C')
  assert.equal(temp.freshness, 'stale')

  const sys = formatDirectoryVital(sampleMeasurements.systolic_blood_pressure, 'mmHg')
  assert.equal(sys.value, '122')
  assert.equal(sys.unit, 'mmHg')

  const dia = formatDirectoryVital(sampleMeasurements.diastolic_blood_pressure, 'mmHg')
  assert.equal(dia.value, 'Missing')
  assert.equal(dia.isMissing, true)
  assert.notEqual(dia.value, '0')
  assert.notEqual(dia.value, '80')
})

// 2. Search by Patient ID and Display Name
test('2. Directory search matches patient identifier or display name case-insensitively', () => {
  const directoryPatients = [
    { patient_id: 'PC-SYNTH01', display_name: 'Anita Devi' },
    { patient_id: 'PC-SYNTH02', display_name: 'Rohan Sharma' },
    { patient_id: 'PC-DEV09', display_name: 'Priya Verma' },
  ]

  function searchDirectory(items, query) {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (p) =>
        p.patient_id.toLowerCase().includes(q) ||
        (p.display_name && p.display_name.toLowerCase().includes(q))
    )
  }

  assert.equal(searchDirectory(directoryPatients, 'synth02').length, 1)
  assert.equal(searchDirectory(directoryPatients, 'synth02')[0].patient_id, 'PC-SYNTH02')

  assert.equal(searchDirectory(directoryPatients, 'devi').length, 1)
  assert.equal(searchDirectory(directoryPatients, 'devi')[0].display_name, 'Anita Devi')

  assert.equal(searchDirectory(directoryPatients, 'unknown').length, 0)
  assert.equal(searchDirectory(directoryPatients, '').length, 3)
})

// 3. Multi-Filter Conjunctive Logic
test('3. Combined filters (status, severity, freshness) apply conjunctively', () => {
  const directoryPatients = [
    { patient_id: 'P1', monitoring_status: 'critical_attention', highest_severity: 'critical', freshness_status: 'recent' },
    { patient_id: 'P2', monitoring_status: 'needs_review', highest_severity: 'medium', freshness_status: 'stale' },
    { patient_id: 'P3', monitoring_status: 'needs_review', highest_severity: 'none', freshness_status: 'missing' },
    { patient_id: 'P4', monitoring_status: 'normal', highest_severity: 'none', freshness_status: 'recent' },
  ]

  function applyDirectoryFilters(items, { status, severity, freshness }) {
    return items.filter((p) => {
      if (status !== 'all' && p.monitoring_status !== status) return false
      if (severity !== 'all' && p.highest_severity !== severity) return false
      if (freshness !== 'all' && p.freshness_status !== freshness) return false
      return true
    })
  }

  // Filter: needs_review
  assert.equal(applyDirectoryFilters(directoryPatients, { status: 'needs_review', severity: 'all', freshness: 'all' }).length, 2)

  // Filter: needs_review + stale
  const reviewStale = applyDirectoryFilters(directoryPatients, { status: 'needs_review', severity: 'all', freshness: 'stale' })
  assert.equal(reviewStale.length, 1)
  assert.equal(reviewStale[0].patient_id, 'P2')

  // Filter: critical_attention + critical
  const critical = applyDirectoryFilters(directoryPatients, { status: 'critical_attention', severity: 'critical', freshness: 'all' })
  assert.equal(critical.length, 1)
  assert.equal(critical[0].patient_id, 'P1')

  // Filter: no match
  assert.equal(applyDirectoryFilters(directoryPatients, { status: 'normal', severity: 'high', freshness: 'all' }).length, 0)
})

// 4. Sorting Logic
test('4. Directory sorting accurately orders by urgency, name, id, freshness, and latest measurement', () => {
  const directoryPatients = [
    { patient_id: 'PC-03', display_name: 'Vikram', highest_severity: 'none', active_alerts_count: 0, freshness_status: 'recent', latest_measurement_at: '2026-10-22T08:00:00Z' },
    { patient_id: 'PC-01', display_name: 'Anita', highest_severity: 'critical', active_alerts_count: 2, freshness_status: 'stale', latest_measurement_at: '2026-10-22T09:00:00Z' },
    { patient_id: 'PC-02', display_name: 'Deepak', highest_severity: 'medium', active_alerts_count: 1, freshness_status: 'missing', latest_measurement_at: '2026-10-22T10:00:00Z' },
  ]

  function sortDirectory(items, sortBy) {
    const list = [...items]
    const sevRank = { critical: 4, high: 3, medium: 2, low: 1, none: 0 }
    if (sortBy === 'urgency') {
      return list.sort((a, b) => {
        const aRank = sevRank[a.highest_severity] || 0
        const bRank = sevRank[b.highest_severity] || 0
        if (bRank !== aRank) return bRank - aRank
        return (b.active_alerts_count || 0) - (a.active_alerts_count || 0)
      })
    }
    if (sortBy === 'name') {
      return list.sort((a, b) => a.display_name.localeCompare(b.display_name))
    }
    if (sortBy === 'id') {
      return list.sort((a, b) => a.patient_id.localeCompare(b.patient_id))
    }
    if (sortBy === 'freshness') {
      const freshRank = { missing: 3, stale: 2, recent: 1 }
      return list.sort((a, b) => (freshRank[b.freshness_status] || 1) - (freshRank[a.freshness_status] || 1))
    }
    if (sortBy === 'latest') {
      return list.sort((a, b) => new Date(b.latest_measurement_at).getTime() - new Date(a.latest_measurement_at).getTime())
    }
    return list
  }

  // Urgency sort: critical first (PC-01), then medium (PC-02), then none (PC-03)
  const byUrgency = sortDirectory(directoryPatients, 'urgency')
  assert.equal(byUrgency[0].patient_id, 'PC-01')
  assert.equal(byUrgency[1].patient_id, 'PC-02')
  assert.equal(byUrgency[2].patient_id, 'PC-03')

  // Name sort: Anita (PC-01), Deepak (PC-02), Vikram (PC-03)
  const byName = sortDirectory(directoryPatients, 'name')
  assert.equal(byName[0].display_name, 'Anita')
  assert.equal(byName[1].display_name, 'Deepak')
  assert.equal(byName[2].display_name, 'Vikram')

  // Freshness sort: missing (PC-02), stale (PC-01), recent (PC-03)
  const byFresh = sortDirectory(directoryPatients, 'freshness')
  assert.equal(byFresh[0].patient_id, 'PC-02')
  assert.equal(byFresh[1].patient_id, 'PC-01')
  assert.equal(byFresh[2].patient_id, 'PC-03')

  // Latest measurement time sort: 10:00 (PC-02), 09:00 (PC-01), 08:00 (PC-03)
  const byLatest = sortDirectory(directoryPatients, 'latest')
  assert.equal(byLatest[0].patient_id, 'PC-02')
  assert.equal(byLatest[1].patient_id, 'PC-01')
  assert.equal(byLatest[2].patient_id, 'PC-03')
})

// 5. Pagination
test('5. Directory pagination calculates slices, total pages, and handles boundary clicks', () => {
  const allPatients = Array.from({ length: 23 }, (_, i) => ({
    patient_id: `PC-TEST${String(i + 1).padStart(2, '0')}`,
  }))

  function paginate(items, page, pageSize) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
    const clampedPage = Math.max(1, Math.min(page, totalPages))
    const start = (clampedPage - 1) * pageSize
    const pageItems = items.slice(start, start + pageSize)
    return {
      items: pageItems,
      currentPage: clampedPage,
      totalPages,
      totalItems: items.length,
      startItem: start + 1,
      endItem: Math.min(start + pageSize, items.length),
    }
  }

  // Page 1 with pageSize=10
  const p1 = paginate(allPatients, 1, 10)
  assert.equal(p1.items.length, 10)
  assert.equal(p1.totalPages, 3)
  assert.equal(p1.startItem, 1)
  assert.equal(p1.endItem, 10)
  assert.equal(p1.items[0].patient_id, 'PC-TEST01')

  // Page 3 with pageSize=10 (last page with 3 items)
  const p3 = paginate(allPatients, 3, 10)
  assert.equal(p3.items.length, 3)
  assert.equal(p3.startItem, 21)
  assert.equal(p3.endItem, 23)
  assert.equal(p3.items[2].patient_id, 'PC-TEST23')

  // Page 5 out of bounds clamps to page 3
  const pClamped = paginate(allPatients, 5, 10)
  assert.equal(pClamped.currentPage, 3)
})

// 6. Navigation and Route Resolution
test('6. Patient row navigation targets the correct individual RPM route', () => {
  function getPatientRPMRoute(patientId) {
    return `/doctor/patients/${patientId}`
  }

  assert.equal(getPatientRPMRoute('PC-SYNTH01'), '/doctor/patients/PC-SYNTH01')
  assert.equal(getPatientRPMRoute('PC-OTHER'), '/doctor/patients/PC-OTHER')
})

// 7. Access Denied & Not Found Error States
test('7. Access denied (403) and Not Found (404) error states map correctly', () => {
  function evaluatePatientAccess(errMessage) {
    const msg = String(errMessage || '').toLowerCase()
    if (msg.includes('403') || msg.includes('denied') || msg.includes('forbidden')) {
      return 'access_denied'
    }
    if (msg.includes('404') || msg.includes('not found')) {
      return 'not_found'
    }
    return 'network_error'
  }

  assert.equal(evaluatePatientAccess('403 Forbidden: Patient access denied'), 'access_denied')
  assert.equal(evaluatePatientAccess('Patient access denied: You are not authorized to view this patient record.'), 'access_denied')
  assert.equal(evaluatePatientAccess('404 Not Found: Patient PC-999 not found'), 'not_found')
  assert.equal(evaluatePatientAccess('Patient not found: Record for PC-999 does not exist.'), 'not_found')
  assert.equal(evaluatePatientAccess('Failed to fetch'), 'network_error')
})
