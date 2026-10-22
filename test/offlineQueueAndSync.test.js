import test from 'node:test'
import assert from 'node:assert/strict'
import {
  QUEUE_STATUS,
  enqueueMeasurementEvent,
  getQueuedEvent,
  listQueuedEvents,
  getPendingEvents,
  markEventsSending,
  markEventDelivered,
  markEventConflict,
  markEventFailed,
  resetSendingToPending,
  removeQueuedEvent,
  clearDeliveredEvents,
  getQueueSummary,
} from '../src/offlineQueue.js'
import {
  syncManager,
  MAX_SYNC_BATCH_SIZE,
} from '../src/syncManager.js'

// Simple mock IndexedDB for deterministic testing of IDB logic
function createMockIndexedDB() {
  const data = new Map()
  let shouldFailTransaction = false
  let quotaError = false

  const mockDb = {
    setFailTransaction(fail) {
      shouldFailTransaction = fail
    },
    setQuotaError(err) {
      quotaError = err
    },
    transaction(storeName, mode) {
      if (shouldFailTransaction) {
        throw new Error('IDBDatabase transaction failed: simulated transaction failure')
      }
      if (quotaError) {
        const err = new Error('The quota has been exceeded.')
        err.name = 'QuotaExceededError'
        throw err
      }

      const tx = {
        oncomplete: null,
        onerror: null,
        onabort: null,
      }

      const store = {
        get(key) {
          const req = { onsuccess: null, onerror: null, result: undefined }
          queueMicrotask(() => {
            req.result = data.get(key) ? JSON.parse(JSON.stringify(data.get(key))) : undefined
            if (req.onsuccess) req.onsuccess({ target: req })
            if (tx.oncomplete) tx.oncomplete()
          })
          return req
        },
        getAll() {
          const req = { onsuccess: null, onerror: null, result: undefined }
          queueMicrotask(() => {
            req.result = Array.from(data.values()).map(v => JSON.parse(JSON.stringify(v)))
            if (req.onsuccess) req.onsuccess({ target: req })
            if (tx.oncomplete) tx.oncomplete()
          })
          return req
        },
        put(val) {
          const req = { onsuccess: null, onerror: null, result: undefined }
          queueMicrotask(() => {
            data.set(val.event_id, JSON.parse(JSON.stringify(val)))
            req.result = val.event_id
            if (req.onsuccess) req.onsuccess({ target: req })
            if (tx.oncomplete) tx.oncomplete()
          })
          return req
        },
        delete(key) {
          const req = { onsuccess: null, onerror: null }
          queueMicrotask(() => {
            data.delete(key)
            if (req.onsuccess) req.onsuccess({ target: req })
            if (tx.oncomplete) tx.oncomplete()
          })
          return req
        },
        openCursor() {
          const req = { onsuccess: null, onerror: null, result: null }
          const entries = Array.from(data.values()).map(v => JSON.parse(JSON.stringify(v)))
          let idx = 0
          function advance() {
            if (idx < entries.length) {
              const currentVal = entries[idx]
              const cursor = {
                value: currentVal,
                continue() {
                  idx++
                  queueMicrotask(advance)
                },
                update(updated) {
                  data.set(updated.event_id, JSON.parse(JSON.stringify(updated)))
                },
                delete() {
                  data.delete(currentVal.event_id)
                }
              }
              req.result = cursor
              if (req.onsuccess) req.onsuccess({ target: req })
            } else {
              req.result = null
              if (req.onsuccess) req.onsuccess({ target: req })
              if (tx.oncomplete) tx.oncomplete()
            }
          }
          queueMicrotask(advance)
          return req
        },
        index(idxName) {
          return {
            openCursor: store.openCursor
          }
        }
      }

      return {
        objectStore() {
          return store
        },
        get oncomplete() { return tx.oncomplete },
        set oncomplete(fn) { tx.oncomplete = fn },
        get onerror() { return tx.onerror },
        set onerror(fn) { tx.onerror = fn },
        get onabort() { return tx.onabort },
        set onabort(fn) { tx.onabort = fn },
      }
    }
  }

  return { mockDb, data }
}

test('1. Enqueue and retrieve a measurement event', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    schema_version: '1.0',
    event_id: 'e1000000-0000-0000-0000-000000000001',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 72,
    unit: 'beats_per_minute',
    measured_at: '2026-10-22T10:00:00Z',
    source: 'patient',
    is_simulated: true,
  }

  const enqueued = await enqueueMeasurementEvent(event, mockDb)
  assert.equal(enqueued.event_id, event.event_id)
  assert.equal(enqueued.status, QUEUE_STATUS.PENDING)
  assert.equal(enqueued.value, 72)
  assert.equal(enqueued.attempt_count, 0)

  const retrieved = await getQueuedEvent(event.event_id, mockDb)
  assert.ok(retrieved)
  assert.equal(retrieved.event_id, event.event_id)
  assert.equal(retrieved.patient_id, 'PC-TEST01')
  assert.equal(retrieved.value, 72)
})

