import { createContext, useContext } from 'react'

export const CatalogPricingContext = createContext({
  status: 'loading', enabled: null, error: '', reload: () => {}, save: () => {},
})

export default function useCatalogPricing() {
  return useContext(CatalogPricingContext)
}
