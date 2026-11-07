import { deliveryModeLabel } from '../utils/delivery'

export default function DeliveryWindow({ value }) {
  if (!value.international && !value.internationalShipping &&
      (value.fulfillmentMethod === 'pickup' || value.deliveries?.length && value.deliveries.every((delivery) => delivery.fulfillmentMethod === 'pickup'))) return null
  return <div className="section-note">
    <strong>{deliveryModeLabel(value.deliveryMode)}</strong>
    {value.deliveryWindowStart && value.deliveryWindowEnd ? <p>
      {new Date(value.deliveryWindowStart).toLocaleString()} - {new Date(value.deliveryWindowEnd).toLocaleString()}
    </p> : null}
  </div>
}
