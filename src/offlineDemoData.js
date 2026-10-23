/**
 * Deterministic In-Memory & LocalStorage Synthetic Demo Dataset for Gramin 24*7
 *
 * Provides a resilient, standalone demonstration experience that functions
 * seamlessly even when remote backends are asleep, offline, or unconfigured.
 */

export const DEMO_CLINICIAN_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkci5zaGFybWEiLCJyb2xlIjoiY2xpbmljaWFuIiwicGF0aWVudF9pZHMiOlsiKiJdLCJmdWxsX25hbWUiOiJEci4gU3VuaXRhIFNoYXJtYSAoQ01PKSIsImV4cCI6MjUzNDAyMzAwNzk5fQ.demo_offline_signature'

export const DEMO_CLINICIAN_USER = {
  username: 'dr.sharma',
  role: 'clinician',
  patient_ids: ['*'],
  full_name: 'Dr. Sunita Sharma (CMO)',
}

export const OFFLINE_DEMO_PATIENTS = [
  {
    patient_id: 'PC-SYNTH01',
    display_name: 'Kamla Devi',
    age: 62,
    gender: 'Female',
    phone: '9812345678',
    village: 'Majkhali',
    district: 'Almora',
    status: 'Active',
    is_simulated: true,
  },
  {
    patient_id: 'PC-DEMO01',
    display_name: 'Rajendra Prasad',
    age: 58,
    gender: 'Male',
    phone: '9876543210',
    village: 'Kausani Valley',
    district: 'Bageshwar',
    status: 'Active',
    is_simulated: true,
  },
  {
    patient_id: 'PC-DEMO02',
    display_name: 'Anandi Joshi',
    age: 45,
    gender: 'Female',
    phone: '9823456789',
    village: 'Joshimath',
    district: 'Chamoli',
    status: 'Active',
    is_simulated: true,
  },
  {
    patient_id: 'PC-DEMO03',
    display_name: 'Mohan Singh Rawat',
    age: 71,
    gender: 'Male',
    phone: '9834567890',
    village: 'Kedarnath',
    district: 'Rudraprayag',
    status: 'Active',
    is_simulated: true,
  },
  {
    patient_id: 'PC-DEMO04',
    display_name: 'Pooja Negi',
    age: 29,
    gender: 'Female',
    phone: '9845678901',
    village: 'Dharchula',
    district: 'Pithoragarh',
    status: 'Active',
    is_simulated: true,
  },
  {
    patient_id: 'PC-DEMO05',
    display_name: 'Vikram Negi',
    age: 35,
    gender: 'Male',
    phone: '9856789012',
    village: 'Munsiari',
    district: 'Pithoragarh',
    status: 'Active',
    is_simulated: true,
  },
]

