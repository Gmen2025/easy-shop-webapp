export const TRACKER_PREFIX = '/financial-management'
export const TRACKER_PERIODS = ['daily', 'weekly', 'monthly', 'yearly', 'custom']

export function minorMoney(value, currency) {
  if (!Number.isSafeInteger(value) || !['ETB', 'USD'].includes(currency)) return 'Unavailable'
  const amount = BigInt(value)
  const absolute = amount < 0n ? -amount : amount
  return `${currency} ${amount < 0n ? '-' : ''}${(absolute / 100n).toLocaleString('en-US')}.${String(absolute % 100n).padStart(2, '0')}`
}

export function decimalAmount(value, { zero = false, signed = false } = {}) {
  const text = String(value ?? '').trim()
  if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(text)) {
    throw new Error('Enter a money amount with at most two decimal places.')
  }
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.')
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (minor > 1000000000000n || (!zero && minor === 0n)) {
    throw new Error('Amount must be within 10,000,000,000.00 and greater than zero unless an opening balance or allocation.')
  }
  return `${negative ? '-' : ''}${BigInt(whole)}.${fraction.padEnd(2, '0')}`
}

export function workspacePath(filters) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value !== '' && value != null) query.set(key, String(value))
  return `${TRACKER_PREFIX}/workspace?${query}`
}

export function validateWorkspace(data, filters = {}) {
  if (!data?.entity?._id || !['PERSONAL', 'BUSINESS'].includes(data.entity.ownerType) ||
      ['entities', 'accounts', 'categories', 'goals', 'transactions', 'audit'].some((key) => !Array.isArray(data[key])) ||
      !data.constants || !data.settings || !data.report || !data.pagination) {
    throw new Error('The server returned an incomplete accounting workspace. No balances can be displayed.')
  }
  for (const account of data.accounts) {
    if (account.entityId !== data.entity._id || !Number.isSafeInteger(account.balanceMinor) ||
        (filters.currency && account.currency !== filters.currency)) {
      throw new Error('The server returned an invalid or mixed-entity ledger.')
    }
    if ((filters.entityId && data.entity._id !== filters.entityId) ||
        (filters.currency && data.report.currency !== filters.currency) ||
        data.transactions.some((entry) => entry.entityId !== data.entity._id || (filters.currency && entry.currency !== filters.currency))) {
      throw new Error('The server returned an invalid or mixed-entity ledger.')
    }
  }
  return data
}

export function financialError(error) {
  return error?.payload?.error?.message || error?.message || 'Unable to save. Retry the same entry safely.'
}

export function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formValues(form) {
  return Object.fromEntries(new FormData(form))
}

export function moneyFields(body, fields) {
  const result = { ...body }
  for (const [field, options] of Object.entries(fields)) {
    if (result[field] !== undefined && result[field] !== '') result[field] = decimalAmount(result[field], options)
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== ''))
}

export function createFinancialClient(request, key = () => globalThis.crypto.randomUUID()) {
  const retries = new Map()
  let busy = false
  return {
    workspace: async (filters) => validateWorkspace(await request(workspacePath(filters)), filters),
    async save(path, method, body, idempotent = false) {
      if (busy) throw new Error('An accounting entry is already being saved.')
      busy = true
      const fingerprint = JSON.stringify([path, method, body])
      if (idempotent && !retries.has(fingerprint)) retries.set(fingerprint, key())
      try {
        const result = await request(`${TRACKER_PREFIX}${path}`, {
          method, body: JSON.stringify(idempotent ? { ...body, requestKey: retries.get(fingerprint) } : body),
        })
        retries.delete(fingerprint)
        return result
      } finally { busy = false }
    },
  }
}
