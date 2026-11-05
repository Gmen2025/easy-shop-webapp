import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest, getSelectedDatabaseName } from '../../api/client'
import { validateFinancialHealthSettings } from '../../utils/financialHealth'

export default function useFinancialHealth(refreshKey) {
  const [enabled, setEnabled] = useState(null)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const database = getSelectedDatabaseName()
  const reload = useCallback(async () => {
    const request = ++sequence.current
    setEnabled(null); setError('')
    try {
      const setting = validateFinancialHealthSettings(await apiRequest('/settings/financial-health', {
        headers: { 'x-database-name': database },
      }))
      if (request === sequence.current) setEnabled(setting.enabled)
    } catch (failure) {
      if (request === sequence.current) setError(failure.message)
    }
  }, [database])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) reload() })
    window.addEventListener('focus', reload)
    return () => { active = false; sequence.current += 1; window.removeEventListener('focus', reload) }
  }, [reload, refreshKey])
  return { enabled, error, reload }
}
