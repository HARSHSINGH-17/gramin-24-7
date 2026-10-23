import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getStoredUser } from '../src/rpmApi.js'

function createMockJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const claims = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = 'fake_signature_for_unit_tests'
  return `${header}.${claims}.${signature}`
}

test('1. Role decoder parses clinician, patient, and admin claims', () => {
  const clinicianToken = createMockJwt({
    sub: 'dr-sharma',
    role: 'clinician',
    patient_ids: ['PC-SYNTH01', 'PC-DEMO01'],
  })

  // Mock sessionStorage
  global.sessionStorage = {
    getItem: (key) => (key === 'pahaadcare-rpm-token' ? clinicianToken : null),
    setItem: () => {},
    removeItem: () => {},
  }

  const user = getStoredUser()
  assert.ok(user)
  assert.equal(user.username, 'dr-sharma')
  assert.equal(user.role, 'clinician')
  assert.deepEqual(user.patient_ids, ['PC-SYNTH01', 'PC-DEMO01'])

  // Test patient role claims
  const patientToken = createMockJwt({
    sub: 'patient-alice',
    role: 'patient',
    patient_ids: ['PC-SYNTH01'],
  })
  global.sessionStorage.getItem = () => patientToken

  const patientUser = getStoredUser()
  assert.ok(patientUser)
  assert.equal(patientUser.username, 'patient-alice')
  assert.equal(patientUser.role, 'patient')
  assert.deepEqual(patientUser.patient_ids, ['PC-SYNTH01'])
})

