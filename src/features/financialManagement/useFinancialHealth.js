import { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { apiRequest, getSelectedDatabaseName } from '../../api/client'
import { validateFinancialHealthSettings } from '../../utils/financialHealth'

export default function useFinancialHealth(refreshKey) {
  const userId = useSelector((state) => state.auth.user?._id || state.auth.user?.id)
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const database = getSelectedDatabaseName()
  const reload = useCallback(async () => {
    const request = ++sequence.current
    setSnapshot(null); setError('')
    try {
      const setting = validateFinancialHealthSettings(await apiRequest('/settings/financial-health', {
        headers: { 'x-database-name': database },
      }))
      if (request === sequence.current) {
        setSnapshot({ database, userId, configuredEnabled: setting.enabled,
          enabled: setting.enabled || setting.testingAccess === true })
      }
    } catch (failure) {
      if (request === sequence.current) setError(failure.message)
    }
  }, [database, userId])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) reload() })
    const timer = setInterval(reload, 30000)
    window.addEventListener('focus', reload)
    return () => { active = false; sequence.current += 1; clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [reload, refreshKey])
  const current = snapshot?.database === database && snapshot.userId === userId ? snapshot : null
  return { enabled: current?.enabled ?? null, configuredEnabled: current?.configuredEnabled ?? null, error, reload }
}
