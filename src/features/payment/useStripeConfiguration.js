import { useEffect, useMemo, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { apiRequest, getSelectedDatabaseName } from '../../api/client'

export default function useStripeConfiguration(explicitKey, enabled = true) {
  const database = enabled ? getSelectedDatabaseName() : ''
  const [result, setResult] = useState(null)
  const request = useMemo(() => ({ database, enabled, explicitKey }), [database, enabled, explicitKey])

  useEffect(() => {
    let active = true
    if (!enabled) return () => { active = false }
    apiRequest(explicitKey ? '/stripe/mode' : '/stripe/config').then((result) => {
      const key = explicitKey || result?.publishableKey
      if (!['test', 'live'].includes(result?.mode) ||
          typeof key !== 'string' || !key.startsWith(`pk_${result.mode}_`)) {
        throw new Error(explicitKey
          ? 'This saved payment does not match the current card payment mode. Check its status before retrying.'
          : 'The server returned invalid card payment configuration.')
      }
      if (active) setResult({ request, key })
    }).catch((failure) => {
      if (active) setResult({ request, error: failure.message || 'Unable to load card payment configuration.' })
    })
    return () => { active = false }
  }, [enabled, explicitKey, request])

  const current = result?.request === request ? result : null
  const key = current?.key || ''
  const stripe = useMemo(() => key ? loadStripe(key) : null, [key])
  return { stripe, error: current?.error || '' }
}