const DEMO_EVENTS_SPEC = [
  // PC-SYNTH01 (Kamla Devi): Stable, healthy longitudinal telemetry
  { pid: 'PC-SYNTH01', type: 'heart_rate', val: 76, unit: 'bpm', ageMin: 6, src: 'health_worker' },
  { pid: 'PC-SYNTH01', type: 'oxygen_saturation', val: 98, unit: '%', ageMin: 6, src: 'device' },
  { pid: 'PC-SYNTH01', type: 'systolic_blood_pressure', val: 122, unit: 'mmHg', ageMin: 6, src: 'health_worker' },
  { pid: 'PC-SYNTH01', type: 'diastolic_blood_pressure', val: 78, unit: 'mmHg', ageMin: 6, src: 'health_worker' },
  { pid: 'PC-SYNTH01', type: 'body_temperature', val: 36.8, unit: '°C', ageMin: 6, src: 'patient' },
  { pid: 'PC-SYNTH01', type: 'heart_rate', val: 74, unit: 'bpm', ageMin: 60, src: 'health_worker' },
  { pid: 'PC-SYNTH01', type: 'heart_rate', val: 78, unit: 'bpm', ageMin: 180, src: 'health_worker' },
  { pid: 'PC-SYNTH01', type: 'heart_rate', val: 72, unit: 'bpm', ageMin: 360, src: 'health_worker' },
  { pid: 'PC-SYNTH01', type: 'oxygen_saturation', val: 97, unit: '%', ageMin: 120, src: 'device' },

  // PC-DEMO01 (Rajendra Prasad): Critical Tachycardia & Hypertension
  { pid: 'PC-DEMO01', type: 'heart_rate', val: 128, unit: 'bpm', ageMin: 8, src: 'health_worker' },
  { pid: 'PC-DEMO01', type: 'systolic_blood_pressure', val: 156, unit: 'mmHg', ageMin: 8, src: 'health_worker' },
  { pid: 'PC-DEMO01', type: 'diastolic_blood_pressure', val: 98, unit: 'mmHg', ageMin: 8, src: 'health_worker' },
  { pid: 'PC-DEMO01', type: 'oxygen_saturation', val: 93, unit: '%', ageMin: 8, src: 'device' },
  { pid: 'PC-DEMO01', type: 'body_temperature', val: 38.2, unit: '°C', ageMin: 8, src: 'health_worker' },
  { pid: 'PC-DEMO01', type: 'heart_rate', val: 104, unit: 'bpm', ageMin: 90, src: 'health_worker' },
  { pid: 'PC-DEMO01', type: 'heart_rate', val: 86, unit: 'bpm', ageMin: 240, src: 'health_worker' },

  // PC-DEMO02 (Anandi Joshi): Stale Reading (>15m) Quality Example
  { pid: 'PC-DEMO02', type: 'heart_rate', val: 82, unit: 'bpm', ageMin: 45, src: 'health_worker' },
  { pid: 'PC-DEMO02', type: 'oxygen_saturation', val: 95, unit: '%', ageMin: 45, src: 'device' },
  { pid: 'PC-DEMO02', type: 'systolic_blood_pressure', val: 118, unit: 'mmHg', ageMin: 45, src: 'health_worker' },
  { pid: 'PC-DEMO02', type: 'diastolic_blood_pressure', val: 76, unit: 'mmHg', ageMin: 45, src: 'health_worker' },
  { pid: 'PC-DEMO02', type: 'body_temperature', val: 36.7, unit: '°C', ageMin: 45, src: 'patient' },

  // PC-DEMO03 (Mohan Singh Rawat): Acknowledged Bradycardia Lifecycle
  { pid: 'PC-DEMO03', type: 'heart_rate', val: 64, unit: 'bpm', ageMin: 18, src: 'health_worker' },
  { pid: 'PC-DEMO03', type: 'heart_rate', val: 38, unit: 'bpm', ageMin: 120, src: 'health_worker' },
  { pid: 'PC-DEMO03', type: 'oxygen_saturation', val: 97, unit: '%', ageMin: 18, src: 'device' },
  { pid: 'PC-DEMO03', type: 'systolic_blood_pressure', val: 112, unit: 'mmHg', ageMin: 18, src: 'health_worker' },
  { pid: 'PC-DEMO03', type: 'diastolic_blood_pressure', val: 72, unit: 'mmHg', ageMin: 18, src: 'health_worker' },

  // PC-DEMO04 (Pooja Negi): High Alert Hypoxemia (88% SpO2)
  { pid: 'PC-DEMO04', type: 'oxygen_saturation', val: 88, unit: '%', ageMin: 10, src: 'device' },
  { pid: 'PC-DEMO04', type: 'heart_rate', val: 96, unit: 'bpm', ageMin: 10, src: 'health_worker' },
  { pid: 'PC-DEMO04', type: 'body_temperature', val: 37.4, unit: '°C', ageMin: 10, src: 'patient' },
  { pid: 'PC-DEMO04', type: 'systolic_blood_pressure', val: 126, unit: 'mmHg', ageMin: 10, src: 'health_worker' },

  // PC-DEMO05 (Vikram Negi): Resolved Pyrexia Lifecycle
  { pid: 'PC-DEMO05', type: 'body_temperature', val: 36.9, unit: '°C', ageMin: 25, src: 'patient' },
  { pid: 'PC-DEMO05', type: 'body_temperature', val: 39.2, unit: '°C', ageMin: 360, src: 'patient' },
  { pid: 'PC-DEMO05', type: 'heart_rate', val: 74, unit: 'bpm', ageMin: 25, src: 'health_worker' },
  { pid: 'PC-DEMO05', type: 'oxygen_saturation', val: 98, unit: '%', ageMin: 25, src: 'device' },
]

