export function addressCountryCode(country = '') {
  if (/^(usa|us|united states(?: of america)?)$/i.test(String(country).trim())) return 'us'
  if (/^(ethiopia|ethio|et)$/i.test(String(country).trim())) return 'et'
  return undefined
}

export function placeAddress(place) {
  const components = place.addressComponents || []
  const text = (type) => components.find((part) => part.types.includes(type))?.longText || ''
  const latitude = place.location?.lat()
  const longitude = place.location?.lng()
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('This suggestion has no map coordinates. Choose another address or enter it manually.')
  }
  const street = [text('street_number'), text('route')].filter(Boolean).join(' ')
  return {
    address1: street || place.formattedAddress || place.displayName || '',
    city: text('locality') || text('postal_town') || text('administrative_area_level_2') || text('administrative_area_level_1'),
    zip: [text('postal_code'), text('postal_code_suffix')].filter(Boolean).join('-'),
    country: text('country'),
    placeId: place.id,
    location: { type: 'Point', coordinates: [longitude, latitude] },
  }
}

export function editAddress(address, field, value) {
  const next = { ...address, [field]: value }
  if (['address1', 'address2', 'city', 'zip', 'country'].includes(field)) {
    delete next.placeId
    delete next.location
    delete next.latitude
    delete next.longitude
  }
  return next
}
