import './storageSafety'
import React from 'react'
import { createRoot } from 'react-dom/client'
import PortalRouter from './PortalRouter'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PortalRouter />
  </React.StrictMode>,
)
