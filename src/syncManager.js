/**
 * PahaadCare RPM Synchronization Manager
 * Milestone 3: Durable Offline Event Queue and Synchronization
 *
 * Coordinates durable offline synchronization between IndexedDB and FastAPI.
 * Responsibilities:
 * - Single-flight sync guard (prevents concurrent/overlapping requests).
 * - Bounded batching (up to 100 events per request).
 * - Exponential backoff with jitter for transient network failures.
 * - Per-event response reconciliation (accepted, duplicate, conflict, rejected).
 * - Crash and network error preservation: restores in-flight events to pending.
 * - Handles 401 session expiration by pausing until reauthenticated.
 * - Handles 403 access denial without infinite retry loops.
 * - Dispatches state updates to UI subscribers (isOnline, isSyncing, queueSummary).
 */

import {
  QUEUE_STATUS,
  getPendingEvents,
  markEventsSending,
  markEventDelivered,
  markEventConflict,
  markEventFailed,
  resetSendingToPending,
  getQueueSummary,
  clearAllQueueEvents,
} from './offlineQueue.js'
import {
  syncBatchEvents,
  getStoredToken,
  getStoredUser,
  SessionExpiredError,
  AccessDeniedError,
} from './rpmApi.js'

export const MAX_SYNC_BATCH_SIZE = 100
const INITIAL_BACKOFF_MS = 2000
const MAX_BACKOFF_MS = 30000
const JITTER_RANGE_MS = 1000

class SyncManager {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
    this.isSyncing = false
    this.lastSyncTime = null
    this.consecutiveFailures = 0
    this.isPausedOnAuth = false
    this.lastSyncSummary = null
    this.lastSyncError = null
    this.listeners = new Set()
    this.retryTimer = null
    this.currentSyncPromise = null
    this.initialized = false

