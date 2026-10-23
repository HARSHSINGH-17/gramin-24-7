import test from 'node:test'
import assert from 'node:assert/strict'

// 1. Truthful Alert Summary Counts
test('1. Alert summary calculates exact counts for open, acknowledged, overdue, and resolved', () => {
  const refTimeMs = new Date('2026-10-23T12:00:00Z').getTime()

  const alerts = [
    {
      alert_id: 'a1',
      status: 'open',
      severity: 'critical',
      created_at: new Date(refTimeMs - 30 * 60 * 1000).toISOString(), // 30m ago -> Overdue
    },
    {
      alert_id: 'a2',
      status: 'open',
      severity: 'high',
      created_at: new Date(refTimeMs - 5 * 60 * 1000).toISOString(), // 5m ago -> Open, not overdue
    },
    {
      alert_id: 'a3',
      status: 'acknowledged',
      severity: 'medium',
      created_at: new Date(refTimeMs - 60 * 60 * 1000).toISOString(),
    },
    {
      alert_id: 'a4',
      status: 'resolved',
      severity: 'low',
      created_at: new Date(refTimeMs - 120 * 60 * 1000).toISOString(),
    },
  ]

  function calculateSummary(items, nowMs) {
    let open = 0
    let acknowledged = 0
    let overdue = 0
    let resolved = 0

    for (const a of items) {
      if (a.status === 'open') {
        open++
        const createdMs = new Date(a.created_at).getTime()
        if (nowMs - createdMs > 15 * 60 * 1000) {
          overdue++
        }
      } else if (a.status === 'acknowledged') {
        acknowledged++
      } else if (a.status === 'resolved') {
        resolved++
      }
    }

    return { total: items.length, open, acknowledged, overdue, resolved }
  }

  const summary = calculateSummary(alerts, refTimeMs)
  assert.equal(summary.total, 4)
  assert.equal(summary.open, 2)
  assert.equal(summary.overdue, 1)
  assert.equal(summary.acknowledged, 1)
  assert.equal(summary.resolved, 1)
})

// 2. Alert Search Matching
test('2. Alert search matches patient identifier, patient name, reason code, and message', () => {
  const alerts = [
    {
      alert_id: 'a1',
      patient_id: 'PC-SYNTH01',
      reason: { code: 'tachycardia_high', message: 'Heart rate 135 bpm exceeds threshold' },
      severity: 'critical',
    },
    {
      alert_id: 'a2',
      patient_id: 'PC-SYNTH02',
      reason: { code: 'hypoxia_spo2_low', message: 'SpO2 88% below safe minimum' },
      severity: 'high',
    },
  ]

  const patients = [
    { patient_id: 'PC-SYNTH01', display_name: 'Anita Devi' },
    { patient_id: 'PC-SYNTH02', display_name: 'Rohan Sharma' },
  ]

  function searchAlerts(items, query) {
    if (!query) return items
    const q = query.toLowerCase()
    return items.filter((a) => {
      const matchPatientId = a.patient_id.toLowerCase().includes(q)
      const patient = patients.find((p) => p.patient_id === a.patient_id)
      const matchPatientName = patient?.display_name.toLowerCase().includes(q)
      const matchCode = a.reason?.code?.toLowerCase().includes(q)
      const matchMessage = a.reason?.message?.toLowerCase().includes(q)
      return matchPatientId || matchPatientName || matchCode || matchMessage
    })
  }

  assert.equal(searchAlerts(alerts, 'Anita').length, 1)
  assert.equal(searchAlerts(alerts, 'PC-SYNTH02').length, 1)
  assert.equal(searchAlerts(alerts, 'tachycardia').length, 1)
  assert.equal(searchAlerts(alerts, 'spo2').length, 1)
  assert.equal(searchAlerts(alerts, 'nonexistent').length, 0)
})

