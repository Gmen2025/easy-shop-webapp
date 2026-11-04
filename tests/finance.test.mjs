import test from 'node:test'
import assert from 'node:assert/strict'
import { accountPath, financeMoney, payoutAmount, validateFinanceAccount, validateFinanceReport } from '../src/utils/finance.js'

const summary = { gross: 0, categories: Object.fromEntries(['products', 'delivery', 'rides', 'services'].map((category) =>
  [category, { gross: 0, adduGenetIncome: 0, independentIncome: 0 }])),
adduGenetIncome: 0, ownedIncome: 0, platformFees: 0, serviceIncome: 0, independentIncome: 0, unallocatedIncome: 0 }

test('account paths encode IDs and only accept supported operator types', () => {
  assert.equal(accountPath('store', 'me'), '/finance/accounts/store/me')
  assert.equal(accountPath('driver', 'a/b'), '/finance/accounts/driver/a%2Fb')
  assert.throws(() => accountPath('user', 'me'), /Invalid/)
  assert.throws(() => accountPath('store', ''), /Invalid/)
})

test('payout inputs reject zero, negative, missing, nonfinite and sub-cent amounts', () => {
  for (const value of ['', ' ', '-1', '0', 'NaN', 'Infinity', '1.001']) assert.throws(() => payoutAmount(value))
  assert.equal(payoutAmount('10.01'), 10.01)
  assert.equal(payoutAmount('0.29'), 0.29)
  assert.throws(() => financeMoney(NaN, 'USD'))
  assert.throws(() => financeMoney(1, 'EUR'))
  assert.match(financeMoney(1, 'ETB'), /1\.00/)
})

test('income response validation requires per-currency balances and all account surfaces', () => {
  const data = { account: { _id: 'store' }, entries: [], payouts: [], products: [], inventory: [], locations: [],
    periods: Object.fromEntries(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map((period) =>
      [period, Object.fromEntries(['ETB', 'USD'].map((currency) => [currency, summary]))])),
    balances: ['ETB', 'USD'].map((currency) => ({ currency, available: 0, pending: 0, paidOut: 0, totalEarned: 0, collected: 0, shortfall: 0, cashReceived: 0 })) }
  assert.equal(validateFinanceAccount(data), data)
  assert.throws(() => validateFinanceAccount({ ...data, balances: [data.balances[0]] }), /incomplete/)
  assert.throws(() => validateFinanceAccount({}), /incomplete/)
})

test('ownership reporting requires every period in each currency, not a success-shaped empty fallback', () => {
  const data = { reports: Object.fromEntries(['ETB', 'USD'].map((currency) => [currency,
    Object.fromEntries(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map((period) => [period, summary]))])) }
  assert.equal(validateFinanceReport(data), data)
  assert.throws(() => validateFinanceReport({ reports: { ETB: data.reports.ETB } }), /incomplete/)
})
