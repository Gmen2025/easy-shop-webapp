import { useState } from 'react'
import AddressAutocomplete from './AddressAutocomplete'
import { editAddress } from '../utils/addressAutocomplete'
import { ADDRESS_FIELDS, addressText } from '../utils/delivery'

export default function DeliveryAddressFields({ address, onChange }) {
  const [query, setQuery] = useState('')

  return <>
    <AddressAutocomplete key={address.country} label="Search delivery address" name="deliveryAddressSearch"
      placeholder="Type a street, building or landmark" value={query} country={address.country}
      onChange={setQuery} onSelect={(selected) => {
        setQuery('')
        onChange({ ...address, ...selected })
      }} />
    {address.placeId ? <p role="status">Map location: {addressText(address)}</p> : null}
    <div className="form-grid">{ADDRESS_FIELDS.map(([field, label]) => <label key={field}>{label}
      <input name={field} value={address[field] || ''} maxLength={300} onChange={(event) => {
        setQuery('')
        onChange(editAddress(address, field, event.target.value))
      }} />
    </label>)}</div>
  </>
}
