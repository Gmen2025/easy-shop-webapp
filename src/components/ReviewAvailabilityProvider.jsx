import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getSelectedDatabaseName } from '../api/client'
import { ReviewAvailabilityContext, reviewRequest } from '../api/reviews'

export default function ReviewAvailabilityProvider({ children }) {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')
  const { pathname } = useLocation()
  const generation = useRef(0)
  const reload = useCallback(() => {
    const current = ++generation.current
    const database = getSelectedDatabaseName()
    return reviewRequest('settings', { headers: { 'x-database-name': database } }).then((result) => {
      if (database !== getSelectedDatabaseName()) throw new Error('Region changed. Reload review availability.')
      if (current === generation.current) { setSettings(result); setError('') }
    }).catch((failure) => {
      if (current === generation.current) { setSettings(null); setError(failure.message) }
    })
  }, [])
  useEffect(() => {
    const invalidate = () => { ++generation.current }
    reload()
    const timer = setInterval(reload, 30000)
    window.addEventListener('focus', reload)
    return () => { invalidate(); clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [reload, pathname])
  return <ReviewAvailabilityContext.Provider value={{ settings }}>
    {error ? <div><p className="form-error" role="alert">{error}</p><button onClick={reload}>Retry review availability</button></div> : null}
    {children}
  </ReviewAvailabilityContext.Provider>
}
