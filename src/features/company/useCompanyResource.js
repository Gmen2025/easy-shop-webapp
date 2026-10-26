import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../api/client'

export default function useCompanyResource(path, validate, interval = 0) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const pending = useRef(null)
  const reload = useCallback(() => {
    if (pending.current) return pending.current
    const version = generation.current
    setLoading(true)
    const request = (async () => {
      try {
        const result = validate(await apiRequest(path))
        if (version === generation.current) { setData(result); setError('') }
        return result
      } catch (failure) {
        if (version === generation.current) setError(failure.message)
        throw failure
      } finally {
        if (version === generation.current) { pending.current = null; setLoading(false) }
      }
    })()
    pending.current = request
    return request
  }, [path, validate])
  useEffect(() => {
    generation.current += 1
    pending.current = null
    // Background failures are displayed in the resource's error state.
    const refresh = () => { reload().catch(() => {}) }
    refresh()
    const timer = interval ? setInterval(refresh, interval) : null
    window.addEventListener('focus', refresh)
    return () => {
      generation.current += 1
      pending.current = null
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [reload, interval])
  const refresh = useCallback(async () => {
    if (pending.current) await pending.current
    return reload()
  }, [reload])
  return { data, error, loading, reload: refresh }
}

export function useCompanyAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const guard = useRef(false)
  const run = async (action, success = '') => {
    if (guard.current) return
    guard.current = true
    setBusy(true); setError(''); setNotice('')
    try { await action(); setNotice(success) }
    catch (failure) { setError(failure.message) }
    finally { guard.current = false; setBusy(false) }
  }
  return { busy, error, notice, run }
}
