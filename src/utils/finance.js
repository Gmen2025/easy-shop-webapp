export function financeMoney(value, currency) {
  if (!Number.isFinite(value) || !['USD', 'ETB'].includes(currency)) throw new Error('Invalid financial amount or currency.')
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
}

export function payoutAmount(value) {
  const amount = Number(value)
  if (String(value).trim() === '' || !Number.isFinite(amount) || amount <= 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) throw new Error('Enter a positive amount with at most two decimals.')
  return amount
}

const periods = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
const currencies = ['ETB', 'USD']
const validSummary = (summary) => summary &&
  ['gross', 'adduGenetIncome', 'ownedIncome', 'platformFees', 'serviceIncome', 'independentIncome', 'unallocatedIncome']
    .every((key) => Number.isFinite(summary[key])) &&
  ['products', 'delivery', 'rides', 'services'].every((category) =>
    ['gross', 'adduGenetIncome', 'independentIncome'].every((key) => Number.isFinite(summary.categories?.[category]?.[key])))

export function validateFinanceAccount(data) {
  if (!data?.account?._id || !Array.isArray(data.balances) || !Array.isArray(data.entries) ||
      !Array.isArray(data.payouts) || !Array.isArray(data.products) || !Array.isArray(data.inventory) ||
      !Array.isArray(data.locations) || periods.some((period) =>
        currencies.some((currency) => !validSummary(data.periods?.[period]?.[currency]))) || currencies.some((currency) =>
        !data.balances.some((balance) => balance.currency === currency &&
          ['available', 'pending', 'paidOut', 'totalEarned', 'collected', 'shortfall', 'cashReceived'].every((key) => Number.isFinite(balance[key]))))) {
    throw new Error('The server returned incomplete income data.')
  }
  return data
}

export function validateFinanceReport(data) {
  if (currencies.some((currency) => periods.some((period) => !validSummary(data?.reports?.[currency]?.[period])))) {
    throw new Error('The server returned incomplete ownership reporting.')
  }
  return data
}

export function accountPath(kind, accountId) {
  if (!['store', 'driver'].includes(kind) || !accountId) throw new Error('Invalid income account.')
  return `/finance/accounts/${kind}/${encodeURIComponent(accountId)}`
}