    this._onOnline = this._onOnline.bind(this)
    this._onOffline = this._onOffline.bind(this)
  }

  /**
   * Subscribe to sync manager status changes
   */
  subscribe(callback) {
    this.listeners.add(callback)
    this.getSnapshot().then((snapshot) => {
      if (this.listeners.has(callback)) {
        callback(snapshot)
      }
    })
    return () => {
      this.listeners.delete(callback)
    }
  }

  /**
   * Produce current status snapshot
   */
  async getSnapshot() {
    const user = getStoredUser()
    const currentUser = user?.username || null
    const queueSummary = await getQueueSummary({ currentUser })
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      consecutiveFailures: this.consecutiveFailures,
      isPausedOnAuth: this.isPausedOnAuth,
      lastSyncSummary: this.lastSyncSummary,
      lastSyncError: this.lastSyncError,
      queueSummary,
      currentUser,
    }
  }

  async _notify() {
    const snapshot = await this.getSnapshot()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {}
    }
  }

  /**
   * Initialize browser event listeners and crash recovery
   */
  async init() {
    if (this.initialized) return
    this.initialized = true

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._onOnline)
      window.addEventListener('offline', this._onOffline)
    }

    // Crash recovery: recover any events orphaned in 'sending' state
    await resetSendingToPending()
    await this._notify()

    // Initial sync trigger if online and authenticated
    if (this.isOnline && getStoredToken()) {
      this.syncNow().catch(() => {})
    }
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this._onOnline)
      window.removeEventListener('offline', this._onOffline)
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.listeners.clear()
    this.initialized = false
  }

  _onOnline() {
    this.isOnline = true
    this.lastSyncError = null
    this.consecutiveFailures = 0
    this._notify()
    if (getStoredToken()) {
      this.syncNow().catch(() => {})
    }
  }

  _onOffline() {
    this.isOnline = false
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this._notify()
  }

  setOnlineStatus(online) {
    if (online) {
      this._onOnline()
    } else {
      this._onOffline()
    }
  }

  /**
   * Resume synchronization after clinician authentication
   */
  resumeAfterAuth() {
    this.isPausedOnAuth = false
    this.consecutiveFailures = 0
    this.lastSyncError = null
    this._notify()
    if (this.isOnline) {
      this.syncNow().catch(() => {})
    }
  }

  /**
   * Clear all offline queue events (recovery / user flush)
   */
  async clearAllQueue() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    await clearAllQueueEvents()
    this.consecutiveFailures = 0
    this.lastSyncError = null
    await this._notify()
  }

  /**
   * Calculate next backoff interval with jitter
   */
  _calculateBackoff() {
    const exponential = Math.min(
      MAX_BACKOFF_MS,
      INITIAL_BACKOFF_MS * Math.pow(2, Math.max(0, this.consecutiveFailures - 1))
    )
    const jitter = (Math.random() - 0.5) * JITTER_RANGE_MS
    return Math.max(1000, Math.floor(exponential + jitter))
  }

  /**
   * Trigger synchronization immediately
   * Single-flight guarded: returns active promise if already in-flight.
   */
  syncNow({ force = false, signal = null } = {}) {
    if (this.isSyncing && this.currentSyncPromise) {
      return this.currentSyncPromise
    }

    this.currentSyncPromise = this._executeSync({ force, signal }).finally(() => {
      this.currentSyncPromise = null
    })

    return this.currentSyncPromise
  }

  async _executeSync({ force = false, signal = null } = {}) {
    if (!this.isOnline && !force) {
      return { skipped: 'offline' }
    }

    const token = getStoredToken()
    if (!token) {
      this.isPausedOnAuth = true
      await this._notify()
      return { skipped: 'unauthenticated' }
    }

    this.isSyncing = true
    this.lastSyncError = null
    await this._notify()

    let batch = []
    let sendingEvents = []
    try {
      const user = getStoredUser()
      const currentUser = user?.username || null

      // 1. Fetch up to 100 pending events bound to current authenticated user
      batch = await getPendingEvents(MAX_SYNC_BATCH_SIZE, { enqueuedBy: currentUser })
      if (!batch.length) {
        this.isSyncing = false
        await this._notify()
        return { total: 0, accepted: 0, duplicate: 0, conflict: 0, rejected: 0 }
      }

      // 2. Mark batch as 'sending' in durable storage
      sendingEvents = await markEventsSending(batch.map((e) => e.event_id))
      await this._notify()

      // 3. Dispatch batch to backend sync endpoint
      const result = await syncBatchEvents(sendingEvents, {
        signal,
        onUnauthorized: () => {
          this.isPausedOnAuth = true
        },
      })

      // 4. Per-event reconciliation according to exact contract:
      // - accepted: confirmed server delivery
      // - duplicate: idempotent retry acknowledged
      // - conflict: preserved as conflict for clinician inspection
      // - rejected: preserved as failed with error reason
      const serverItems = result?.items || []
      const itemMap = new Map(serverItems.map((item) => [item.event_id, item]))

      for (const event of sendingEvents) {
        const serverStatus = itemMap.get(event.event_id)
        if (!serverStatus) {
          // Ambiguous: if backend didn't return an item for this event, restore to pending
          await resetSendingToPending()
          continue
        }

        if (serverStatus.status === 'accepted') {
          await markEventDelivered(event.event_id, {
            serverStatus: 'accepted',
            receivedAt: serverStatus.received_at,
            alertIds: serverStatus.alert_ids || [],
          })
        } else if (serverStatus.status === 'duplicate') {
          await markEventDelivered(event.event_id, {
            serverStatus: 'duplicate',
            receivedAt: serverStatus.received_at,
            alertIds: serverStatus.alert_ids || [],
          })
        } else if (serverStatus.status === 'conflict') {
          await markEventConflict(event.event_id, serverStatus.error || 'event_id_conflict')
        } else if (serverStatus.status === 'rejected') {
          await markEventFailed(event.event_id, serverStatus.error || 'rejected')
        }
      }

      this.consecutiveFailures = 0
      this.lastSyncTime = new Date()
      this.lastSyncSummary = result?.summary || null
      this.lastSyncError = null

      // Check if more pending events remain to sync for current user
      const remaining = await getPendingEvents(1, { enqueuedBy: currentUser })
      if (remaining.length > 0 && this.isOnline && !this.isPausedOnAuth) {
        // Schedule immediate next batch
        setTimeout(() => this.syncNow().catch(() => {}), 100)
      }

      return result?.summary || { total: batch.length }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        this.isPausedOnAuth = true
        this.lastSyncError = 'Session expired. Please sign in to resume synchronization.'
        // Revert batch from 'sending' back to 'pending'
        await resetSendingToPending()
      } else if (error instanceof AccessDeniedError) {
        this.lastSyncError = error.message
        // Mark events as failed to avoid infinite retry loops
        for (const ev of sendingEvents) {
          await markEventFailed(ev.event_id, error.message)
        }
      } else if (error?.status === 422 || error?.code === 'validation_error' || (error?.message && error.message.includes('invalid fields'))) {
        // Permanent payload rejection: mark sending events as failed so queue is not blocked
        this.lastSyncError = error.message || 'Request contains invalid fields.'
        for (const ev of sendingEvents) {
          await markEventFailed(ev.event_id, error.message || 'validation_error')
        }
      } else {
        // Transient network error or 5xx server failure
        this.consecutiveFailures++
        this.lastSyncError = error.message || 'Sync request failed.'
        // Crucial safety guarantee: restore sending items to pending so no events are lost
        await resetSendingToPending()

        // Schedule bounded exponential backoff
        if (this.isOnline && !this.isPausedOnAuth) {
          const delay = this._calculateBackoff()
          if (this.retryTimer) clearTimeout(this.retryTimer)
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null
            if (this.isOnline && !this.isPausedOnAuth) {
              this.syncNow().catch(() => {})
            }
          }, delay)
        }
      }
      throw error
    } finally {
      this.isSyncing = false
      await this._notify()
    }
  }
}

// Global shared singleton
export const syncManager = new SyncManager()
