import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api/client'
import { mergeNotificationPages } from '../utils/notifications'
import './NotificationBell.css'

function NotificationBell({ onOpen }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [nextCursor, setNextCursor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const closeRef = useRef(null)
  const refreshRef = useRef(null)
  const pendingRef = useRef(false)
  const mountedRef = useRef(false)
  const pageCountRef = useRef(1)

  useEffect(() => {
    let active = true
    mountedRef.current = true

    async function refresh() {
      if (pendingRef.current || document.visibilityState === 'hidden') return
      pendingRef.current = true
      setBusy(true)
      try {
        const payload = await apiRequest('/notifications/inbox')
        const notifications = [...payload.notifications]
        let cursor = payload.nextCursor
        for (let pageIndex = 1; pageIndex < pageCountRef.current && cursor; pageIndex += 1) {
          if (!active) return
          const olderPage = await apiRequest(`/notifications/inbox?before=${encodeURIComponent(cursor)}`)
          notifications.push(...olderPage.notifications)
          cursor = olderPage.nextCursor
        }
        if (!active) return
        setItems(mergeNotificationPages([], notifications))
        setUnreadCount(payload.unreadCount)
        setNextCursor(cursor)
        setLoaded(true)
        setError('')
      } catch (requestError) {
        if (active) setError(requestError.message || 'Unable to load notifications.')
      } finally {
        if (active) {
          pendingRef.current = false
          setBusy(false)
        }
      }
    }

    refreshRef.current = refresh
    void refresh()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      mountedRef.current = false
      pendingRef.current = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function dismiss(event) {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape') return
        setOpen(false)
        buttonRef.current?.focus()
      } else if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [open])

  async function updateInbox(path, cursor) {
    pendingRef.current = true
    setBusy(true)
    setError('')
    try {
      if (path) await apiRequest(path, { method: 'PUT' })
      const payload = await apiRequest(`/notifications/inbox${cursor ? `?before=${encodeURIComponent(cursor)}` : ''}`)
      if (!mountedRef.current) return
      setItems((current) => mergeNotificationPages(
        path?.endsWith('/read-all') ? current.map((item) => ({ ...item, isRead: true })) : current,
        payload.notifications,
      ).map((item) => path === `/notifications/inbox/${item.id}/read` ? { ...item, isRead: true } : item))
      setUnreadCount(payload.unreadCount)
      if (cursor) {
        pageCountRef.current += 1
        setNextCursor(payload.nextCursor)
      } else if (pageCountRef.current === 1) {
        setNextCursor(payload.nextCursor)
      }
      setLoaded(true)
    } catch (requestError) {
      if (mountedRef.current) setError(requestError.message || 'Unable to update notifications.')
    } finally {
      pendingRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="ghost-button notification-toggle"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls="notification-inbox"
        onClick={() => {
          setOpen(!open)
          if (!open) {
            onOpen()
            void refreshRef.current?.()
          }
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <section id="notification-inbox" className="notification-panel" aria-labelledby="notification-title">
          <div className="notification-heading">
            <h2 id="notification-title">Notifications</h2>
            <button ref={closeRef} type="button" className="ghost-button" aria-label="Close notifications" onClick={() => {
              setOpen(false)
              buttonRef.current?.focus()
            }}>Close</button>
          </div>
          <div className="notification-actions">
            <span role="status">{unreadCount} unread</span>
            <button type="button" className="ghost-button" disabled={busy || !unreadCount} onClick={() => updateInbox('/notifications/inbox/read-all')}>Mark all as read</button>
          </div>
          {error && <div className="notification-error" role="alert">
            <p>{error}</p>
            <button type="button" className="ghost-button" disabled={busy} onClick={() => refreshRef.current?.()}>Retry</button>
          </div>}
          {!loaded && busy && <p role="status">Loading notifications...</p>}
          {loaded && !items.length && <p className="notification-empty">You're all caught up. New updates will appear here.</p>}
          <ul className="notification-list" aria-label="Notification history" aria-busy={busy}>
            {items.map((item) => (
              <li key={item.id} className={item.isRead ? '' : 'notification-unread'}>
                <h3>{!item.isRead && <span className="notification-dot" aria-label="Unread" />}{item.title}</h3>
                <p>{item.body}</p>
                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                {!item.isRead && <button type="button" className="ghost-button" disabled={busy} onClick={() => updateInbox(`/notifications/inbox/${item.id}/read`)}>Mark as read</button>}
              </li>
            ))}
          </ul>
          {nextCursor && <button type="button" className="ghost-button notification-more" disabled={busy} onClick={() => updateInbox(null, nextCursor)}>Load older notifications</button>}
          <p className="notification-footnote">Updates refresh every 30 seconds while this site is open.</p>
        </section>
      )}
    </div>
  )
}

export default NotificationBell
