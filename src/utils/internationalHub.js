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

const SETTLED_CHARGE_STATUSES = ['paid', 'waived']
const CHARGE_STATUS_HINTS = {
  awaiting_payment: 'Payment due', bank_review: 'Bank transfer under review', paid: 'Paid', waived: 'No charges due',
}

// The five hub steps with done/current/pending state and a waiting hint, so operators always see the whole workflow.
export function internationalHubSteps(shipment) {
  const destination = shipment?.destination || null
  const stage = INTERNATIONAL_DESTINATION_STAGES.indexOf(destination?.stage)
  const charges = destination?.charges || null
  const settled = Boolean(charges) && SETTLED_CHARGE_STATUSES.includes(charges.status)
  const delivered = shipment?.status === 'delivered' || destination?.stage === 'delivered'
  const driver = destination?.driver || null
  const pickups = (shipment?.packages || []).filter((entry) => entry.fulfillmentMethod === 'pickup' && !entry.cancelled)
  const steps = [
    { key: 'arrive', label: 'Mark arrived', done: stage >= 1,
      hint: stage >= 1 ? '' : destination ? 'In transit — mark it arrived once it reaches customs.' : 'Mark the shipment arrived to start hub processing.' },
    { key: 'charges', label: 'Record customs & duty charges', done: Boolean(charges),
      hint: charges ? CHARGE_STATUS_HINTS[charges.status] || charges.status : stage >= 1 && !delivered ? 'Record the charges (or no charges) so the customer can pay.' : '' },
    { key: 'clear', label: 'Collect from customs', done: stage >= 2, hint: '' },
    { key: 'ready', label: 'Release for delivery / pickup', done: stage >= 3,
      hint: stage !== 2 || delivered ? '' : !charges ? 'Record the charges first.' : settled ? '' : 'Waiting for the customer to pay the charges.' },
    { key: 'complete', label: 'Deliver / hand over', done: delivered,
      hint: delivered || stage < 3 ? '' : driver?.pickedUpAt ? 'Driver is delivering.' : driver ? 'Waiting for the driver to pick up from the hub.'
        : pickups.length ? 'Hand over pickup packages; the customer confirms collection.' : 'Dispatch a driver to deliver.' },
  ]
  const current = steps.findIndex((step) => !step.done)
  return steps.map((step, index) => ({ key: step.key, label: step.label, hint: step.hint,
    state: step.done ? 'done' : index === current && !delivered ? 'current' : 'pending' }))
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
