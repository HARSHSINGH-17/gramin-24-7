import React from 'react'
import { CheckCircle2, Database, HeartPulse, Lock, Mail, ShieldAlert, ShieldCheck, User, UserPlus } from 'lucide-react'
import { checkBackendHealth, loginClinician, registerUser } from './rpmApi'

export default function ClinicianLogin({ onLoginSuccess, onGoToPatientPortal }) {
  const [activeTab, setActiveTab] = React.useState('login') // 'login' | 'register'
  const [username, setUsername] = React.useState('dr.sharma')
  const [password, setPassword] = React.useState('Sharma@Gramin2026')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [successMsg, setSuccessMsg] = React.useState('')

  // Registration fields
  const [regFullName, setRegFullName] = React.useState('')
  const [regEmail, setRegEmail] = React.useState('')
  const [regUsername, setRegUsername] = React.useState('')
  const [regRole, setRegRole] = React.useState('clinician')
  const [regPassword, setRegPassword] = React.useState('')
  const [regInvitationCode, setRegInvitationCode] = React.useState('')

  // Backend health state
  const [backendStatus, setBackendStatus] = React.useState({
    checking: true,
    online: false,
    database: 'local',
  })

  React.useEffect(() => {
    let isMounted = true
    checkBackendHealth()
      .then((res) => {
        if (!isMounted) return
        if (res.ok) {
          setBackendStatus({
            checking: false,
            online: true,
            database: res.data?.database || 'connected',
          })
        } else {
          setBackendStatus({ checking: false, online: false, database: 'offline' })
        }
      })
      .catch(() => {
        if (isMounted) setBackendStatus({ checking: false, online: false, database: 'offline' })
      })
    return () => {
      isMounted = false
    }
  }, [])

  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)
    try {
      await loginClinician(username.trim(), password)
      if (onLoginSuccess) onLoginSuccess()
    } catch (err) {
      setError(err.message || 'Failed to authenticate clinician credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterSubmit = async (e) => {
    if (e) e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (regPassword.length < 12) {
      setError('Password must be at least 12 characters long.')
      return
    }

    setLoading(true)
    try {
      await registerUser({
        username: regUsername.trim(),
        email: regEmail.trim(),
        password: regPassword,
        role: regRole,
        full_name: regFullName.trim(),
        invitation_code: regInvitationCode.trim() || undefined,
      })
      setSuccessMsg('Account registered successfully! Signing in...')
      setTimeout(() => {
        if (onLoginSuccess) onLoginSuccess()
      }, 500)
    } catch (err) {
      setError(err.message || 'Failed to register new clinician account.')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoSignIn = async () => {
    setUsername('dr.sharma')
    setPassword('Sharma@Gramin2026')
    setError('')
    setSuccessMsg('Signing in as Dr. Sunita Sharma...')
    setLoading(true)
    try {
      await loginClinician('dr.sharma', 'Sharma@Gramin2026')
      if (onLoginSuccess) onLoginSuccess()
    } catch (err) {
      try {
        await loginClinician('clinician1', 'demo-password-2026')
        if (onLoginSuccess) onLoginSuccess()
      } catch {
        setError(err.message || 'Failed to authenticate demo clinician.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rpm-auth-gate-page">
      <div className="rpm-auth-card">
        <div className="rpm-auth-logo">
          <HeartPulse size={32} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fcd34d',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d97706', display: 'inline-block' }} />
            SIMULATED DATA — DEMO ONLY
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: backendStatus.online ? '#ecfdf5' : '#fef2f2',
              color: backendStatus.online ? '#065f46' : '#991b1b',
              border: `1px solid ${backendStatus.online ? '#a7f3d0' : '#fecaca'}`,
            }}
          >
            <Database size={12} />
            {backendStatus.checking
              ? 'Checking Live Database...'
              : backendStatus.online
              ? `Live Database: ${backendStatus.database.toUpperCase()}`
              : 'Offline Demo Fallback'}
          </span>
        </div>

        <span className="rpm-auth-eyebrow">PROTECTED RPM CLINICAL WORKSPACE</span>
        <h2>{activeTab === 'login' ? 'Sign in to monitoring' : 'Register Clinician'}</h2>
        <p className="rpm-auth-subtitle">
          {activeTab === 'login'
            ? 'Authorized access for physicians, tele-health supervisors, and rural care coordinators.'
            : 'Register a new clinical medical officer or administrator into the live database.'}
        </p>

        {/* Auth mode toggle tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('login')
              setError('')
              setSuccessMsg('')
            }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              border: activeTab === 'login' ? '1px solid #0d9488' : '1px solid #e2e8f0',
              background: activeTab === 'login' ? '#0d9488' : '#ffffff',
              color: activeTab === 'login' ? '#ffffff' : '#475569',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register')
              setError('')
              setSuccessMsg('')
            }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              border: activeTab === 'register' ? '1px solid #0d9488' : '1px solid #e2e8f0',
              background: activeTab === 'register' ? '#0d9488' : '#ffffff',
              color: activeTab === 'register' ? '#ffffff' : '#475569',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Register Clinician
          </button>
        </div>

        {error && (
          <p className="rpm-login-error" role="alert">
            {error}
          </p>
        )}

        {successMsg && (
          <p
            role="status"
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle2 size={16} />
            {successMsg}
          </p>
        )}

        {activeTab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="rpm-auth-form">
            <label>
              <span>Clinician Username or Email</span>
              <div className="rpm-input-wrap">
                <User size={16} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="dr.sharma or clinician1"
                  required
                  autoComplete="username"
                />
              </div>
            </label>

            <label>
              <span>Password</span>
              <div className="rpm-input-wrap">
                <Lock size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
            </label>

            <button
              type="submit"
              className="button button-primary rpm-btn-block"
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign in to Live Portal'}
            </button>

            <button
              type="button"
              className="button button-secondary rpm-btn-block"
              onClick={handleDemoSignIn}
              disabled={loading}
            >
              <ShieldCheck size={16} />
              Quick Demo Clinician Sign In
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="rpm-auth-form">
            <label>
              <span>Full Name</span>
              <div className="rpm-input-wrap">
                <User size={16} />
                <input
                  type="text"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="Dr. Sunita Sharma"
                  required
                />
              </div>
            </label>

            <label>
              <span>Email Address</span>
              <div className="rpm-input-wrap">
                <Mail size={16} />
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="doctor@hospital.org"
                  required
                />
              </div>
            </label>

            <label>
              <span>Username</span>
              <div className="rpm-input-wrap">
                <User size={16} />
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="dr.sharma"
                  required
                  autoComplete="username"
                />
              </div>
            </label>

            <label>
              <span>Role</span>
              <select
                value={regRole}
                onChange={(e) => setRegRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  marginTop: '4px',
                  marginBottom: '12px',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="clinician">Clinician (Physician / Medical Officer)</option>
                <option value="administrator">System Administrator</option>
              </select>
            </label>

            <label>
              <span>Administrative Provisioning Key</span>
              <div className="rpm-input-wrap">
                <ShieldCheck size={16} />
                <input
                  type="password"
                  value={regInvitationCode}
                  onChange={(e) => setRegInvitationCode(e.target.value)}
                  placeholder="Hospital IT Provisioning Key"
                  autoComplete="off"
                />
              </div>
              <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                Required for direct clinician self-registration. Alternatively, accounts can be provisioned by a system administrator.
              </small>
            </label>

            <label>
              <span>Password (12+ characters)</span>
              <div className="rpm-input-wrap">
                <Lock size={16} />
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </div>
            </label>

            <button
              type="submit"
              className="button button-primary rpm-btn-block"
              disabled={loading}
            >
              <UserPlus size={16} />
              {loading ? 'Creating Account...' : 'Register into Live Database'}
            </button>
          </form>
        )}

        <div className="rpm-auth-footer">
          <button
            type="button"
            className="rpm-link-btn"
            onClick={onGoToPatientPortal}
          >
            ← Switch to Patient Portal
          </button>
          <p className="rpm-auth-disclaimer">
            Gramin 24*7 Rural Tele-Health Platform · Connected to Real Live Telemetry & PostgreSQL.
          </p>
        </div>
      </div>
    </div>
  )
}

