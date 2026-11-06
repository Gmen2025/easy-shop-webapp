import { apiRequest } from './client'
import { createContext } from 'react'

export const ReviewAvailabilityContext = createContext({ settings: null })
export const REVIEW_FEATURES = { product: 'products', delivery: 'deliveries', rideDriver: 'rides', rideCustomer: 'rides', service: 'services' }
export const REVIEW_LABELS = { product: 'Products', delivery: 'Delivery experience', rideDriver: 'Ride drivers', rideCustomer: 'Ride customers', service: 'Service fulfillment' }
export const reviewRequest = async (path, options) => {
  const result = await apiRequest(`/reviews/${path}`, options)
  if (path === 'settings' && ['products', 'deliveries', 'rides', 'services'].some((key) => typeof result?.[key] !== 'boolean')) {
    throw new Error('Review settings could not be verified. Please retry.')
  }
  return result
}
export function reviewQuery(kind, transaction, product) {
  const query = new URLSearchParams({ kind, transaction })
  if (product) query.set('product', product)
  return `context?${query}`
}
