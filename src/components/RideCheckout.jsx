import { useState } from 'react'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import DeliveryCardPayment from './DeliveryCardPayment'
import usePaymentAvailability from '../features/payment/usePaymentAvailability'
import useCompanyResource, { useCompanyAction } from '../features/company/useCompanyResource'
import { requireList } from '../utils/company'
import { PAYMENT_UNAVAILABLE, enabledPaymentMethods } from '../utils/paymentAvailability'
import { money } from '../utils/checkoutPayment'

const bankResponse = (data) => requireList(data, 'bank accounts')

export default function RideCheckout({ ride, onUpdated }) {
  const availability = usePaymentAvailability()
  const banks = useCompanyResource(`/stores/delivery-bank-accounts?currency=${encodeURIComponent(ride.currency.toUpperCase())}`, bankResponse)
  const action = useCompanyAction()
  const [method, setMethod] = useState('')
  const [bankId, setBankId] = useState('')
  const [sender, setSender] = useState(ride.bankSender || '')
  const [reference, setReference] = useState(ride.bankReference || '')
  const [clientSecret, setClientSecret] = useState('')
  const methods = enabledPaymentMethods(['bank', ...(/usa/i.test(getSelectedDatabaseName()) ? ['card'] : []), 'cash'], availability.methods)
  const update = async (path, body) => {
    const result = await apiRequest(`/rides/${encodeURIComponent(ride._id)}/${path}`, {
      method: 'POST', body: JSON.stringify(body), timeoutMs: 120000,
    })
    onUpdated(result)
    return result
  }
  const confirm = () => update('payment-confirm', { sender, reference })
  return <section className="order-card" aria-label="Ride payment"><h3>Ride payment</h3>
    <p>Final fare: {money(ride.finalFare, ride.currency)} | Payment: {ride.paymentStatus}</p>
    {action.error ? <p role="alert">{action.error}</p> : null}
    {ride.paymentStatus === 'completed' ? <p role="status">Payment confirmed. Do not pay again.</p> :
      !ride.paymentMethod ? <>
        {availability.error ? <p role="alert">{availability.error}</p> :
          !availability.methods ? <p role="status">Loading payment methods...</p> :
            !methods.length ? <p role="alert">{PAYMENT_UNAVAILABLE}</p> : null}
        <label>Ride payment method<select value={method} disabled={action.busy} onChange={(event) => setMethod(event.target.value)}>
          <option value="">Select a payment method</option>
          {methods.map((key) => <option value={key} key={key}>{{ bank: 'Bank transfer', card: 'Card', cash: 'Cash to driver' }[key]}</option>)}
        </select></label>
        {method === 'bank' && methods.includes('bank') ? <>
          {banks.error ? <p role="alert">{banks.error}</p> : null}
          <label>Ride bank account<select value={bankId} onChange={(event) => setBankId(event.target.value)}>
            <option value="">Select bank account</option>{banks.data?.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}</option>)}
          </select></label>
        </> : null}
        <button className="solid-button" disabled={action.busy || !methods.includes(method) || (method === 'bank' && !bankId)}
          onClick={() => action.run(() => update('payment-method', { method, bankAccountId: bankId }))}>Choose payment method</button>
      </> : ride.paymentMethod === 'card' ? <>
        <button className="solid-button" disabled={action.busy} onClick={() => action.run(async () => {
          const result = await apiRequest(`/rides/${encodeURIComponent(ride._id)}/payment`, { method: 'POST', body: '{}', timeoutMs: 60000 })
          onUpdated(result.ride); setClientSecret(result.clientSecret || '')
        })}>Load secure ride card payment</button>
        {clientSecret ? <DeliveryCardPayment clientSecret={clientSecret} onConfirm={confirm}
          returnUrl={`${window.location.origin}/rides/mine?rideId=${encodeURIComponent(ride._id)}`} /> : null}
        <button className="ghost-button" disabled={action.busy} onClick={() => action.run(confirm)}>Check existing card payment</button>
        <p>After interruptions, reconcile the same ride payment. Do not pay twice.</p>
      </> : ride.paymentMethod === 'bank' ? <>
        <p>{ride.bankAccount?.bankName} - {ride.bankAccount?.accountNumber} - {ride.bankAccount?.accountHolderName}</p>
        <p>Transfer once. Payment stays pending until Admin verifies receipt.</p>
        <label>Transfer sender<input value={sender} maxLength={300} onChange={(event) => setSender(event.target.value)} /></label>
        <label>Transfer reference<input value={reference} maxLength={300} onChange={(event) => setReference(event.target.value)} /></label>
        <button className="solid-button" disabled={action.busy} onClick={() => action.run(confirm)}>Submit bank transfer reference</button>
      </> : <p>Pay the assigned driver. They will confirm cash receipt. Do not pay twice.</p>}
  </section>
}
