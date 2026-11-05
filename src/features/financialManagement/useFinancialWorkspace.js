import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '../../api/client'
import { createFinancialClient, financialError, workspacePath, TRACKER_PREFIX, FINANCIAL_HEALTH_PREFIX } from '../../utils/financialManagement'

export default function useFinancialWorkspace(filters, service = false) {
  const prefix = service ? FINANCIAL_HEALTH_PREFIX : TRACKER_PREFIX
  const client = useMemo(() => createFinancialClient(apiRequest, undefined, prefix), [prefix])
  const [snapshot, setSnapshot] = useState(null)
  const [failure, setFailure] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const saving = useRef(false)
  const path = workspacePath(filters, prefix)
  const load = useCallback(async () => {
    const version = ++generation.current
    setLoading(true)
    try {
      const query = Object.fromEntries(new URLSearchParams(path.split('?')[1]))
      if (query.period === 'custom' && (!query.from || !query.to || query.from > query.to)) {
        throw new Error('Choose a valid custom start and end date before loading the report.')
      }
      const data = await client.workspace(query)
      if (version === generation.current) { setSnapshot({ path, data }); setFailure(null) }
    } catch (error) {
      if (version === generation.current) { setSnapshot(null); setFailure({ path, message: financialError(error) }) }
    } finally { if (version === generation.current) setLoading(false) }
  }, [path, client])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) load() })
    return () => { active = false; generation.current += 1 }
  }, [load])
  const save = async (endpoint, method, body, idempotent = false) => {
    if (saving.current) return false
    saving.current = true
    setBusy(true); setNotice(''); setFailure(null)
    const version = generation.current
    let persisted = false
    try {
      await client.save(endpoint, method, body, idempotent)
      persisted = true
      if (version === generation.current) {
        setNotice('Saved to your private manual ledger.')
        await load()
      }
      return true
    } catch (error) {
      if (version === generation.current) setFailure({ path, message: financialError(error) })
      return persisted
    } finally { saving.current = false; setBusy(false) }
  }
  return {
    service,
    data: snapshot?.path === path ? snapshot.data : null,
    error: failure?.path === path ? failure.message : '', loading, busy, notice, reload: load, save,
  }
}
