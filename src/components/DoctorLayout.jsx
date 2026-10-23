import React from 'react'
import DoctorNavigation from './DoctorNavigation'
import DoctorTopbar from './DoctorTopbar'

/**
 * DoctorLayout: dedicated clinician workspace shell.
 * Integrates sidebar navigation, top bar with breadcrumbs and live indicators,
 * and a standardized responsive main content region.
 */
export default function DoctorLayout({
  currentRoute = '/doctor',
  user,
  isOnline = true,
  syncState = null,
  onSyncNow = null,
  lastRefresh = null,
  onRefresh,
  refreshing = false,
  onSignOut,
  onNavigate,
  children,
}) {
  return (
    <div className="doc-layout">
      {/* Skip to main content link for keyboard accessibility */}
      <a href="#doc-main-content" className="doc-skip-link">
        Skip to main clinical content
      </a>

      {/* Navigation Sidebar */}
      <DoctorNavigation
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        user={user}
      />

      {/* Main Workspace Frame */}
      <div className="doc-frame">
        {/* Top Header Bar */}
        <DoctorTopbar
          currentRoute={currentRoute}
          user={user}
          isOnline={isOnline}
          syncState={syncState}
          onSyncNow={onSyncNow}
          lastRefresh={lastRefresh}
          onRefresh={onRefresh}
          refreshing={refreshing}
          onSignOut={onSignOut}
        />

        {/* Primary Content Region */}
        <main id="doc-main-content" className="doc-main" tabIndex="-1">
          <div className="doc-content-container">{children}</div>
        </main>
      </div>
    </div>
  )
}
