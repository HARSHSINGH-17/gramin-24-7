import React from 'react'

/**
 * Reusable PageHeader for Doctor Workspace views.
 * Supports eyebrow/tag, h1 heading, subheading/description, and optional action buttons.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = '',
}) {
  return (
    <header className={`doc-page-header ${className}`} aria-labelledby="doc-page-title">
      <div className="doc-page-header-main">
        {eyebrow && <span className="doc-eyebrow">{eyebrow}</span>}
        <h1 id="doc-page-title" className="doc-page-title">
          {title}
        </h1>
        {description && <p className="doc-page-description">{description}</p>}
        {children}
      </div>
      {actions && <div className="doc-page-header-actions">{actions}</div>}
    </header>
  )
}
