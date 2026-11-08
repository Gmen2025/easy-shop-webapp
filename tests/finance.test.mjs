import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

test('store income design preserves currency totals, disabled payout access and all account sections', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter, Routes, Route } = await import('react-router-dom')
  const cacheDir = await mkdtemp(join(tmpdir(), 'income-design-'))
  const id = '\0virtual:income-design-resource'
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'income-design-fixture', enforce: 'pre',
      resolveId(name) { if (name === 'virtual:income-design-resource') return id },
      load(name) {
        if (name === id) return `let fixture
          export function setup(value) { fixture = value }
          export default function resource(path, validate) {
            if (path !== '/finance/accounts/store/me') throw new Error('Unexpected account path')
            return { data: validate(fixture), loading: false, error: '', reload: async () => {} }
          }
          export function useCompanyAction() { return { busy: false, error: '', notice: '', run: async () => {} } }`
      },
      transform(code, name) {
        if (name.endsWith('/FinancePage.jsx')) return code.replace("from '../features/company/useCompanyResource'", "from 'virtual:income-design-resource'")
      },
    }],
  })
  try {
    const { default: Page } = await server.ssrLoadModule('/src/pages/FinancePage.jsx')
    const { setup } = await server.ssrLoadModule('virtual:income-design-resource')
    setup({ account: { _id: 'store1', name: 'Sample Market', payoutsEnabled: false, isCompanyOwned: false },
      entries: [], products: [], inventory: [], locations: [], schedule: 'Manual schedule',
      payouts: [{ _id: 'etb', currency: 'ETB', amount: 20, payoutType: 'early', status: 'pending', dateRequested: '2026-11-01' },
        { _id: 'usd', currency: 'USD', amount: 7, payoutType: 'early', status: 'paid', dateRequested: '2026-11-01' }],
      periods: Object.fromEntries(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map((period) =>
        [period, Object.fromEntries(['ETB', 'USD'].map((currency) => [currency, { ...summary, gross: 125.5, independentIncome: 100 }]))])),
      balances: ['ETB', 'USD'].map((currency) => ({ currency, available: 50, pending: 10, paidOut: 20, totalEarned: 100, collected: 80, shortfall: 0, cashReceived: 5 })),
    })
    const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/income/store'] },
      createElement(Routes, null, createElement(Route, { path: '/income/:kind', element: createElement(Page) }))))
    for (const title of ['Store Income &amp; Payouts', 'Sample Market', 'Gross completed income', 'Lifetime collected balance',
      'Request a manual payout', 'Recent payouts', 'Recent completed transactions', 'Products &amp; inventory']) assert.ok(markup.includes(title), title)
    assert.match(markup, /ETB\s125\.50/)
    assert.ok(!/USD\s7\.00/.test(markup), 'Payout history must remain currency-specific')
    assert.match(markup, /<fieldset disabled=""/)
    assert.match(markup, /aria-pressed="true"[^>]*>7 Days/)
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
