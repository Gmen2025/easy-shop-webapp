import { deliveryModeLabel } from '../utils/delivery'

export default function DeliveryWindow({ value }) {
  return <div className="section-note">
    <strong>{deliveryModeLabel(value.deliveryMode)}</strong>
    {value.deliveryWindowStart && value.deliveryWindowEnd ? <p>
      {new Date(value.deliveryWindowStart).toLocaleString()} - {new Date(value.deliveryWindowEnd).toLocaleString()}
    </p> : null}
  </div>
}
