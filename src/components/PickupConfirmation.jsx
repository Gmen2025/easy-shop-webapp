import { useRef, useState } from 'react'
import { deliveryRequest } from '../api/delivery'
import { addressText } from '../utils/delivery'

export default function PickupConfirmation({ order, party = 'customer', onSaved }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const guard = useRef(false)
  if (order.fulfillmentMethod !== 'pickup') return null
  const confirmation = order.pickupConfirmation || {}
  const ready = !order.internationalShipping || ['arrived_ethiopia', 'delivered'].includes(order.internationalShipping.status)
  const complete = Boolean(confirmation.customerAt && confirmation.operatorAt)
  const confirmed = Boolean(confirmation[party === 'customer' ? 'customerAt' : 'operatorAt'])
  return <section className="order-card">
    <h3>{order.internationalShipping ? 'Collect in Ethiopia' : 'Collect from store'}</h3>
    <p>{order.pickupAddress?.name || order.assignedStoreSnapshot?.name}</p>
    <p>{order.pickupAddress?.address || addressText(order.pickupAddress)}</p>
    {order.pickupAddress?.phone && <p>Collection contact: {order.pickupAddress.phone}</p>}
    <p>Customer: {confirmation.customerAt ? 'Confirmed' : 'Awaiting confirmation'} | Store/Admin: {confirmation.operatorAt ? 'Confirmed' : 'Awaiting confirmation'}</p>
    {confirmation.customerAt && <p>Customer confirmation: {new Date(confirmation.customerAt).toLocaleString()} - {confirmation.customerNote}</p>}
    {confirmation.operatorAt && <p>Store/Admin confirmation: {new Date(confirmation.operatorAt).toLocaleString()} - {confirmation.operatorNote}</p>}
    <p>{complete ? 'Collection cross-checked and complete.' : 'Both parties must confirm physical collection. Do not confirm before receiving/handing over the products.'}</p>
    {!ready && <p>Awaiting arrival in Ethiopia. International shipping charges still apply.</p>}
    {error && <p role="alert">{error}</p>}
    {!complete && !confirmed && order.fulfillmentStatus !== 'cancelled' && ready && <>
      <label>Collection note / handover reference<input maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} /></label>
      <button className="solid-button" disabled={busy || !note.trim()} onClick={async () => {
        if (guard.current) return
        guard.current = true
        setBusy(true); setError('')
        try {
          await deliveryRequest(`checkouts/${order.checkoutGroup}/orders/${order._id}/pickup-confirmation`, {
            method: 'POST', data: { party, note: note.trim() },
          })
          await onSaved()
        } catch (failure) { setError(failure.message) }
        finally { guard.current = false; setBusy(false) }
      }}>{party === 'customer' ? 'I collected my products' : 'Confirm products handed to customer'}</button>
    </>}
  </section>
}
