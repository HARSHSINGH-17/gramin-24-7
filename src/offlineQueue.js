/**
 * PahaadCare RPM Offline Event Queue
 * Milestone 3: Durable Offline Event Queue and Synchronization
 *
 * Provides durable IndexedDB persistence for offline-generated RPM measurement events.
 * Key guarantees:
 * - Durable storage in IndexedDB (survives tab close and reloads).
 * - Stable event IDs and payloads preserved across retries.
 * - Idempotent enqueuing (prevents duplicate event insertion).
 * - Explicit lifecycle states: pending -> sending -> delivered | conflict | failed.
 * - Crash recovery: recovers events stuck in 'sending' back to 'pending'.
 * - In-memory fallback if IndexedDB is disabled or quota exceeded.
 * - No JWTs, passwords, or extra PII persisted.
 */

export const DB_NAME = 'pahaadcare_rpm_offline_db'
export const DB_VERSION = 1
export const STORE_NAME = 'rpm_measurement_events'

export const QUEUE_STATUS = {
  PENDING: 'pending',
  SENDING: 'sending',
  DELIVERED: 'delivered',
  CONFLICT: 'conflict',
  FAILED: 'failed',
}

class MemoryStore {
  constructor() {
    this.map = new Map()
  }

  async get(id) {
    const item = this.map.get(id)
    return item ? JSON.parse(JSON.stringify(item)) : null
  }

  async put(item) {
    this.map.set(item.event_id, JSON.parse(JSON.stringify(item)))
    return item
  }

  async delete(id) {
    this.map.delete(id)
  }

  async getAll() {
    return Array.from(this.map.values()).map((item) => JSON.parse(JSON.stringify(item)))
  }

  async clear() {
    this.map.clear()
  }
}

let memoryFallback = null

function getMemoryStore() {
  if (!memoryFallback) {
    memoryFallback = new MemoryStore()
  }
  return memoryFallback
}

/**
 * Open or upgrade the IndexedDB database
 */
export function openQueueDatabase() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null)
      return
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'event_id' })
          store.createIndex('by_status', 'status', { unique: false })
          store.createIndex('by_patient', 'patient_id', { unique: false })
          store.createIndex('by_enqueued', 'enqueued_at', { unique: false })
        }
      }

      request.onsuccess = (event) => {
        const db = event.target.result
        // Crash recovery on open: reset any orphaned 'sending' events to 'pending'
        resetSendingToPending(db)
          .then(() => resolve(db))
          .catch(() => resolve(db))
      }

      request.onerror = () => {
        resolve(null)
      }
    } catch {
      resolve(null)
    }
  })
}

/**
 * Execute an IndexedDB transaction with promise wrapper
 */
