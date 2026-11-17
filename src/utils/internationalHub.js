export const INTERNATIONAL_CHARGE_TYPES = [
  ['customs_duty', 'Customs duty'], ['tariff', 'Tariff'], ['tax', 'Import tax / VAT'],
  ['clearance', 'Clearance & handling'], ['storage', 'Storage'], ['other', 'Other'],
]

export const INTERNATIONAL_DESTINATION_STAGES = [
  'in_transit', 'in_customs', 'cleared', 'ready', 'dispatched',
  'out_for_delivery', 'awaiting_collection', 'delivered',
]

const STAGE_LABELS = {
  in_transit: 'In transit', in_customs: 'At customs', cleared: 'Cleared customs',
  ready: 'Ready', dispatched: 'Driver dispatched', out_for_delivery: 'Out for delivery',
  awaiting_collection: 'Awaiting collection', delivered: 'Delivered',
}
const CHARGE_LABELS = Object.fromEntries(INTERNATIONAL_CHARGE_TYPES)

export function allowedInternationalChargeMethods(currency) {
  const normalized = String(currency || '').toLowerCase()
  if (normalized === 'etb') return ['bank', 'telebirr']
  if (normalized === 'usd') return ['bank', 'card']
  return []
}

export function formatInternationalChargeAmount(value, currency) {
  const normalized = String(currency || '').toLowerCase()
  if (!['etb', 'usd'].includes(normalized) || !Number.isFinite(Number(value))) return 'Unavailable'
  return new Intl.NumberFormat(normalized === 'etb' ? 'en-ET' : 'en-US', {
    style: 'currency', currency: normalized.toUpperCase(), maximumFractionDigits: 2,
  }).format(Number(value))
}

export function internationalStageLabel(stage) {
  return STAGE_LABELS[stage] || String(stage || 'Unknown stage').replaceAll('_', ' ')
}

export function internationalChargeLabel(type, label) {
  return String(label || '').trim() || CHARGE_LABELS[type] || 'Charge'
}

export function buildInternationalChargesPayload(rows, note = '') {
  if (!Array.isArray(rows) || rows.length > 12) throw new Error('Enter no more than 12 customs charges.')
  const charges = rows.flatMap((row) => {
    const rawAmount = String(row?.amount ?? '').trim()
    if (!rawAmount) return []
    const amount = Number(rawAmount)
    if (!INTERNATIONAL_CHARGE_TYPES.some(([type]) => type === row?.type) || !Number.isFinite(amount) ||
      amount < 0 || amount > 10000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      throw new Error('Enter a valid non-negative charge with at most two decimal places.')
    }
    const label = String(row?.label || '').trim()
    if (row.type === 'other' && !label) throw new Error('Describe each other related cost.')
    return [{ type: row.type, amount, ...(label ? { label } : {}) }]
  })
  return { charges, ...(String(note).trim() ? { note: String(note).trim() } : {}) }
}
