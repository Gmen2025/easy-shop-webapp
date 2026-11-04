import test from 'node:test'
import assert from 'node:assert/strict'
import { rm, readFile } from 'node:fs/promises'
import {
  createFinancialClient, decimalAmount, financialError, minorMoney, moneyFields, validateWorkspace, workspacePath,
} from '../src/utils/financialManagement.js'

const totals = Object.fromEntries(['incomeMinor', 'expenseMinor', 'netIncomeMinor', 'cashInMinor', 'cashOutMinor',
  'cashFlowMinor', 'cashMinor', 'savingsMinor', 'receivablesMinor', 'debtMinor', 'assetsMinor', 'liabilitiesMinor', 'netWorthMinor'].map((field) => [field, 12345]))
const fixture = {
  entity: { _id: 'personal', name: 'My personal ledger', ownerType: 'PERSONAL' },
  entities: [{ _id: 'personal', name: 'My personal ledger', ownerType: 'PERSONAL' }, { _id: 'business', name: 'Private business', ownerType: 'BUSINESS' }],
  accounts: [
    { _id: 'cash', entityId: 'personal', currency: 'ETB', name: 'Private cash', type: 'ASSET', subtype: 'CASH', balanceMinor: 12345 },
    { _id: 'savings', entityId: 'personal', currency: 'ETB', name: 'Savings account', type: 'ASSET', subtype: 'SAVINGS', balanceMinor: 10000 },
    { _id: 'card', entityId: 'personal', currency: 'ETB', name: 'Card account', type: 'LIABILITY', subtype: 'CREDIT_CARD', balanceMinor: 1000 },
  ],
  categories: [{ _id: 'food', entityId: 'personal', name: 'Private food', type: 'EXPENSE' }],
  goals: [{ _id: 'goal', name: 'House deposit', accountId: 'savings', savedMinor: 1000, targetMinor: 10000 }],
  transactions: [
    { _id: 'invoice', entityId: 'personal', currency: 'ETB', type: 'EXPENSE', description: 'Private invoice', date: '2026-01-02', amountMinor: 1000, paidMinor: 300, outstandingMinor: 700, status: 'PARTIAL', payments: [{ _id: 'p', amountMinor: 300, date: '2026-01-02', paymentMethod: 'CASH' }] },
    { _id: 'reversed', entityId: 'personal', currency: 'ETB', type: 'EXPENSE', description: 'Corrected invoice', date: '2026-01-02', amountMinor: 1000, paidMinor: 0, outstandingMinor: 0, status: 'REVERSED', reversed: true },
    { _id: 'credit', entityId: 'personal', currency: 'ETB', type: 'EXPENSE', description: 'Card purchase', date: '2026-01-03', amountMinor: 2000, paidMinor: 2000, outstandingMinor: 0, liabilityOutstandingMinor: 2000, creditPurchase: true, liabilityStatus: 'OUTSTANDING', status: 'PAID' },
  ],
  audit: [{ _id: 'audit', action: 'CREATE_TRANSACTION', at: '2026-01-01', resourceId: 'invoice' }],
  settings: { lockedThrough: '2025-12-31' },
  constants: {
    accountTypes: ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'],
    accountSubtypes: { ASSET: ['CASH', 'CHECKING', 'SAVINGS', 'PROPERTY', 'INVESTMENT'], LIABILITY: ['CREDIT_CARD', 'LOAN'] },
    paymentMethods: ['CASH', 'BANK_TRANSFER', 'CARD', 'CHECK', 'OTHER'], transferKinds: ['ACCOUNT', 'SALARY', 'OWNER_DRAW', 'BUSINESS_PERSONAL_EXPENSE', 'PERSONAL_BUSINESS_EXPENSE'],
  },
  pagination: { transactions: { page: 1, total: 3, pages: 1 }, audit: { page: 1, total: 1, pages: 1 } },
  combinedNetWorth: [{ currency: 'ETB', netWorthMinor: 12345, asOf: '2026-01-31' }, { currency: 'USD', netWorthMinor: 1200, asOf: '2026-01-31' }],
  report: {
    from: '2026-01-01', to: '2026-01-31', currency: 'ETB', totals,
    series: {
      monthlyIncomeExpense: [{ date: '2026-01', incomeMinor: 12345, expenseMinor: 1000 }],
      spending: [], category: [], savings: [], debt: [], cashflow: [],
    },
    balanceSheet: { assetsMinor: 12345, liabilitiesMinor: 1000, equityMinor: 11345, netWorthMinor: 11345, balanced: true, accounts: [{ _id: 'cash', name: 'Historical cash', type: 'ASSET', balanceMinor: 5000 }] },
    incomeStatement: { incomeMinor: 12345, expenseMinor: 1000, netIncomeMinor: 11345 },
    trialBalance: { accounts: [{ accountId: 'cash', name: 'Private cash', debitMinor: 12345, creditMinor: 0 }], debitMinor: 12345, creditMinor: 12345, balanced: true },
    journal: [{ _id: 'j', date: '2026-01-01', description: 'Immutable opening', kind: 'OPENING', lines: [{ accountId: 'cash', debitMinor: 12345, creditMinor: 0 }] }],
    journalPagination: { page: 1, total: 1, pages: 1 },
  },
}

