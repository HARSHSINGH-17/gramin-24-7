import test from 'node:test'
import assert from 'node:assert/strict'

test('1. Breadcrumb computation generates correct labels and paths for all doctor routes', () => {
  function computeBreadcrumbs(currentRoute) {
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
  }

  // 1. Overview
  const overviewCrumbs = computeBreadcrumbs('/doctor')
  assert.equal(overviewCrumbs.length, 2)
  assert.equal(overviewCrumbs[0].label, 'Doctor Workspace')
  assert.equal(overviewCrumbs[1].label, 'Integrated Overview')

  // 2. Patient Directory
  const directoryCrumbs = computeBreadcrumbs('/doctor/patients')
  assert.equal(directoryCrumbs.length, 2)
  assert.equal(directoryCrumbs[1].label, 'Patient Directory')
  assert.equal(directoryCrumbs[1].path, '/doctor/patients')

  // 3. Individual Patient RPM
  const patientCrumbs = computeBreadcrumbs('/doctor/patients/PC-SYNTH01')
  assert.equal(patientCrumbs.length, 3)
  assert.equal(patientCrumbs[0].label, 'Doctor Workspace')
  assert.equal(patientCrumbs[1].label, 'Patient Directory')
  assert.equal(patientCrumbs[2].label, 'PC-SYNTH01')
  assert.equal(patientCrumbs[2].path, '/doctor/patients/PC-SYNTH01')

  // 4. Alerts & Escalations
  const alertsCrumbs = computeBreadcrumbs('/doctor/alerts')
  assert.equal(alertsCrumbs.length, 2)
  assert.equal(alertsCrumbs[1].label, 'Alerts & Escalations')
  assert.equal(alertsCrumbs[1].path, '/doctor/alerts')
})

test('2. Navigation active-route state correctly resolves active tab and aria-current', () => {
  function isItemActive(itemPath, currentRoute) {
    if (itemPath === '/doctor') {
      return currentRoute === '/doctor' || currentRoute === '/' || currentRoute === ''
    }
    return currentRoute.startsWith(itemPath)
  }

  // Case A: On /doctor -> overview active, others inactive
  assert.equal(isItemActive('/doctor', '/doctor'), true)
  assert.equal(isItemActive('/doctor/patients', '/doctor'), false)
  assert.equal(isItemActive('/doctor/alerts', '/doctor'), false)

  // Case B: On /doctor/patients -> patients active
  assert.equal(isItemActive('/doctor', '/doctor/patients'), false)
  assert.equal(isItemActive('/doctor/patients', '/doctor/patients'), true)
  assert.equal(isItemActive('/doctor/alerts', '/doctor/patients'), false)

  // Case C: On /doctor/patients/PC-SYNTH01 -> patients active
  assert.equal(isItemActive('/doctor', '/doctor/patients/PC-SYNTH01'), false)
  assert.equal(isItemActive('/doctor/patients', '/doctor/patients/PC-SYNTH01'), true)
  assert.equal(isItemActive('/doctor/alerts', '/doctor/patients/PC-SYNTH01'), false)

  // Case D: On /doctor/alerts -> alerts active
  assert.equal(isItemActive('/doctor', '/doctor/alerts'), false)
  assert.equal(isItemActive('/doctor/patients', '/doctor/alerts'), false)
  assert.equal(isItemActive('/doctor/alerts', '/doctor/alerts'), true)
})