const INITIAL_OFFLINE_ALERTS = [
  {
    alert_id: 'alert-synth-01',
    schema_version: '1.0',
    patient_id: 'PC-DEMO01',
    patient_name: 'Rajendra Prasad',
    category: 'vital_out_of_range',
    severity: 'critical',
    reason: 'critical_tachycardia',
    message: 'Critical Tachycardia: Heart rate 128 bpm exceeds clinical ceiling (120 bpm).',
    measurement_type: 'heart_rate',
    value: 128,
    unit: 'bpm',
    status: 'open',
    ageMin: 8,
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledgment_note: null,
    resolved_at: null,
    resolved_by: null,
    resolution_code: null,
    resolution_note: null,
    is_simulated: true,
  },
  {
    alert_id: 'alert-synth-02',
    schema_version: '1.0',
    patient_id: 'PC-DEMO01',
    patient_name: 'Rajendra Prasad',
    category: 'vital_out_of_range',
    severity: 'warning',
    reason: 'hypertension_stage2',
    message: 'Stage 2 Hypertension: Systolic BP 156 mmHg exceeds stage 2 threshold (140 mmHg).',
    measurement_type: 'systolic_blood_pressure',
    value: 156,
    unit: 'mmHg',
    status: 'open',
    ageMin: 8,
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledgment_note: null,
    resolved_at: null,
    resolved_by: null,
    resolution_code: null,
    resolution_note: null,
    is_simulated: true,
  },
  {
    alert_id: 'alert-synth-03',
    schema_version: '1.0',
    patient_id: 'PC-DEMO02',
    patient_name: 'Anandi Joshi',
    category: 'stale_reading',
    severity: 'warning',
    reason: 'telemetry_stale_exceeded',
    message: 'Telemetry Stale: Last vital measurement received 45 minutes ago (exceeds 15m threshold).',
    measurement_type: 'heart_rate',
    value: 82,
    unit: 'bpm',
    status: 'open',
    ageMin: 45,
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledgment_note: null,
    resolved_at: null,
    resolved_by: null,
    resolution_code: null,
    resolution_note: null,
    is_simulated: true,
  },
  {
    alert_id: 'alert-synth-04',
    schema_version: '1.0',
    patient_id: 'PC-DEMO03',
    patient_name: 'Mohan Singh Rawat',
    category: 'vital_out_of_range',
    severity: 'medium',
    reason: 'bradycardia',
    message: 'Bradycardia: Heart rate 38 bpm dropped below floor (50 bpm).',
    measurement_type: 'heart_rate',
    value: 38,
    unit: 'bpm',
    status: 'acknowledged',
    ageMin: 120,
    acknowledged_at: new Date(Date.now() - 100 * 60 * 1000).toISOString(),
    acknowledged_by: 'dr.sharma',
    acknowledgment_note: 'Atropine and oral hydration administered. Telemetry stabilized to 64 bpm.',
    resolved_at: null,
    resolved_by: null,
    resolution_code: null,
    resolution_note: null,
    is_simulated: true,
  },
  {
    alert_id: 'alert-synth-05',
    schema_version: '1.0',
    patient_id: 'PC-DEMO04',
    patient_name: 'Pooja Negi',
    category: 'vital_out_of_range',
    severity: 'high',
    reason: 'hypoxemia',
    message: 'Severe Hypoxemia: SpO2 oxygen saturation at 88% (below 90% threshold).',
    measurement_type: 'oxygen_saturation',
    value: 88,
    unit: '%',
    status: 'open',
    ageMin: 10,
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledgment_note: null,
    resolved_at: null,
    resolved_by: null,
    resolution_code: null,
    resolution_note: null,
    is_simulated: true,
  },
  {
    alert_id: 'alert-synth-06',
    schema_version: '1.0',
    patient_id: 'PC-DEMO05',
    patient_name: 'Vikram Negi',
    category: 'vital_out_of_range',
    severity: 'medium',
    reason: 'pyrexia',
    message: 'Elevated Pyrexia: Core temperature 39.2°C detected.',
    measurement_type: 'body_temperature',
    value: 39.2,
    unit: '°C',
    status: 'resolved',
    ageMin: 360,
    acknowledged_at: new Date(Date.now() - 340 * 60 * 1000).toISOString(),
    acknowledged_by: 'dr.sharma',
    acknowledgment_note: 'Paracetamol 650mg ordered with cooling compress.',
    resolved_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    resolved_by: 'dr.sharma',
    resolution_code: 'clinical_review_complete',
    resolution_note: 'Fever responded to Paracetamol 650mg. Core temperature normalized to 36.9°C.',
    is_simulated: true,
  },
]