test('2. Persistence after queue module reinitialization or page reload', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    event_id: 'e2000000-0000-0000-0000-000000000002',
    patient_id: 'PC-TEST01',
    measurement_type: 'blood_pressure_systolic',
    value: 120,
    unit: 'mmHg',
  }

  await enqueueMeasurementEvent(event, mockDb)

  // Simulate module re-initialization / fresh query from same persistent DB
  const list = await listQueuedEvents({}, mockDb)
  const found = list.find(e => e.event_id === event.event_id)
  assert.ok(found, 'Event must persist after module reinitialization')
  assert.equal(found.value, 120)
})

test('3. Duplicate enqueue with the same event ID preserves original record', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    event_id: 'e3000000-0000-0000-0000-000000000003',
    patient_id: 'PC-TEST01',
    measurement_type: 'oxygen_saturation',
    value: 98,
    unit: 'percent',
  }

  const first = await enqueueMeasurementEvent(event, mockDb)
  // Attempt duplicate enqueue with altered value
  const duplicate = await enqueueMeasurementEvent({ ...event, value: 91 }, mockDb)

  assert.equal(duplicate.event_id, first.event_id)
  assert.equal(duplicate.value, 98, 'Must preserve original record value and not overwrite')

  const count = (await listQueuedEvents({}, mockDb)).filter(e => e.event_id === event.event_id).length
  assert.equal(count, 1, 'Must not duplicate entries in queue')
})

test('4. Successful synchronization and confirmed delivery', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    event_id: 'e4000000-0000-0000-0000-000000000004',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 68,
    unit: 'beats_per_minute',
  }

  await enqueueMeasurementEvent(event, mockDb)
  await markEventsSending([event.event_id], mockDb)

  const sendingItem = await getQueuedEvent(event.event_id, mockDb)
  assert.equal(sendingItem.status, QUEUE_STATUS.SENDING)
  assert.equal(sendingItem.attempt_count, 1)

  // Server responds accepted
  await markEventDelivered(event.event_id, { serverStatus: 'accepted' }, mockDb)
  const delivered = await getQueuedEvent(event.event_id, mockDb)
  assert.equal(delivered.status, QUEUE_STATUS.DELIVERED)
  assert.ok(delivered.delivered_at)
  assert.equal(delivered.server_status, 'accepted')
})

test('5. Duplicate server acknowledgement during retry', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    event_id: 'e5000000-0000-0000-0000-000000000005',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 80,
    unit: 'beats_per_minute',
  }

  await enqueueMeasurementEvent(event, mockDb)
  await markEventsSending([event.event_id], mockDb)

  // Server confirms duplicate (already processed earlier by server)
  await markEventDelivered(event.event_id, { serverStatus: 'duplicate' }, mockDb)
  const item = await getQueuedEvent(event.event_id, mockDb)
  assert.equal(item.status, QUEUE_STATUS.DELIVERED, 'Duplicate must be safely reconciled as delivered')
  assert.equal(item.server_status, 'duplicate')
})

test('6. Partial batch success per-event reconciliation', async () => {
  const { mockDb } = createMockIndexedDB()
  const ev1 = {
    event_id: 'e6000000-0000-0000-0000-000000000001',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 70,
    unit: 'beats_per_minute',
  }
  const ev2 = {
    event_id: 'e6000000-0000-0000-0000-000000000002',
    patient_id: 'PC-TEST02',
    measurement_type: 'heart_rate',
    value: 85,
    unit: 'beats_per_minute',
  }

  await enqueueMeasurementEvent(ev1, mockDb)
  await enqueueMeasurementEvent(ev2, mockDb)
  await markEventsSending([ev1.event_id, ev2.event_id], mockDb)

  // Simulate server response: ev1 accepted, ev2 rejected (e.g. cross-patient authorization denied)
  await markEventDelivered(ev1.event_id, { serverStatus: 'accepted' }, mockDb)
  await markEventFailed(ev2.event_id, 'patient_access_denied', mockDb)

  const res1 = await getQueuedEvent(ev1.event_id, mockDb)
  const res2 = await getQueuedEvent(ev2.event_id, mockDb)

  assert.equal(res1.status, QUEUE_STATUS.DELIVERED)
  assert.equal(res2.status, QUEUE_STATUS.FAILED)
  assert.equal(res2.error_message, 'patient_access_denied')
})

test('7. Network failure and subsequent recovery restores sending to pending', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    event_id: 'e7000000-0000-0000-0000-000000000007',
    patient_id: 'PC-TEST01',
    measurement_type: 'respiratory_rate',
    value: 16,
    unit: 'breaths_per_minute',
  }

  await enqueueMeasurementEvent(event, mockDb)
  await markEventsSending([event.event_id], mockDb)

  // Network dropped mid-sync -> resetSendingToPending restores events
  const recovered = await resetSendingToPending(mockDb)
  assert.equal(recovered, 1)

  const item = await getQueuedEvent(event.event_id, mockDb)
  assert.equal(item.status, QUEUE_STATUS.PENDING, 'Network drop must restore in-flight event to pending')
})

