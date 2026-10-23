import React from 'react'
import App from './App'
import DoctorWorkspace from './DoctorWorkspace'
import ClinicianLogin from './ClinicianLogin'
import { getStoredToken, getStoredUser, clearStoredToken } from './rpmApi'
import { AlertTriangle, ShieldAlert } from 'lucide-react'

function getNormalizedHashRoute() {
  const hash = typeof window !== 'undefined' ? window.location.hash : ''
  const clean = hash.replace(/^#\/?/, '').trim()
  if (!clean) {
    // Check role-based default landing only when an active authenticated session exists
    const clinicianToken = getStoredToken()
    const clinicianUser = getStoredUser()
    if (
      clinicianToken &&
      clinicianUser &&
      (clinicianUser.role === 'clinician' || clinicianUser.role === 'administrator')
    ) {
      return '/doctor'
    }
    const patientUser = typeof localStorage !== 'undefined' && localStorage.getItem('pc-auth-user')
    if (patientUser) {
      return '/patient'
    }
    return '/'
  }
  return `/${clean}`
}

export default function PortalRouter() {
  const [currentRoute, setCurrentRoute] = React.useState(() => getNormalizedHashRoute())
  const [, setTick] = React.useState(0)
  const forceUpdate = React.useCallback(() => setTick((t) => t + 1), [])

  React.useEffect(() => {
    const handleHashChange = () => {
      const nextRoute = getNormalizedHashRoute()
      setCurrentRoute(nextRoute)
    }

    window.addEventListener('hashchange', handleHashChange)
    // Synchronize initial hash if not set
    if (!window.location.hash) {
      window.location.hash = '#' + currentRoute
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [currentRoute])

  const navigate = (path) => {
    const clean = path.startsWith('/') ? path : `/${path}`
    window.location.hash = `#${clean}`
    setCurrentRoute(clean)
  }

  // Check clinician authorization
  const token = getStoredToken()
  const user = getStoredUser()
  const isClinicianOrAdmin = Boolean(
    token && user && (user.role === 'clinician' || user.role === 'administrator')
  )
  const isPatientRole = Boolean(
    (token && user && user.role === 'patient') ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('pc-role') === 'patient' && !isClinicianOrAdmin) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('pc-auth-user') && !isClinicianOrAdmin)
  )

  // Route 1: Doctor routes (/doctor, /doctor/patients, /doctor/patients/:id, /doctor/alerts)
  if (currentRoute.startsWith('/doctor')) {
    // Authenticated but wrong role (e.g. Patient role trying to access clinician portal)
    if (isPatientRole) {
      return (
        <div className="rpm-auth-gate-page">
          <div className="rpm-auth-card">
            <div className="rpm-auth-logo" style={{ background: '#fef2f2', color: '#dc2626' }}>
              <ShieldAlert size={32} />
            </div>
            <span className="rpm-auth-eyebrow" style={{ color: '#dc2626' }}>ACCESS FORBIDDEN (403)</span>
            <h2>Clinician Role Required</h2>
            <p className="rpm-auth-subtitle">
              Your active session is signed in with the <strong>Patient</strong> role. Cross-patient
              monitoring, alert triage, and the clinical census are restricted to authorized healthcare professionals.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
              <button
                className="button button-primary rpm-btn-block"
                onClick={() => navigate('/patient')}
              >
                Go to Patient Portal
              </button>
              <button
                className="button button-secondary rpm-btn-block"
                onClick={() => {
                  clearStoredToken()
                  forceUpdate()
                }}
              >
                Sign In with Clinician Credentials
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Clinician Workspace (renders DoctorWorkspace shell with layout, topbar, and dedicated views)
    return (
      <DoctorWorkspace
        currentRoute={currentRoute}
        onNavigate={navigate}
        onLogout={() => {
          clearStoredToken()
          forceUpdate()
        }}
      />
    )
  }

  // Route 2: Patient Portal (/patient)
  if (currentRoute.startsWith('/patient')) {
    return <App />
  }

  // Fallback: Default to patient portal
  return <App />
}