const ALERTS_STORAGE_KEY = 'pc_offline_alerts_v1'

export function getOfflineAlerts(patientId = null, status = null, category = null) {
  let list = []
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ALERTS_STORAGE_KEY) : null
    if (raw) {
      list = JSON.parse(raw)
    }
  } catch {}

  if (!list || !list.length) {
    const now = Date.now()
    list = INITIAL_OFFLINE_ALERTS.map((a) => ({
      ...a,
      created_at: new Date(now - (a.ageMin || 10) * 60 * 1000).toISOString(),
    }))
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(list))
      }
    } catch {}
  }

  let filtered = list
  if (patientId) {
    filtered = filtered.filter((a) => a.patient_id === patientId)
  }
  if (status) {
    filtered = filtered.filter((a) => a.status === status)
  }
  if (category) {
    filtered = filtered.filter((a) => a.category === category)
  }
  return filtered
}

export function acknowledgeOfflineAlert(alertId, actorId = 'dr.sharma', note = null) {
  const all = getOfflineAlerts()
  const target = all.find((a) => a.alert_id === alertId)
  if (target) {
    target.status = 'acknowledged'
    target.acknowledged_at = new Date().toISOString()
    target.acknowledged_by = actorId || 'dr.sharma'
    if (note) target.acknowledgment_note = note
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(all))
      }
    } catch {}
    return { ...target }
  }
  return { alert_id: alertId, status: 'acknowledged', acknowledged_by: actorId }
}

export function resolveOfflineAlert(alertId, actorId = 'dr.sharma', resolutionCode = 'clinical_review_complete', note = null) {
  const all = getOfflineAlerts()
  const target = all.find((a) => a.alert_id === alertId)
  if (target) {
    target.status = 'resolved'
    target.resolved_at = new Date().toISOString()
    target.resolved_by = actorId || 'dr.sharma'
    target.resolution_code = resolutionCode || 'clinical_review_complete'
    if (note) target.resolution_note = note
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(all))
      }
    } catch {}
    return { ...target }
  }
  return { alert_id: alertId, status: 'resolved', resolved_by: actorId }
}

export function getOfflineMeasurements(patientId, measurementType = null) {
  const now = Date.now()
  const events = DEMO_EVENTS_SPEC.filter((e) => e.pid === patientId).map((e, idx) => ({
    schema_version: '1.0',
    event_id: `offline-meas-${e.pid}-${e.type}-${idx}`,
    patient_id: e.pid,
    measurement_type: e.type,
    value: e.val,
    unit: e.unit,
    measured_at: new Date(now - e.ageMin * 60 * 1000).toISOString(),
    received_at: new Date(now - (e.ageMin - 0.5) * 60 * 1000).toISOString(),
    source: e.src,
    is_simulated: true,
  }))

  if (measurementType) {
    return events.filter((e) => e.measurement_type === measurementType)
  }
  return events.sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())
}

