import { addressText, latLng } from '../utils/delivery'
import { internationalDestinationLegs, money, paymentAmount, shippingRoute } from '../utils/checkoutPayment'
import DeliveryMap from './DeliveryMap'
import InternationalShipmentDetails from './InternationalShipmentDetails'

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

export function InternationalReceipt({ group, admin = false, onUpdated }) {
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
      <InternationalShipmentDetails groupId={group._id} shipment={shipment} admin={admin} onUpdated={onUpdated} />
    </article>)}
    {internationalDestinationLegs(group).map((leg) => <section key={leg.key}>
      <h4>{route.destination} {leg.kind === 'delivery' ? 'final-delivery route' : 'collection location'}</h4>
      {leg.kind === 'delivery' ? <p>From {route.destination} collection/dispatch: {addressText(leg.origin) || 'Not configured in this checkout'}.
        {' '}To recipient: {addressText(leg.destination)}.</p> : <p>Collect at: {addressText(leg.destination) || 'Not configured in this checkout'}.</p>}
      {leg.kind === 'delivery' && !latLng(leg.origin?.location) ? <p role="status">
        The {route.destination} dispatch origin is not configured in this saved checkout. Only the recipient pin is shown, not a driving route from your current location.
        Admin must save the collection/dispatch address, then recalculate an unprepared quote. Prepared payments keep their saved snapshot.
      </p> : null}
      {latLng(leg.destination?.location) ? <DeliveryMap pickup={leg.origin?.location} dropoff={leg.destination.location} requirePickupOrigin /> :
        <p role="status">No verified {route.destination} destination pin is available in this checkout.</p>}
      <p>Destination maps are previews only; they do not recalculate shipping or final-delivery fees.</p>
    </section>)}
  </section>
}