function withStore(db, mode, callback) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    try {
      const transaction = db.transaction(STORE_NAME, mode)
      const store = transaction.objectStore(STORE_NAME)
      let result = null

      transaction.oncomplete = () => resolve(result)
      transaction.onerror = (e) => reject(e.target.error || new Error('Transaction failed'))
      transaction.onabort = (e) => reject(e.target.error || new Error('Transaction aborted'))

      result = callback(store)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Enqueue a measurement event into durable storage
 * Idempotent: if event_id already exists, preserves existing record.
 */
export async function enqueueMeasurementEvent(event, customDbOrOptions = null) {
  if (!event || !event.event_id) {
    throw new Error('Measurement event must have an event_id')
  }
  if (!event.patient_id) {
    throw new Error('Measurement event must have a patient_id')
  }
  if (!event.measurement_type) {
    throw new Error('Measurement event must have a measurement_type')
  }
  if (event.value === undefined || event.value === null || typeof event.value !== 'number') {
    throw new Error('Measurement event must have a numeric value')
  }
  if (!event.unit) {
    throw new Error('Measurement event must have a unit')
  }

  let customDb = null
  let enqueuedBy = null

  if (customDbOrOptions) {
    if (customDbOrOptions.transaction || customDbOrOptions.createObjectStore) {
      customDb = customDbOrOptions
    } else if (typeof customDbOrOptions === 'object') {
      customDb = customDbOrOptions.customDb || null
      enqueuedBy = customDbOrOptions.enqueued_by || customDbOrOptions.enqueuedBy || null
    }
  }

  if (!enqueuedBy && event.enqueued_by) {
    enqueuedBy = event.enqueued_by
  }

  const db = customDb || (await openQueueDatabase())
  const nowIso = new Date().toISOString()

  // Clean canonical contract record (never storing passwords or auth tokens)
  const record = {
    schema_version: event.schema_version || '1.0',
    event_id: String(event.event_id),
    patient_id: String(event.patient_id),
    measurement_type: String(event.measurement_type),
    value: Number(event.value),
    unit: String(event.unit),
    measured_at: event.measured_at || nowIso,
    source: event.source || 'patient',
    is_simulated: Boolean(event.is_simulated),
    device_reference: event.device_reference || undefined,
    health_worker_reference: event.health_worker_reference || undefined,

    // Account binding & queue metadata
    enqueued_by: enqueuedBy ? String(enqueuedBy) : null,
    status: QUEUE_STATUS.PENDING,
    enqueued_at: nowIso,
    attempt_count: 0,
    last_attempt_at: null,
    error_message: null,
    server_status: null,
    delivered_at: null,
  }

  if (!db) {
    const mem = getMemoryStore()
    const existing = await mem.get(record.event_id)
    if (existing) return existing
    await mem.put(record)
    return record
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const checkReq = store.get(record.event_id)

      checkReq.onsuccess = () => {
        if (checkReq.result) {
          // Already queued, return existing record (idempotent enqueue)
          resolve(checkReq.result)
          return
        }
        const putReq = store.put(record)
        putReq.onsuccess = () => resolve(record)
        putReq.onerror = () => reject(putReq.error || new Error('Put failed'))
      }

      checkReq.onerror = () => reject(checkReq.error || new Error('Get failed'))
    } catch (err) {
      // Fallback to memory store if IDB transaction or quota fails
      getMemoryStore()
        .put(record)
        .then(resolve)
        .catch(reject)
    }
  })
}

/**
 * Retrieve a single queued event by ID
 */
export async function getQueuedEvent(eventId, customDb = null) {
  const db = customDb || (await openQueueDatabase())
  if (!db) {
    return getMemoryStore().get(eventId)
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const req = store.get(eventId)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    } catch (err) {
      getMemoryStore().get(eventId).then(resolve).catch(reject)
    }
  })
}

/**
 * List queued events with optional status, patient, and account filtering
 */
export async function listQueuedEvents(
  { status = null, patientId = null, enqueuedBy = null, limit = 100 } = {},
  customDb = null
) {
  const db = customDb || (await openQueueDatabase())
  if (!db) {
    let items = await getMemoryStore().getAll()
    if (status) items = items.filter((i) => i.status === status)
    if (patientId) items = items.filter((i) => i.patient_id === patientId)
    if (enqueuedBy) items = items.filter((i) => !i.enqueued_by || i.enqueued_by === enqueuedBy)
    items.sort((a, b) => new Date(a.enqueued_at) - new Date(b.enqueued_at))
    return items.slice(0, limit)
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const req = store.getAll()

      req.onsuccess = () => {
        let items = req.result || []
        if (status) items = items.filter((i) => i.status === status)
        if (patientId) items = items.filter((i) => i.patient_id === patientId)
        if (enqueuedBy) items = items.filter((i) => !i.enqueued_by || i.enqueued_by === enqueuedBy)
        items.sort((a, b) => new Date(a.enqueued_at) - new Date(b.enqueued_at))
        resolve(items.slice(0, limit))
      }
      req.onerror = () => reject(req.error)
    } catch {
      resolve([])
    }
  })
}

/**
 * Retrieve up to limit pending events ready for synchronization
 */
