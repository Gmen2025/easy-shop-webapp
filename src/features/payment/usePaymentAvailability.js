import useCompanyResource from '../company/useCompanyResource'
import { parsePaymentSettings } from '../../utils/paymentAvailability'

export default function usePaymentAvailability() {
  const resource = useCompanyResource('/settings/payment-methods', parsePaymentSettings, 30000)
  return { ...resource, methods: resource.error ? null : resource.data }
}