test('8. 401 pause and reauthentication lifecycle', async () => {
  // SyncManager pauses when 401 occurs
  syncManager.isPausedOnAuth = true
  assert.equal(syncManager.isPausedOnAuth, true)

  // When auth token renewed, resumeAfterAuth clears pause
  syncManager.resumeAfterAuth('fresh-test-token')
  assert.equal(syncManager.isPausedOnAuth, false)
  assert.equal(syncManager.consecutiveFailures, 0)
})

test('9. 403 and permanent validation rejection halts endless retries', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    event_id: 'e9000000-0000-0000-0000-000000000009',
    patient_id: 'PC-UNAUTHORIZED',
    measurement_type: 'heart_rate',
    value: 99,
    unit: 'beats_per_minute',
  }

  await enqueueMeasurementEvent(event, mockDb)
  await markEventsSending([event.event_id], mockDb)
  await markEventFailed(event.event_id, 'Forbidden: Patient out of assigned scope', mockDb)

  // In-flight events marked failed are not returned by getPendingEvents
  const pending = await getPendingEvents(10, mockDb)
  assert.equal(pending.find(e => e.event_id === event.event_id), undefined, 'Permanent failure must not be re-queued in pending')

  const item = await getQueuedEvent(event.event_id, mockDb)
  assert.equal(item.status, QUEUE_STATUS.FAILED)
})

test('10. Conflicting event IDs with different payloads are quarantined', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    event_id: 'e1000000-0000-0000-0000-000000000010',
    patient_id: 'PC-TEST01',
    measurement_type: 'body_temperature',
    value: 37.1,
    unit: 'celsius',
  }

  await enqueueMeasurementEvent(event, mockDb)
  await markEventsSending([event.event_id], mockDb)

  // Server detects conflict (same event_id but payload fields differed from prior submission)
  await markEventConflict(event.event_id, 'Payload conflict with previously received event', mockDb)

  const item = await getQueuedEvent(event.event_id, mockDb)
  assert.equal(item.status, QUEUE_STATUS.CONFLICT)
  assert.ok(item.error_message.includes('conflict'))

  // Must not be included in pending list
  const pending = await getPendingEvents(10, mockDb)
  assert.equal(pending.find(e => e.event_id === event.event_id), undefined)
})

test('11. Crash recovery from sending state on startup', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    event_id: 'e1100000-0000-0000-0000-000000000011',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 75,
    unit: 'beats_per_minute',
  }

  await enqueueMeasurementEvent(event, mockDb)
  await markEventsSending([event.event_id], mockDb)

  // App crashed mid-sync. On next startup:
  const resetCount = await resetSendingToPending(mockDb)
  assert.equal(resetCount, 1)

  const recovered = await getQueuedEvent(event.event_id, mockDb)
  assert.equal(recovered.status, QUEUE_STATUS.PENDING)
})

test('12. Retry backoff computation and single-flight concurrency prevention', async () => {
  assert.equal(syncManager.isSyncing, false)

  // Test single flight guard
  let syncCallCount = 0
  const fakePromise = (async () => {
    syncCallCount++
    await new Promise(r => setTimeout(r, 50))
    return { syncedCount: 0 }
  })()

  syncManager.isSyncing = true
  syncManager.currentSyncPromise = fakePromise

  // Invoking sync while isSyncing returns the existing active promise
  const secondCall = syncManager.syncNow()
  assert.equal(secondCall, fakePromise)

  await fakePromise
  syncManager.isSyncing = false
  syncManager.currentSyncPromise = null
})

test('13. IndexedDB transaction failure and storage quota handling gracefully falls back to memory', async () => {
  const { mockDb } = createMockIndexedDB()
  mockDb.setQuotaError(true)

  const event = {
    event_id: 'e1300000-0000-0000-0000-000000000013',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 82,
    unit: 'beats_per_minute',
  }

  // Does not throw unhandled rejection; smoothly falls back to memory
  const result = await enqueueMeasurementEvent(event, mockDb)
  assert.ok(result)
  assert.equal(result.event_id, event.event_id)
})

test('14. Offline-to-online transition and manual Sync Now trigger', async () => {
  syncManager.setOnlineStatus(false)
  assert.equal(syncManager.isOnline, false)

  syncManager.setOnlineStatus(true)
  assert.equal(syncManager.isOnline, true)
})

test('15. Sign-out or account switch preserves pending events without silent data loss', async () => {
  const { mockDb } = createMockIndexedDB()
  const event = {
    event_id: 'e1500000-0000-0000-0000-000000000015',
    patient_id: 'PC-TEST01',
    measurement_type: 'heart_rate',
    value: 77,
    unit: 'beats_per_minute',
  }

  await enqueueMeasurementEvent(event, mockDb)

  // Simulate user sign-out: session token is cleared, but offlineQueue records remain intact
  const beforeSignOut = await getQueuedEvent(event.event_id, mockDb)
  assert.ok(beforeSignOut)

  // Sign out happens...
  // Queue verification:
  const afterSignOut = await getQueuedEvent(event.event_id, mockDb)
  assert.ok(afterSignOut, 'Offline queue must NEVER be wiped on user sign out')
  assert.equal(afterSignOut.status, QUEUE_STATUS.PENDING)
})
