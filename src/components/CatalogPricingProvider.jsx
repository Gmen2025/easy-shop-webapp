import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiRequest } from '../api/client'
import { CatalogPricingContext } from '../features/products/useCatalogPricing'
import { catalogSettings } from '../utils/catalogPricing'

export default function CatalogPricingProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', enabled: null, error: '' })
  const generation = useRef(0)
  const saving = useRef(false)
  const { pathname } = useLocation()
  const reload = useCallback(async () => {
    if (saving.current) return null
    const request = ++generation.current
    try {
      const data = catalogSettings(await apiRequest('/products/catalog-settings'))
      if (request === generation.current) {
        setState({ status: 'ready', enabled: data.nearestStorePricingEnabled, error: '' })
        return data
      }
    } catch (failure) {
      if (request === generation.current) setState({ status: 'error', enabled: null, error: failure.message })
    }
    return null
  }, [])
  const save = useCallback(async (enabled) => {
    saving.current = true
    ++generation.current
    setState((current) => ({ ...current, status: 'saving', error: '' }))
    try {
      const data = catalogSettings(await apiRequest('/products/catalog-settings', {
        method: 'PUT', body: JSON.stringify({ nearestStorePricingEnabled: enabled }),
      }))
      setState({ status: 'ready', enabled: data.nearestStorePricingEnabled, error: '' })
    } catch (failure) {
      setState({ status: 'error', enabled: null, error: failure.message })
      throw failure
    } finally { saving.current = false }
  }, [])
  useEffect(() => {
    const initial = setTimeout(reload, 0)
    const interval = setInterval(reload, 30000)
    window.addEventListener('focus', reload)
    return () => {
      ++generation.current
      clearTimeout(initial)
      clearInterval(interval)
      window.removeEventListener('focus', reload)
    }
  }, [reload, pathname])
  return <CatalogPricingContext.Provider value={{ ...state, reload, save }}>{children}</CatalogPricingContext.Provider>
}