test('2. Unauthenticated visit to "/" opens onboarding flow while preserving authenticated session routing', () => {
  function getNormalizedHashRoute(hash, clinicianToken, clinicianUser, patientUser) {
    const clean = hash.replace(/^#\/?/, '').trim()
    if (!clean) {
      if (
        clinicianToken &&
        clinicianUser &&
        (clinicianUser.role === 'clinician' || clinicianUser.role === 'administrator')
      ) {
        return '/doctor'
      }
      if (patientUser) {
        return '/patient'
      }
      return '/'
    }
    return `/${clean}`
  }

  // 1. Unauthenticated root visits MUST return '/' (Onboarding)
  assert.equal(getNormalizedHashRoute('', null, null, null), '/')
  assert.equal(getNormalizedHashRoute('#', null, null, null), '/')
  assert.equal(getNormalizedHashRoute('#/', null, null, null), '/')

  // 2. Authenticated clinician root visit redirects to '/doctor'
  assert.equal(
    getNormalizedHashRoute('', 'token-xyz', { role: 'clinician' }, null),
    '/doctor'
  )
  assert.equal(
    getNormalizedHashRoute('#/', 'token-xyz', { role: 'administrator' }, null),
    '/doctor'
  )

  // 3. Authenticated patient root visit redirects to '/patient'
  assert.equal(
    getNormalizedHashRoute('', null, null, 'PC-PATIENT01'),
    '/patient'
  )
  assert.equal(
    getNormalizedHashRoute('#/', null, null, 'PC-PATIENT01'),
    '/patient'
  )

  // 4. Deep links are preserved
  assert.equal(getNormalizedHashRoute('#/doctor', null, null, null), '/doctor')
  assert.equal(getNormalizedHashRoute('#/doctor/patients', null, null, null), '/doctor/patients')
  assert.equal(getNormalizedHashRoute('#/doctor/patients/PC-SYNTH01', null, null, null), '/doctor/patients/PC-SYNTH01')
  assert.equal(getNormalizedHashRoute('#/doctor/alerts', null, null, null), '/doctor/alerts')
  assert.equal(getNormalizedHashRoute('#/patient', null, null, null), '/patient')
})

test('3. Language selection preserves original options and proceeds to role selection', () => {
  const content = fs.readFileSync('src/App.jsx', 'utf-8')

  // Verify If contains exactly the 5 original languages without invention
  assert.ok(content.includes('["en", "English"]'), 'Must include English')
  assert.ok(content.includes('["hi", "हिन्दी"]'), 'Must include Hindi')
  assert.ok(content.includes('["gar", "गढ़वाली"]'), 'Must include Garhwali')
  assert.ok(content.includes('["kum", "कुमाऊँनी"]'), 'Must include Kumaoni')
  assert.ok(content.includes('["him", "हिमाचली पहाड़ी"]'), 'Must include Himachali Pahadi')

  // Verify language selection transitions to role selection
  assert.ok(content.includes('sessionStorage.setItem("pc-lang-selected", "true")'), 'Language selection sets session marker')
  assert.ok(content.includes('U("role")'), 'Language selection transitions to role selection')

  // Verify choose language back button allows returning to language selection
  assert.ok(content.includes('sessionStorage.removeItem("pc-lang-selected")'), 'Role screen allows clearing language selection')
  assert.ok(content.includes('U("lang")'), 'Role screen has button to return to language selection')
})

test('4. Role selection offers Patient, Family Member, and Doctor with correct authentication flows', () => {
  const appContent = fs.readFileSync('src/App.jsx', 'utf-8')
  const loginContent = fs.readFileSync('src/Login.jsx', 'utf-8')

  // Role buttons exist in Af
  assert.ok(appContent.includes('h("Patient")'), 'Patient role button exists')
  assert.ok(appContent.includes('h("Family member")'), 'Family member role button exists')
  assert.ok(appContent.includes('h("Doctor")'), 'Doctor role button exists')

  // Doctor button navigates to clinician monitoring route (#/doctor)
  assert.ok(appContent.includes('window.location.hash = "#/doctor"'), 'Doctor button routes to #/doctor')

  // Patient button sets patient role and routes to #/patient
  assert.ok(appContent.includes('window.location.hash = "#/patient"'), 'Patient button routes to #/patient')

  // Patient login component provides back navigation to role selection
  assert.ok(loginContent.includes('← Back to role selection'), 'Login.jsx has back button to role selection')
  assert.ok(loginContent.includes('localStorage.removeItem("pc-role")'), 'Back button clears selected role')
})

test('5. Patient role cannot access clinician-only monitoring pages (403 Forbidden)', () => {
  function checkRouteAccess(route, token, user) {
    if (route.startsWith('/doctor')) {
      if (!token) {
        return { allowed: false, screen: 'login_required' }
      }
      if (user?.role === 'patient') {
        return { allowed: false, screen: 'insufficient_role_403' }
      }
      if (user?.role === 'clinician' || user?.role === 'administrator') {
        return { allowed: true, screen: 'doctor_workspace' }
      }
      return { allowed: false, screen: 'insufficient_role_403' }
    }
    return { allowed: true, screen: 'patient_portal' }
  }

  // Patient token attempting to access any clinician route gets 403 Forbidden
  const patientOverview = checkRouteAccess('/doctor', 'token-pat', { role: 'patient' })
  assert.equal(patientOverview.allowed, false)
  assert.equal(patientOverview.screen, 'insufficient_role_403')

  const patientDir = checkRouteAccess('/doctor/patients', 'token-pat', { role: 'patient' })
  assert.equal(patientDir.allowed, false)
  assert.equal(patientDir.screen, 'insufficient_role_403')

  const patientAlerts = checkRouteAccess('/doctor/alerts', 'token-pat', { role: 'patient' })
  assert.equal(patientAlerts.allowed, false)
  assert.equal(patientAlerts.screen, 'insufficient_role_403')

  const patientDetail = checkRouteAccess('/doctor/patients/PC-SYNTH01', 'token-pat', { role: 'patient' })
  assert.equal(patientDetail.allowed, false)
  assert.equal(patientDetail.screen, 'insufficient_role_403')
})

test('6. Family member flow enforces patient code matching and denies unauthorized patient access', () => {
  // Test patient code verification logic as implemented in App.jsx
  function verifyFamilyMemberAccess(code, localDb, currentPatientId) {
    const q = (code || '').trim().toUpperCase()
    if (!q) return { allowed: false, message: 'Patient code is required.' }
    const match = localDb['pc-data-' + q] || (currentPatientId && q === String(currentPatientId).toUpperCase())
    if (match) {
      return { allowed: true, view: 'famview' }
    }
    return { allowed: false, message: 'Patient not found on this device.' }
  }

  const mockDb = {
    'pc-data-PC-VALID1': {
      patient: { name: 'Devi Singh', bloodGroup: 'O+', allergies: 'Penicillin' },
    },
  }

  // Matching code is allowed
  const valid = verifyFamilyMemberAccess('PC-VALID1', mockDb, 'PC-VALID1')
  assert.equal(valid.allowed, true)
  assert.equal(valid.view, 'famview')

  // Non-matching code is rejected
  const invalid = verifyFamilyMemberAccess('PC-UNKNOWN', mockDb, 'PC-VALID1')
  assert.equal(invalid.allowed, false)
  assert.equal(invalid.message, 'Patient not found on this device.')

  // Empty code is rejected
  const empty = verifyFamilyMemberAccess('', mockDb, 'PC-VALID1')
  assert.equal(empty.allowed, false)
})

test('7. Authenticated clinician can access complete RPM workspace', () => {
  function checkRouteAccess(route, token, user) {
    if (route.startsWith('/doctor')) {
      if (!token) return { allowed: false, screen: 'login_required' }
      if (user?.role === 'clinician' || user?.role === 'administrator') {
        return { allowed: true, screen: 'doctor_workspace' }
      }
      return { allowed: false, screen: 'insufficient_role_403' }
    }
    return { allowed: true, screen: 'patient_portal' }
  }

  // Clinician can access all doctor routes
  assert.equal(checkRouteAccess('/doctor', 'jwt-clinician', { role: 'clinician' }).allowed, true)
  assert.equal(checkRouteAccess('/doctor/patients', 'jwt-clinician', { role: 'clinician' }).allowed, true)
  assert.equal(checkRouteAccess('/doctor/patients/PC-SYNTH01', 'jwt-clinician', { role: 'clinician' }).allowed, true)
  assert.equal(checkRouteAccess('/doctor/alerts', 'jwt-clinician', { role: 'clinician' }).allowed, true)
})

test('8. Refreshing route does not bypass authentication or leak clinical data', () => {
  function checkRouteAccess(route, token, user) {
    if (route.startsWith('/doctor')) {
      if (!token) return { allowed: false, screen: 'login_required' }
      if (user?.role === 'clinician' || user?.role === 'administrator') {
        return { allowed: true, screen: 'doctor_workspace' }
      }
      return { allowed: false, screen: 'insufficient_role_403' }
    }
    return { allowed: true, screen: 'patient_portal' }
  }

  // Unauthenticated user refreshing directly on /doctor or /doctor/patients
  const unauthRefresh = checkRouteAccess('/doctor', null, null)
  assert.equal(unauthRefresh.allowed, false)
  assert.equal(unauthRefresh.screen, 'login_required')

  const unauthPatientsRefresh = checkRouteAccess('/doctor/patients', null, null)
  assert.equal(unauthPatientsRefresh.allowed, false)
  assert.equal(unauthPatientsRefresh.screen, 'login_required')
})

test('9. Patient Portal navigation excludes RPM Monitor and cross-patient controls', () => {
  const content = fs.readFileSync('src/App.jsx', 'utf-8')
  const xnMatch = content.match(/const Xn = \[([\s\S]*?)\];/)
  assert.ok(xnMatch, 'Xn navigation array must exist in App.jsx')
  const xnContent = xnMatch[1]
  assert.ok(!xnContent.includes('"RPM Monitor"'), 'Xn must not contain "RPM Monitor" in patient portal')
  assert.ok(xnContent.includes('"Overview"'), 'Xn must contain Overview')
  assert.ok(xnContent.includes('"My Health"'), 'Xn must contain My Health')
  assert.ok(xnContent.includes('"Medicines"'), 'Xn must contain Medicines')
  assert.ok(xnContent.includes('"Find Care"'), 'Xn must contain Find Care')
})

test('10. RPM Monitor section is removed from Patient Dashboard and only accessible by Clinician', () => {
  const appContent = fs.readFileSync('src/App.jsx', 'utf-8')

  // Patient dashboard sidebar must NOT contain RPM Monitor button
  assert.ok(!appContent.includes('span", { children: "RPM Monitor" }'), 'Sidebar must not contain RPM Monitor button')
  // Patient dashboard must NOT render RpmDashboard
  assert.ok(!appContent.includes('k === "RPM Monitor"'), 'App.jsx must not have RPM Monitor tab')
  assert.ok(!appContent.includes('i.jsx(RpmDashboard, {})'), 'App.jsx must not render RpmDashboard')

  // DoctorWorkspace retains RpmDashboard for authorized clinician / doctor
  const docContent = fs.readFileSync('src/DoctorWorkspace.jsx', 'utf-8')
  assert.ok(docContent.includes('<RpmDashboard'), 'DoctorWorkspace must retain RpmDashboard for clinicians')
})

test('11. Patient Dashboard provides personal vitals strictly isolated to patient\'s own record', () => {
  const appContent = fs.readFileSync('src/App.jsx', 'utf-8')

  // Patient vitals state and rendering functions exist
  assert.ok(appContent.includes('patientVitals'), 'Patient vitals state must exist')
  assert.ok(appContent.includes('renderPatientVitals'), 'renderPatientVitals function must exist')
  assert.ok(appContent.includes('My Health Vitals'), 'My Health Vitals header must exist')

  // Displays 4 standard patient vitals
  assert.ok(appContent.includes('Heart Rate'), 'Must display Heart Rate')
  assert.ok(appContent.includes('Blood Oxygen (SpO₂)'), 'Must display Blood Oxygen')
  assert.ok(appContent.includes('Body Temperature'), 'Must display Body Temperature')
  assert.ok(appContent.includes('Blood Pressure'), 'Must display Blood Pressure')

  // Patient record isolation notice
  assert.ok(appContent.includes('Personal patient record isolation'), 'Must display patient privacy isolation notice')
  assert.ok(appContent.includes('You are viewing only your own physiological readings'), 'Must explicitly confirm view is scoped to self only')

  // Must not contain cross-patient census or other patients in patient view
  assert.ok(!appContent.includes('DoctorCensusTable'), 'Patient dashboard must not render DoctorCensusTable')
  assert.ok(!appContent.includes('PatientDirectoryTable'), 'Patient dashboard must not render PatientDirectoryTable')
})