// 3. Sorting by Urgency and Severity
test('3. Urgency sort prioritizes open overdue and critical alerts over acknowledged or resolved', () => {
  const sevRank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }

  const alerts = [
    { alert_id: 'resolved_crit', status: 'resolved', severity: 'critical', created_at: '2026-10-23T10:00:00Z' },
    { alert_id: 'open_med', status: 'open', severity: 'medium', created_at: '2026-10-23T11:00:00Z' },
    { alert_id: 'open_crit', status: 'open', severity: 'critical', created_at: '2026-10-23T11:30:00Z' },
    { alert_id: 'ack_high', status: 'acknowledged', severity: 'high', created_at: '2026-10-23T10:30:00Z' },
  ]

  function sortByUrgency(items) {
    return [...items].sort((a, b) => {
      const isAOpen = a.status === 'open'
      const isBOpen = b.status === 'open'
      if (isAOpen !== isBOpen) return isBOpen ? 1 : -1

      const rankA = sevRank[a.severity] || 0
      const rankB = sevRank[b.severity] || 0
      if (rankB !== rankA) return rankB - rankA

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }

  const sorted = sortByUrgency(alerts)
  assert.equal(sorted[0].alert_id, 'open_crit', 'Open critical alert should be first')
  assert.equal(sorted[1].alert_id, 'open_med', 'Open medium alert should be second')
  assert.equal(sorted[2].alert_id, 'resolved_crit')
  assert.equal(sorted[3].alert_id, 'ack_high')
})

// 4. Acknowledgment Contract & Actor Recording
test('4. Alert acknowledgment records authenticated actor, note, and stops pending escalation', () => {
  const initialAlert = {
    alert_id: 'a100',
    patient_id: 'PC-SYNTH01',
    status: 'open',
    severity: 'critical',
  }

  const initialEscalation = {
    alert_id: 'a100',
    status: 'pending',
    current_level: 1,
    next_due_at: '2026-10-23T12:10:00Z',
    stop_on_acknowledge: true,
  }

  function acknowledgeAlert(alert, escalation, actorId, note) {
    assert.equal(alert.status, 'open', 'Cannot acknowledge a non-open alert')
    assert.ok(actorId, 'Authenticated actorId is required')

    const updatedAlert = {
      ...alert,
      status: 'acknowledged',
      acknowledgement: {
        acknowledged_at: '2026-10-23T12:02:00Z',
        acknowledged_by: actorId,
        note: note || null,
      },
    }

    const updatedEscalation = {
      ...escalation,
      status: escalation.stop_on_acknowledge ? 'acknowledged_stopped' : escalation.status,
      next_due_at: escalation.stop_on_acknowledge ? null : escalation.next_due_at,
    }

    return { alert: updatedAlert, escalation: updatedEscalation }
  }

  const result = acknowledgeAlert(initialAlert, initialEscalation, 'dr-sharma', 'Spoke with patient family')
  assert.equal(result.alert.status, 'acknowledged')
  assert.equal(result.alert.acknowledgement.acknowledged_by, 'dr-sharma')
  assert.equal(result.escalation.status, 'acknowledged_stopped')
  assert.equal(result.escalation.next_due_at, null)
})

// 5. Resolution Contract with Code and Remarks
test('5. Alert resolution requires resolution code and closes alert lifecycle', () => {
  const acknowledgedAlert = {
    alert_id: 'a200',
    status: 'acknowledged',
    severity: 'high',
  }

  function resolveAlert(alert, actorId, resolutionCode, note) {
    assert.ok(alert.status === 'open' || alert.status === 'acknowledged', 'Cannot resolve closed alert')
    assert.ok(resolutionCode, 'resolution_code is mandatory')
    assert.ok(actorId, 'actorId is mandatory')

    return {
      ...alert,
      status: 'resolved',
      resolution: {
        resolved_at: '2026-10-23T12:30:00Z',
        resolved_by: actorId,
        resolution_code: resolutionCode,
        note: note || null,
      },
    }
  }

  const resolved = resolveAlert(
    acknowledgedAlert,
    'dr-sharma',
    'clinical_review_complete',
    'Follow-up vitals normalized'
  )
  assert.equal(resolved.status, 'resolved')
  assert.equal(resolved.resolution.resolution_code, 'clinical_review_complete')
  assert.equal(resolved.resolution.resolved_by, 'dr-sharma')
})

// 6. Escalation Multi-Tier Ladder and Mock Notification Disclaimers
test('6. Escalation notifications format Level 1 and Level 2 dispatches with simulated disclaimers', () => {
  function formatNotification(level, role, target, message) {
    return {
      escalation_level: level,
      recipient_role: role,
      recipient_target: target,
      channel: 'mock_sms',
      message_body: `[SIMULATED NOTIFICATION] ${message}`,
      is_simulated: true,
      delivery_status: 'delivered',
    }
  }

  const chwNotif = formatNotification(1, 'community_health_worker', '+91-98765-00001', 'Critical hypoxia detected')
  assert.equal(chwNotif.escalation_level, 1)
  assert.equal(chwNotif.recipient_role, 'community_health_worker')
  assert.equal(chwNotif.is_simulated, true)
  assert.ok(chwNotif.message_body.startsWith('[SIMULATED NOTIFICATION]'))

  const supervisorNotif = formatNotification(2, 'supervisor', '+91-98765-00002', 'Unacknowledged hypoxia escalated to MO')
  assert.equal(supervisorNotif.escalation_level, 2)
  assert.equal(supervisorNotif.recipient_role, 'supervisor')
  assert.equal(supervisorNotif.is_simulated, true)
})
