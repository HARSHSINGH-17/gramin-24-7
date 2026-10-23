import React from 'react'
import {
  Activity,
  AlertTriangle,
  HeartPulse,
  Home,
  LogOut,
  Menu,
  ShieldCheck,
  User,
  Users,
  X,
  ExternalLink,
} from 'lucide-react'

/**
 * DoctorNavigation provides the desktop sidebar and responsive tablet/mobile navigation.
 */
export default function DoctorNavigation({
  currentRoute = '/doctor',
  onNavigate,
  onSignOut,
  user,
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const navItems = [
    {
      id: 'overview',
      name: 'RPM Monitor',
      path: '/doctor',
      icon: Activity,
      label: 'Integrated Overview',
    },
    {
      id: 'patients',
      name: 'Patient Directory',
      path: '/doctor/patients',
      icon: Users,
      label: 'Patient Directory',
    },
    {
      id: 'alerts',
      name: 'Alerts & Escalations',
      path: '/doctor/alerts',
      icon: AlertTriangle,
      label: 'Alerts & Escalations',
    },
  ]

  const handleNavClick = (path) => {
    if (onNavigate) {
      onNavigate(path)
    } else {
      window.location.hash = '#' + path
    }
    setMobileOpen(false)
  }

  const isItemActive = (path) => {
    if (path === '/doctor') {
      return currentRoute === '/doctor' || currentRoute === '/' || currentRoute === ''
    }
    return currentRoute.startsWith(path)
  }

  return (
    <>
      {/* Mobile/Tablet Header Toggle */}
      <div className="doc-mobile-header" role="banner">
        <div className="doc-brand-compact">
          <div className="doc-brand-mark">
            <HeartPulse size={20} />
          </div>
          <span className="doc-brand-title">PahaadCare Doctor</span>
        </div>
        <button
          type="button"
          className="doc-mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close clinical menu' : 'Open clinical menu'}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Backdrop for mobile drawer */}
      {mobileOpen && (
        <div
          className="doc-nav-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`doc-sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Clinician Navigation Sidebar"
      >
        <div className="doc-sidebar-header">
          <div className="doc-brand">
            <div className="doc-brand-mark" aria-hidden="true">
              <HeartPulse size={22} />
            </div>
            <div>
              <strong className="doc-brand-name">PahaadCare</strong>
              <small className="doc-brand-sub">CLINICIAN WORKSPACE</small>
            </div>
          </div>
        </div>

        <div className="doc-nav-section-label">CLINICAL NAVIGATION</div>

        <nav className="doc-nav-list" role="navigation" aria-label="Clinician Workspace Navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isItemActive(item.path)
            return (
              <button
                key={item.id}
                type="button"
                className={`doc-nav-item ${active ? 'active' : ''}`}
                onClick={() => handleNavClick(item.path)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="doc-nav-text">{item.name}</span>
                {item.id === 'overview' && (
                  <span className="doc-nav-badge" aria-label="Live monitoring">RPM</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="doc-sidebar-spacer" />

        {/* User Card */}
        {user && (
          <div className="doc-sidebar-user" role="region" aria-label="Active Clinician">
            <div className="doc-user-avatar" aria-hidden="true">
              <User size={16} />
            </div>
            <div className="doc-user-info">
              <span className="doc-user-name">{user.username || 'Clinician'}</span>
              <span className="doc-user-role">
                <ShieldCheck size={11} aria-hidden="true" />
                <span>{user.role?.toUpperCase() || 'CLINICIAN'}</span>
              </span>
            </div>
          </div>
        )}

        {/* Sidebar Footer Controls */}
        <div className="doc-sidebar-bottom">
          <button
            type="button"
            className="doc-nav-item doc-portal-switch"
            onClick={() => {
              window.location.hash = '#/patient'
              setMobileOpen(false)
            }}
            title="Switch to patient self-service portal"
          >
            <ExternalLink size={16} aria-hidden="true" />
            <span>Patient Portal</span>
          </button>

          {user ? (
            <button
              type="button"
              className="doc-nav-item doc-logout-btn"
              onClick={() => {
                if (onSignOut) onSignOut()
                setMobileOpen(false)
              }}
            >
              <LogOut size={16} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          ) : (
            <button
              type="button"
              className="doc-nav-item doc-logout-btn"
              onClick={() => {
                window.location.hash = '#/'
                setMobileOpen(false)
              }}
            >
              <LogOut size={16} aria-hidden="true" />
              <span>Exit to Onboarding</span>
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