test('money preserves integer minor precision and never turns malformed values into zero', () => {
  assert.equal(minorMoney(0, 'ETB'), 'ETB 0.00')
  assert.equal(minorMoney(-123, 'USD'), 'USD -1.23')
  assert.equal(minorMoney(Number.MAX_SAFE_INTEGER, 'USD'), 'USD 90,071,992,547,409.91')
  for (const value of [NaN, Infinity, null, undefined, '100', 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(minorMoney(value, 'ETB'), 'Unavailable')
  assert.equal(minorMoney(100, 'EUR'), 'Unavailable')
  assert.equal(decimalAmount('00012.3'), '12.30')
  assert.equal(decimalAmount('0', { zero: true }), '0.00')
  assert.equal(decimalAmount('-12.34', { signed: true }), '-12.34')
  assert.equal(decimalAmount('10000000000'), '10000000000.00')
  for (const value of ['', ' ', '-1', '1e3', '1.234', 'NaN', 'Infinity', '0', '10000000000.01', '90071992547409.92']) assert.throws(() => decimalAmount(value))
  assert.deepEqual(moneyFields({ amount: '12.3', accountId: '', description: 'Invoice' }, { amount: {} }), { amount: '12.30', description: 'Invoice' })
})

test('workspace requires complete owner-scoped snapshots and explicit currency/date/pagination filters', () => {
  assert.equal(validateWorkspace(fixture), fixture)
  assert.throws(() => validateWorkspace({}), /incomplete/)
  assert.throws(() => validateWorkspace({ ...fixture, accounts: [{ ...fixture.accounts[0], entityId: 'another-owner' }] }), /mixed-entity/)
  assert.throws(() => validateWorkspace({ ...fixture, accounts: [{ ...fixture.accounts[0], balanceMinor: null }] }), /invalid/)
  assert.throws(() => validateWorkspace(fixture, { entityId: 'business' }), /mixed-entity/)
  assert.throws(() => validateWorkspace(fixture, { currency: 'USD' }), /mixed-entity/)
  assert.throws(() => validateWorkspace({ ...fixture, transactions: [{ ...fixture.transactions[0], entityId: 'business' }] }), /mixed-entity/)
  assert.equal(workspacePath({ entityId: 'a/b', currency: 'USD', period: 'custom', from: '2026-01-01', to: '2026-01-31', page: 2, empty: '' }),
    '/financial-management/workspace?entityId=a%2Fb&currency=USD&period=custom&from=2026-01-01&to=2026-01-31&page=2')
  assert.equal(financialError({ payload: { error: { code: 'LOCKED', message: 'Period locked' } }, message: 'Request failed' }), 'Period locked')
})

test('manual API flows retain idempotency keys after uncertain failure and reject duplicate concurrent saves', async () => {
  const calls = []
  let fails = true
  let sequence = 0
  let release
  const client = createFinancialClient(async (path, options) => {
    calls.push({ path, options })
    if (!options) return fixture
    if (fails) { fails = false; throw new Error('Connection interrupted after posting') }
    if (path.endsWith('/transfers')) await new Promise((resolve) => { release = resolve })
    return { transaction: { _id: 'saved' } }
  }, () => `key-${++sequence}`)
  assert.equal((await client.workspace({ entityId: 'personal', currency: 'ETB' })).entity._id, 'personal')
  const body = { entityId: 'personal', currency: 'ETB', amount: '12.00', paidAmount: '0.00' }
  await assert.rejects(client.save('/transactions', 'POST', body, true), /interrupted/)
  await client.save('/transactions', 'POST', body, true)
  const first = JSON.parse(calls[1].options.body)
  assert.equal(first.requestKey, JSON.parse(calls[2].options.body).requestKey)
  assert.equal(first.amount, '12.00')
  const pending = client.save('/transfers', 'POST', body, true)
  await assert.rejects(client.save('/transfers', 'POST', body, true), /already being saved/)
  release(); await pending
  for (const path of ['/accounts', '/transactions/invoice/payments', '/transactions/invoice/reverse']) {
    await client.save(path, 'POST', body, true)
    assert.match(JSON.parse(calls.at(-1).options.body).requestKey, /^key-/)
    assert.equal(calls.at(-1).path, `/financial-management${path}`)
  }
  await client.save('/goals/goal', 'PUT', { savedAmount: '10.00' })
  assert.equal('requestKey' in JSON.parse(calls.at(-1).options.body), false)
  assert.ok(calls.every(({ path }) => path.startsWith('/financial-management/')))
})

test('rendered owner-private workspace covers forms, reports, credit cards, history and failures', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter } = await import('react-router-dom')
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'E_Shopping' } })
  const cacheDir = '.financial-management-test-cache'
  const hookId = '\0virtual:tracker-hooks'
  const resourceId = '\0virtual:tracker-resource'
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'financial-management-fixture', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:tracker-hooks') return hookId; if (id === 'virtual:tracker-resource') return resourceId },
      load(id) {
        if (id === hookId) return `let tab='Overview', index=0
          export function reset(value) { tab=value; index=0 }
          export function useState(initial) { const i=index++; return [i===1 ? tab : typeof initial==='function' ? initial() : initial, () => {}] }`
        if (id === resourceId) return `let state={}
          export function setup(value) {state=value}
          export default function resource() {return state}`
      },
      transform(code, id) {
        if (id.endsWith('/FinancialManagementPage.jsx')) return code.replace("from 'react'", "from 'virtual:tracker-hooks'")
          .replace("from '../features/financialManagement/useFinancialWorkspace'", "from 'virtual:tracker-resource'")
      },
    }],
  })
  try {
    const { default: Page, LedgerForm, AccountForm, TransactionForm, TransferForm } = await server.ssrLoadModule('/src/pages/FinancialManagementPage.jsx')
    const { reset } = await server.ssrLoadModule('virtual:tracker-hooks')
    const { setup } = await server.ssrLoadModule('virtual:tracker-resource')
    const resource = { data: fixture, busy: false, loading: false, error: '', notice: '', reload: async () => {}, save: async () => true }
    setup(resource)
    const render = (tab) => { reset(tab); return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Page))) }
    for (const [tab, text] of [
      ['Overview', /Combined net worth/], ['Businesses', /Create business/], ['Dashboard', /ETB 123.45/],
      ['Accounts', /Opening balance/], ['Categories', /Create category \/ subcategory/],
      ['Transfers & Debt', /Record transfer \/ borrowing \/ repayment/],
      ['Savings Goals', /House deposit/], ['Statements', /Immutable opening/], ['Settings & Audit', /CREATE_TRANSACTION/],
    ]) assert.match(render(tab), text, tab)
    assert.doesNotMatch(render('Transfers & Debt'), /<option value="SALARY"/)
    assert.match(render('Transfers & Debt'), /<option value="PERSONAL_BUSINESS_EXPENSE"/)
    setup({ ...resource, data: { ...fixture, entity: fixture.entities[1] } })
    assert.match(render('Transfers & Debt'), /<option value="SALARY"/)
    assert.match(render('Transfers & Debt'), /<option value="BUSINESS_PERSONAL_EXPENSE"/)
    assert.doesNotMatch(render('Transfers & Debt'), /<option value="PERSONAL_BUSINESS_EXPENSE"/)
    setup(resource)
    const transactions = render('Income & Expenses')
    assert.match(transactions, /ETB 7.00/)
    assert.match(transactions, /Record invoice payment/)
    assert.match(transactions, /Recorded payments/)
    assert.match(transactions, /card debt ETB 20.00/)
    assert.match(transactions, /Reversed — original entry retained/)
    assert.doesNotMatch(transactions, /Reverse Corrected invoice/)
    setup({ ...resource, data: { ...fixture, constants: { ...fixture.constants,
      paymentMethods: ['CASH', 'BANK_TRANSFER', 'CARD', 'DEBIT_CARD', 'CREDIT_CARD', 'MOBILE_MONEY', 'BUY_NOW_PAY_LATER', 'PERSONAL_LOAN'],
    } } })
    const extendedMethods = render('Income & Expenses')
    for (const method of ['DEBIT_CARD', 'MOBILE_MONEY']) {
      assert.equal(extendedMethods.split(`<option value="${method}">`).length - 1, 2, `${method} available for invoice and settlement`)
    }
    for (const method of ['CREDIT_CARD', 'BUY_NOW_PAY_LATER', 'PERSONAL_LOAN']) {
      assert.equal(extendedMethods.split(`<option value="${method}">`).length - 1, 1, `${method} available only for new liability-funded purchases`)
    }
    setup(resource)
    assert.match(render('Overview'), /USD 12.00/)
    setup({ ...resource, data: { ...fixture, combinedNetWorth: [{
      ...fixture.combinedNetWorth[0],
      entities: [
        { entityId: 'personal', name: 'Personal breakdown', ownerType: 'PERSONAL', assetsMinor: 12000, liabilitiesMinor: 2000, netWorthMinor: 10000 },
        { entityId: 'business', name: 'Business A breakdown', ownerType: 'BUSINESS', assetsMinor: 3345, liabilitiesMinor: 1000, netWorthMinor: 2345 },
      ],
    }] } })
    const breakdown = render('Overview')
    assert.match(breakdown, /Personal breakdown \(Personal\)/)
    assert.match(breakdown, /Business A breakdown \(Business\)/)
    assert.match(breakdown, /ETB 100.00/)
    assert.match(breakdown, /ETB 23.45/)
    assert.match(breakdown, /Combined total: ETB 123.45/)
    setup(resource)
    assert.match(render('Dashboard'), /<svg/)
    assert.match(render('Statements'), /Historical cash.*ETB 50.00/)
    reset('Overview')
    const accountForm = AccountForm({ data: fixture, resource, currency: 'USD' })
    assert.equal(accountForm.props.path, '/accounts')
    assert.equal(accountForm.props.idempotent, true)
    assert.deepEqual(accountForm.props.payload({ name: 'Cash', type: 'ASSET', subtype: 'CASH', openingBalance: '12.3', dueDate: '' }),
      { name: 'Cash', type: 'ASSET', subtype: 'CASH', openingBalance: '12.30', entityId: 'personal', currency: 'USD' })
    reset('Overview')
    const invoiceForm = TransactionForm({ data: fixture, resource, currency: 'ETB', accounts: fixture.accounts })
    assert.equal(invoiceForm.props.idempotent, true)
    assert.throws(() => invoiceForm.props.payload({ amount: '10', paidAmount: '11', accountId: 'cash' }), /exceed/)
    assert.throws(() => invoiceForm.props.payload({ amount: '10', paidAmount: '1', accountId: '' }), /Select the account/)
    const creditBody = invoiceForm.props.payload({ amount: '20', paidAmount: '0', accountId: 'card', categoryId: 'food', type: 'EXPENSE' })
    assert.equal(creditBody.paidAmount, '0.00')
    assert.equal(creditBody.entityId, 'personal')
    assert.equal(creditBody.currency, 'ETB')
    assert.equal(creditBody.accountId, 'card')
    reset('Overview')
    const transferTree = TransferForm({ data: fixture, resource, currency: 'ETB' })
    const transfer = transferTree.props.children.find((child) => child?.type === LedgerForm)
    assert.equal(transfer.props.path, '/transfers')
    assert.equal(transfer.props.idempotent, true)
    assert.deepEqual(transfer.props.payload({ amount: '5', kind: 'OWNER_DRAW', fromAccountId: 'cash', toEntityId: 'business', toAccountId: 'businessCash' }),
      { amount: '5.00', kind: 'OWNER_DRAW', fromAccountId: 'cash', toEntityId: 'business', toAccountId: 'businessCash', fromEntityId: 'personal', currency: 'ETB' })
    setup({ ...resource, data: null, error: 'Owner workspace not found' })
    assert.match(render('Accounts'), /role="alert">Owner workspace not found/)
    assert.doesNotMatch(render('Accounts'), /Private cash/)
    setup({ ...resource, busy: true })
    assert.match(render('Businesses'), /<fieldset disabled=""/)
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'FormData')
    Object.defineProperty(globalThis, 'FormData', { configurable: true, value: class { constructor(form) { return new Map(form.values) } } })
    try {
      const saved = []
      reset('Overview')
      const form = LedgerForm({ title: 'Manual invoice', resource: { busy: false, save: async (...args) => { saved.push(args); return true } },
        path: '/transactions', method: 'POST', idempotent: true, payload: (body) => moneyFields(body, { amount: {} }), children: null })
      let resets = 0
      await form.props.onSubmit({ preventDefault() {}, currentTarget: { values: [['amount', '12.34']], reset() { resets++ } } })
      assert.deepEqual(saved[0], ['/transactions', 'POST', { amount: '12.34' }, true])
      assert.equal(resets, 1)
      const failed = LedgerForm({ title: 'Uncertain posting', resource: { busy: false, save: async () => false }, path: '/transactions', payload: (body) => body, children: null })
      await failed.props.onSubmit({ preventDefault() {}, currentTarget: { values: [['amount', '12.34']], reset() { throw new Error('Failed posts must retain input for retries') } } })
      const invalid = LedgerForm({ title: 'Invalid', resource: { save: async () => { throw new Error('Should not save') } },
        path: '/transactions', payload: (body) => moneyFields(body, { amount: {} }), children: null })
      await invalid.props.onSubmit({ preventDefault() {}, currentTarget: { values: [['amount', 'NaN']], reset() { throw new Error('Should not reset') } } })
    } finally { Object.defineProperty(globalThis, 'FormData', descriptor) }
    const originalFetch = globalThis.fetch
    try {
      const calls = []
      const { apiRequest } = await server.ssrLoadModule('/src/api/client.js')
      globalThis.fetch = async (url, options) => {
        calls.push({ url, options })
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => options.method ? { transaction: { _id: 'created' } } : fixture }
      }
      const client = createFinancialClient(apiRequest, () => 'region-safe-request')
      await client.workspace({ entityId: 'personal', currency: 'ETB' })
      await client.save('/transactions', 'POST', creditBody, true)
      await client.save('/transactions/invoice/payments', 'POST', { amount: '7.00', accountId: 'cash', paymentMethod: 'CASH', date: '2026-01-03' }, true)
      await client.save('/transactions/invoice/reverse', 'POST', { reason: 'Correct error', date: '2026-01-04' }, true)
      for (const call of calls) assert.equal(call.options.headers['x-database-name'], 'E_Shopping')
      assert.match(calls[0].url, /\/financial-management\/workspace\?entityId=personal&currency=ETB$/)
      assert.equal(JSON.parse(calls[1].options.body).accountId, 'card')
      assert.equal(JSON.parse(calls[1].options.body).requestKey, 'region-safe-request')
      globalThis.fetch = async () => ({ ok: false, status: 409, headers: { get: () => 'application/json' }, json: async () => ({ error: { code: 'LOCKED', message: 'Posting period locked' } }) })
      await assert.rejects(client.save('/transactions', 'POST', creditBody, true), (error) => financialError(error) === 'Posting period locked')
    } finally { globalThis.fetch = originalFetch }
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
  }
})

test('admin route and navigation remain separate from store/driver finance', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /path="admin\/financial-management" element=\{isAuthenticated && isAdmin/)
  assert.match(app, /path="admin\/income" element=\{isAuthenticated && isAdmin \? <FinancePage admin/)
  const nav = await readFile(new URL('../src/utils/adminDashboard.js', import.meta.url), 'utf8')
  assert.match(nav, /Revenue & Expense Tracker.*\/admin\/financial-management/)
})
