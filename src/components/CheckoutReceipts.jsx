import { addressText } from '../utils/delivery'
import { money, paymentAmount, shippingRoute } from '../utils/checkoutPayment'

export function ExchangeReceipt({ value }) {
  if (!value.exchangeRate) return null
  return <section className="order-card">
    <h3>Saved payment: {money(paymentAmount(value), value.paymentCurrency || value.currency)}</h3>
    <p>Locked exchange rate: 1 USD = {value.exchangeRate.birrPerUsd} ETB</p>
    <p>Applied {new Date(value.exchangeRate.appliedAt).toLocaleString()} | {value.exchangeRate.source} | Revision {value.exchangeRate.revision}</p>
    <p>{value.exchangeRate.direction === 'usd-to-etb' ? 'US catalog and shipping costs remain USD.' : 'Ethiopia product/service costs remain ETB.'}
      {' '}Payment recovery and refunds use saved payment amounts, never a new conversion.</p>
  </section>
}

export function InternationalReceipt({ group }) {
  if (!group.international) return null
  const route = shippingRoute(group.international.direction)
  return <section className="order-card">
    <h3>{route.origin}-to-{route.destination} shipping</h3>
    <p>{route.origin} consolidation hub: {addressText(group.international.hub)}</p>
    <p>International shipping: {money(group.international.shippingFee, 'usd')} (once per recipient)</p>
    <p>{route.destination} final delivery: {money(group.finalDeliveryFee || 0, 'usd')}. Collection omits final delivery, not shipping.</p>
    <p>{route.origin} driver status &quot;Delivered&quot; means arrival at the {route.origin} hub, not final delivery in {route.destination}.</p>
    <p>{group.international.customsNotice}</p>
    {group.status === 'bank_review' ? <p role="status">Transfer submitted for Admin review. Stock remains reserved.
      Fulfillment is blocked until funds are verified. Do not pay again.</p> : null}
    {group.international.shipments.map((shipment) => <article className="order-card" key={shipment.id}>
      <h4>{shipment.recipient.label}: {shipment.status}</h4>
      <p>{route.destination} recipient: {addressText(shipment.recipient)} | {shipment.recipient.phone}</p>
      <p>Actual weight: {shipment.weightKg} kg | Volumetric: {shipment.volumetricKg} kg | Billable: {shipment.billableKg} kg</p>
      <p>Shipping: {money(shipment.shippingUsd, 'usd')} | {shipment.carrier || 'Carrier pending'} {shipment.trackingNumber || ''}</p>
      {(shipment.history || []).map((entry, index) => <p key={index}>{entry.status} - {new Date(entry.at).toLocaleString()} - {entry.note}</p>)}
    </article>)}
  </section>
}
