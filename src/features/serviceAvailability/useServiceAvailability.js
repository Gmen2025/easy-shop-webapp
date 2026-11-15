import { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { apiRequest, getSelectedDatabaseName } from '../../api/client'
import { effectiveServiceAvailability, validateServiceAvailability } from '../../utils/serviceAvailability'

export default function useServiceAvailability(refreshKey) {
  const userId = useSelector((state) => state.auth.user?._id || state.auth.user?.id)
  const database = getSelectedDatabaseName()
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const request = ++sequence.current
    try {
      const settings = validateServiceAvailability(await apiRequest('/settings/service-availability', {
        headers: { 'x-database-name': database },
      }))
      if (request === sequence.current) { setSnapshot({ database, userId, settings: effectiveServiceAvailability(settings) }); setError('') }
    } catch (failure) {
      if (request === sequence.current) { setSnapshot(null); setError(failure.message) }
    }
  }, [database, userId])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) reload() })
    const timer = setInterval(reload, 30000)
    window.addEventListener('focus', reload)
    return () => { active = false; sequence.current += 1; clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [reload, refreshKey])
  return { settings: snapshot?.database === database && snapshot.userId === userId ? snapshot.settings : null, error, reload }
}
