import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../api/client'

export default function useDriverLocation() {
  const [sharing, setSharing] = useState(false)
  const [point, setPoint] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('GPS is off. Keep this page open while working.')
  const mounted = useRef(false)
  const latest = useRef(null)
  const generation = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1 } }, [])
  const report = useCallback(async (position) => {
    const version = generation.current
    const location = { latitude: position.coords.latitude, longitude: position.coords.longitude }
    await apiRequest('/rides/me/location', { method: 'POST', body: JSON.stringify(location), timeoutMs: 20000 })
    if (mounted.current && version === generation.current) {
      latest.current = { ...location, timestamp: position.timestamp }
      setPoint(latest.current); setError('')
      setStatus(`GPS shared at ${new Date().toLocaleTimeString()}. Keep this page open.`)
    }
    return location
  }, [])
  const reportNow = useCallback(async () => {
    if (!navigator.geolocation) throw new Error('GPS requires HTTPS or localhost and a browser with location support.')
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }))
      return await report(position)
    } catch (failure) {
      if (mounted.current) { latest.current = null; setPoint(null); setError(failure.message) }
      throw failure
    }
  }, [report])
  useEffect(() => {
    if (!sharing) return undefined
    let current = true
    let sending = false
    let lastSent = 0
    const watch = navigator.geolocation.watchPosition(async (position) => {
      if (sending || Date.now() - lastSent < 15000) return
      sending = true; lastSent = Date.now()
      try { await report(position) }
      catch (failure) { if (current) { latest.current = null; setPoint(null); setError(failure.message) } }
      finally { sending = false }
    }, (failure) => {
      if (current) { latest.current = null; setPoint(null); setError(failure.message) }
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 })
    return () => { current = false; navigator.geolocation.clearWatch(watch) }
  }, [sharing, report])
  const toggle = () => {
    if (!navigator.geolocation) { setError('Geolocation is unavailable. Use HTTPS or localhost with a supported browser.'); return }
    generation.current += 1
    latest.current = null; setPoint(null); setError('')
    setStatus(sharing ? 'GPS sharing stopped.' : 'Waiting for GPS permission and a fresh location...')
    setSharing(!sharing)
  }
  useEffect(() => {
    if (!point) return undefined
    const timer = setTimeout(() => {
      latest.current = null
      setPoint(null)
      setError('Live GPS is stale. Enable GPS and wait for a fresh position before navigating.')
    }, Math.max(0, 120000 - (Date.now() - point.timestamp)))
    return () => clearTimeout(timer)
  }, [point])
  return { sharing, point, latest, error, status, reportNow, toggle }
}