export async function getPendingEvents(limit = 100, customDbOrOptions = null, enqueuedByArg = null) {
  let customDb = null
  let enqueuedBy = enqueuedByArg || null

  if (typeof limit === 'object' && limit !== null) {
    enqueuedBy = limit.enqueuedBy || limit.enqueued_by || enqueuedByArg || null
    customDb = limit.customDb || null
    limit = limit.limit || 100
  } else if (customDbOrOptions) {
    if (customDbOrOptions.transaction || customDbOrOptions.createObjectStore) {
      customDb = customDbOrOptions
    } else if (typeof customDbOrOptions === 'object') {
      customDb = customDbOrOptions.customDb || null
      enqueuedBy = customDbOrOptions.enqueued_by || customDbOrOptions.enqueuedBy || enqueuedByArg || null
      if (customDbOrOptions.limit) {
        limit = customDbOrOptions.limit
      }
    } else if (typeof customDbOrOptions === 'string') {
      enqueuedBy = customDbOrOptions
    }
  }

  return listQueuedEvents({ status: QUEUE_STATUS.PENDING, enqueuedBy, limit }, customDb)
}

/**
 * Transition a set of events from 'pending' to 'sending' (in-flight lease)
 */
export async function markEventsSending(eventIds, customDb = null) {
  if (!eventIds || !eventIds.length) return []
  const db = customDb || (await openQueueDatabase())
  const nowIso = new Date().toISOString()
  const updatedEvents = []

  if (!db) {
    const mem = getMemoryStore()
    for (const id of eventIds) {
      const item = await mem.get(id)
      if (item && item.status === QUEUE_STATUS.PENDING) {
        item.status = QUEUE_STATUS.SENDING
        item.attempt_count = (item.attempt_count || 0) + 1
        item.last_attempt_at = nowIso
        await mem.put(item)
        updatedEvents.push(item)
      }
    }
    return updatedEvents
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      for (const id of eventIds) {
        const req = store.get(id)
        req.onsuccess = () => {
          const item = req.result
          if (item && item.status === QUEUE_STATUS.PENDING) {
            item.status = QUEUE_STATUS.SENDING
            item.attempt_count = (item.attempt_count || 0) + 1
            item.last_attempt_at = nowIso
            store.put(item)
            updatedEvents.push(item)
          }
        }
      }

      transaction.oncomplete = () => resolve(updatedEvents)
      transaction.onerror = () => reject(transaction.error)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Mark event as delivered after confirmed server acceptance or duplicate ack
 */
export async function markEventDelivered(eventId, { serverStatus = 'accepted', receivedAt = null, alertIds = [] } = {}, customDb = null) {
  const db = customDb || (await openQueueDatabase())
  const nowIso = new Date().toISOString()

  if (!db) {
    const mem = getMemoryStore()
    const item = await mem.get(eventId)
    if (item) {
      item.status = QUEUE_STATUS.DELIVERED
      item.server_status = serverStatus
      item.delivered_at = nowIso
      if (receivedAt) item.received_at = receivedAt
      item.alert_ids = alertIds
      await mem.put(item)
    }
    return item
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const req = store.get(eventId)

      req.onsuccess = () => {
        const item = req.result
        if (item) {
          item.status = QUEUE_STATUS.DELIVERED
          item.server_status = serverStatus
          item.delivered_at = nowIso
          if (receivedAt) item.received_at = receivedAt
          item.alert_ids = alertIds
          store.put(item)
        }
        resolve(item)
      }
      req.onerror = () => reject(req.error)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Mark event as conflict (server detected event_id conflict)
 */
export async function markEventConflict(eventId, errorMessage = 'event_id_conflict', customDb = null) {
  const db = customDb || (await openQueueDatabase())

  if (!db) {
    const mem = getMemoryStore()
    const item = await mem.get(eventId)
    if (item) {
      item.status = QUEUE_STATUS.CONFLICT
      item.server_status = 'conflict'
      item.error_message = errorMessage
      await mem.put(item)
    }
    return item
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const req = store.get(eventId)

      req.onsuccess = () => {
        const item = req.result
        if (item) {
          item.status = QUEUE_STATUS.CONFLICT
          item.server_status = 'conflict'
          item.error_message = errorMessage
          store.put(item)
        }
        resolve(item)
      }
      req.onerror = () => reject(req.error)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Mark event as permanently failed/rejected
 */
export async function markEventFailed(eventId, errorMessage = 'rejected', customDb = null) {
  const db = customDb || (await openQueueDatabase())

  if (!db) {
    const mem = getMemoryStore()
    const item = await mem.get(eventId)
    if (item) {
      item.status = QUEUE_STATUS.FAILED
      item.server_status = 'rejected'
      item.error_message = errorMessage
      await mem.put(item)
    }
    return item
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const req = store.get(eventId)

      req.onsuccess = () => {
        const item = req.result
        if (item) {
          item.status = QUEUE_STATUS.FAILED
          item.server_status = 'rejected'
          item.error_message = errorMessage
          store.put(item)
        }
        resolve(item)
      }
      req.onerror = () => reject(req.error)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Crash recovery: reset any events stuck in 'sending' back to 'pending'
 */
export async function resetSendingToPending(customDb = null) {
  const db = customDb || (await openQueueDatabase())
  if (!db) {
    const mem = getMemoryStore()
    const items = await mem.getAll()
    let count = 0
    for (const item of items) {
      if (item.status === QUEUE_STATUS.SENDING) {
        item.status = QUEUE_STATUS.PENDING
        await mem.put(item)
        count++
      }
    }
    return count
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const req = store.getAll()
      let count = 0

      req.onsuccess = () => {
        const items = req.result || []
        for (const item of items) {
          if (item.status === QUEUE_STATUS.SENDING) {
            item.status = QUEUE_STATUS.PENDING
            store.put(item)
            count++
          }
        }
      }
      transaction.oncomplete = () => resolve(count)
      transaction.onerror = () => resolve(0)
    } catch {
      resolve(0)
    }
  })
}

/**
 * Remove an event from the queue
 */
export async function removeQueuedEvent(eventId, customDb = null) {
  const db = customDb || (await openQueueDatabase())
  if (!db) {
    return getMemoryStore().delete(eventId)
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const req = store.delete(eventId)
      transaction.oncomplete = () => resolve(true)
      transaction.onerror = () => reject(transaction.error)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Clear all delivered events from storage
 */
export async function clearDeliveredEvents(customDb = null) {
  const events = await listQueuedEvents({ status: QUEUE_STATUS.DELIVERED }, customDb)
  for (const event of events) {
    await removeQueuedEvent(event.event_id, customDb)
  }
}

/**
 * Get statistical summary of queue counts
 */
/**
 * Get statistical summary of queue counts
 */
export async function getQueueSummary(customDbOrOptions = null, currentUserArg = null) {
  let customDb = null
  let currentUser = currentUserArg || null

  if (customDbOrOptions) {
    if (customDbOrOptions.transaction || customDbOrOptions.createObjectStore) {
      customDb = customDbOrOptions
    } else if (typeof customDbOrOptions === 'object') {
      customDb = customDbOrOptions.customDb || null
      currentUser = customDbOrOptions.currentUser || customDbOrOptions.current_user || currentUserArg || null
    } else if (typeof customDbOrOptions === 'string') {
      currentUser = customDbOrOptions
    }
  }

  const items = await listQueuedEvents({ limit: 1000 }, customDb)
  const summary = {
    total: items.length,
    pending: 0,
    sending: 0,
    delivered: 0,
    conflict: 0,
    failed: 0,
    foreignPending: 0,
  }

  for (const item of items) {
    if (
      item.status === QUEUE_STATUS.PENDING &&
      currentUser &&
      item.enqueued_by &&
      item.enqueued_by !== currentUser
    ) {
      summary.foreignPending++
    } else if (summary[item.status] !== undefined) {
      summary[item.status]++
    }
  }

  return summary
}
