import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeNotificationPages } from './notifications.js'

test('notification refresh merges new and older pages without duplicates', () => {
  const older = [{ id: '002', title: 'Existing', isRead: false }, { id: '001', title: 'Older', isRead: true }]
  const result = mergeNotificationPages(older, [
    { id: '003', title: 'New', isRead: false },
    { id: '002', title: 'Updated', isRead: true },
  ])
  assert.deepEqual(result.map((item) => item.id), ['003', '002', '001'])
  assert.equal(result[1].isRead, true)
  assert.equal(result[1].title, 'Updated')
  assert.equal(older[0].isRead, false)
})

test('read status from the backend replaces stale local status', () => {
  assert.deepEqual(
    mergeNotificationPages([{ id: '001', isRead: false }], [{ id: '001', isRead: true }]),
    [{ id: '001', isRead: true }],
  )
  assert.deepEqual(mergeNotificationPages([], []), [])
})