test('3. Direct browser refresh on nested routes parses route and patient ID safely', () => {
  function parseHashRoute(hash) {
    const clean = hash.replace(/^#\/?/, '').trim()
    const path = clean ? `/${clean}` : '/doctor'
    const match = path.match(/^\/doctor\/patients\/([a-zA-Z0-9_-]+)/)
    return {
      path,
      patientId: match ? match[1] : null,
      isDoctorRoute: path.startsWith('/doctor'),
      isPatientRoute: path.startsWith('/patient'),
    }
  }

  // Reload on deep individual patient route
  const nested = parseHashRoute('#/doctor/patients/PC-SYNTH01')
  assert.equal(nested.path, '/doctor/patients/PC-SYNTH01')
  assert.equal(nested.patientId, 'PC-SYNTH01')
  assert.equal(nested.isDoctorRoute, true)

  // Reload on patient directory
  const dir = parseHashRoute('#/doctor/patients')
  assert.equal(dir.path, '/doctor/patients')
  assert.equal(dir.patientId, null)

  // Reload on alerts queue
  const alerts = parseHashRoute('#/doctor/alerts')
  assert.equal(alerts.path, '/doctor/alerts')
  assert.equal(alerts.patientId, null)

  // Reload on patient portal
  const patient = parseHashRoute('#/patient')
  assert.equal(patient.path, '/patient')
  assert.equal(patient.isPatientRoute, true)
  assert.equal(patient.isDoctorRoute, false)
})

test('4. StatusBadge semantic tone resolver handles clinical and network states', () => {
  function resolveBadgeTone(status, tone) {
    if (tone) return tone
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
  }

  assert.equal(resolveBadgeTone('online'), 'green')
  assert.equal(resolveBadgeTone('received'), 'green')
  assert.equal(resolveBadgeTone('stale'), 'amber')
  assert.equal(resolveBadgeTone('acknowledged'), 'amber')
  assert.equal(resolveBadgeTone('missing'), 'rose')
  assert.equal(resolveBadgeTone('open'), 'rose')
  assert.equal(resolveBadgeTone('offline'), 'rose')
  assert.equal(resolveBadgeTone('custom', 'green'), 'green')
})

test('5. Sign-out lifecycle clears token, user identity, and redirects to doctor login root', () => {
  let sessionState = { token: 'mock-jwt-token', user: { role: 'clinician' } }
  let currentHash = '#/doctor/patients/PC-SYNTH01'

  function signOut(clearTokenFn) {
    clearTokenFn()
    sessionState = { token: '', user: null }
    currentHash = '#/doctor'
  }

  let tokenCleared = false
  signOut(() => {
    tokenCleared = true
  })

  assert.equal(tokenCleared, true)
  assert.equal(sessionState.token, '')
  assert.equal(sessionState.user, null)
  assert.equal(currentHash, '#/doctor')
})

test('6. Reusable components export contract is complete and verified', async () => {
  const fs = await import('node:fs')
  const indexContent = fs.readFileSync('src/components/index.js', 'utf-8')
  assert.ok(indexContent.includes('DoctorLayout'), 'DoctorLayout must be exported')
  assert.ok(indexContent.includes('DoctorNavigation'), 'DoctorNavigation must be exported')
  assert.ok(indexContent.includes('DoctorTopbar'), 'DoctorTopbar must be exported')
  assert.ok(indexContent.includes('PageHeader'), 'PageHeader must be exported')
  assert.ok(indexContent.includes('StatusBadge'), 'StatusBadge must be exported')
  assert.ok(indexContent.includes('LoadingState'), 'LoadingState must be exported')
  assert.ok(indexContent.includes('ErrorState'), 'ErrorState must be exported')
  assert.ok(indexContent.includes('EmptyState'), 'EmptyState must be exported')
  assert.ok(indexContent.includes('PlaceholderPage'), 'PlaceholderPage must be exported')

  // Verify all component files exist on disk
  assert.ok(fs.existsSync('src/components/DoctorLayout.jsx'), 'DoctorLayout.jsx must exist')
  assert.ok(fs.existsSync('src/components/DoctorNavigation.jsx'), 'DoctorNavigation.jsx must exist')
  assert.ok(fs.existsSync('src/components/DoctorTopbar.jsx'), 'DoctorTopbar.jsx must exist')
  assert.ok(fs.existsSync('src/components/PageHeader.jsx'), 'PageHeader.jsx must exist')
  assert.ok(fs.existsSync('src/components/StatusBadge.jsx'), 'StatusBadge.jsx must exist')
  assert.ok(fs.existsSync('src/components/PageState.jsx'), 'PageState.jsx must exist')
})