export function getOfflineDemoOverview() {
  const now = new Date()
  const alerts = getOfflineAlerts()
  const activeAlerts = alerts.filter((a) => a.status === 'open' || a.status === 'acknowledged')

  const patientsList = OFFLINE_DEMO_PATIENTS.map((p) => {
    const pMeasurements = getOfflineMeasurements(p.patient_id)
    const latestByType = {}
    for (const m of pMeasurements) {
      if (!latestByType[m.measurement_type]) {
        latestByType[m.measurement_type] = m
      }
    }

    const vitalTypes = [
      ['heart_rate', 'bpm'],
      ['oxygen_saturation', '%'],
      ['body_temperature', '°C'],
      ['systolic_blood_pressure', 'mmHg'],
      ['diastolic_blood_pressure', 'mmHg'],
    ]

    const vitals = {}
    let hasStale = false
    let hasMissing = false
    let mostRecent = null

    for (const [vKey, defaultUnit] of vitalTypes) {
      const m = latestByType[vKey]
      if (!m) {
        hasMissing = true
        vitals[vKey] = {
          value: null,
          unit: defaultUnit,
          measured_at: null,
          freshness: 'missing',
        }
      } else {
        if (!mostRecent || m.measured_at > mostRecent) {
          mostRecent = m.measured_at
        }
        const ageMin = (now.getTime() - new Date(m.measured_at).getTime()) / (60 * 1000)
        const isStale = ageMin > 15
        if (isStale) hasStale = true

        vitals[vKey] = {
          event_id: m.event_id,
          value: m.value,
          unit: m.unit,
          measured_at: m.measured_at,
          received_at: m.received_at,
          source: m.source,
          freshness: isStale ? 'stale' : 'recent',
        }
      }
    }

    const pAlerts = activeAlerts.filter((a) => a.patient_id === p.patient_id)
    const sevRank = { critical: 4, high: 3, warning: 3, medium: 2, low: 1, none: 0 }
    let highestSev = 'none'
    let highestVal = 0
    for (const a of pAlerts) {
      const val = sevRank[a.severity] || 0
      if (val > highestVal) {
        highestVal = val
        highestSev = a.severity
      }
    }

    let monitoringStatus = 'normal'
    if (highestSev === 'critical') {
      monitoringStatus = 'critical_attention'
    } else if (highestSev === 'high' || highestSev === 'warning' || highestSev === 'medium' || hasStale) {
      monitoringStatus = 'needs_review'
    }

    return {
      patient_id: p.patient_id,
      display_name: p.display_name,
      status: p.status,
      is_simulated: true,
      latest_measurements: vitals,
      latest_measurement_at: mostRecent,
      freshness_status: hasStale ? 'stale' : hasMissing ? 'missing' : 'recent',
      active_alerts_count: pAlerts.length,
      highest_severity: highestSev,
      monitoring_status: monitoringStatus,
      has_stale_vitals: hasStale,
      has_missing_vitals: hasMissing,
    }
  })

  const requiringReview = patientsList.filter(
    (p) => p.monitoring_status === 'critical_attention' || p.monitoring_status === 'needs_review'
  )
  const staleCount = patientsList.filter((p) => p.has_stale_vitals).length

  const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const a of activeAlerts) {
    const sev = a.severity === 'warning' ? 'high' : a.severity
    if (sev in sevCounts) sevCounts[sev] += 1
  }

  return {
    summary: {
      total_patients: patientsList.length,
      patients_requiring_review: requiringReview.length,
      active_alerts_count: activeAlerts.length,
      active_alerts_by_severity: sevCounts,
      patients_with_stale_measurements: staleCount,
      patients_with_missing_measurements: 0,
      pending_escalations_count: 1,
      total_measurements_count: 28,
    },
    patients: patientsList,
    alerts: activeAlerts,
    generated_at: now.toISOString(),
    request_id: 'offline-demo-overview',
  }
}

export function getOfflinePatientLatestVitals(patientId) {
  const overview = getOfflineDemoOverview()
  const p = overview.patients.find((item) => item.patient_id === patientId)
  if (p) {
    return {
      patient_id: patientId,
      vitals: p.latest_measurements,
      retrieved_at: new Date().toISOString(),
    }
  }
  return {
    patient_id: patientId,
    vitals: {},
    retrieved_at: new Date().toISOString(),
  }
}
