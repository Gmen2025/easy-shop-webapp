import { useState } from 'react'
import AdminNavigation from '../components/AdminNavigation'
import { getSelectedDatabaseName } from '../api/client'
import useFinancialWorkspace from '../features/financialManagement/useFinancialWorkspace'
import { formValues, localDate, minorMoney, moneyFields, TRACKER_PERIODS } from '../utils/financialManagement'
import './FinancialManagementPage.css'

const tabs = ['Overview', 'Businesses', 'Dashboard', 'Income & Expenses', 'Accounts', 'Categories', 'Transfers & Debt', 'Savings Goals', 'Statements', 'Settings & Audit']
const label = (value) => String(value).replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())

export default function FinancialManagementPage() {
  const [filters, setFilters] = useState({ entityId: '', currency: 'ETB', period: 'monthly', page: 1, auditPage: 1, journalPage: 1, combinedNetWorth: true })
  const resource = useFinancialWorkspace(filters)
  const [tab, setTab] = useState('Overview')
  const update = (key, value) => setFilters((current) => {
    const next = { ...current, [key]: value, page: 1, auditPage: 1, journalPage: 1 }
    if (key === 'period' && value !== 'custom') { delete next.from; delete next.to }
    return next
  })
  const data = resource.data
  return <section className="page-stack admin-console financial-tracker">
    <AdminNavigation />
    <h1>Revenue & Expense Tracker</h1>
    <p>Owner-private workspace · Region: {getSelectedDatabaseName()}. Other admins cannot access your records.</p>
    <p>Manual accrual accounting only. No store sales sync, driver earnings, payouts, bank connections or payment processing. ETB and USD remain separate; no currency conversion.</p>
    <fieldset disabled={resource.busy} className="tracker-filters">
      <legend>Ledger and reporting scope</legend>
      <label>Personal / business<select aria-label="Personal / business" value={filters.entityId || data?.entity._id || ''} onChange={(event) => update('entityId', event.target.value)}>
        {!data && <option value={filters.entityId}>Loading workspace</option>}
        {data?.entities.map((entity) => <option key={entity._id} value={entity._id}>{entity.name} ({label(entity.ownerType)})</option>)}
      </select></label>
      <label>Currency<select value={filters.currency} onChange={(event) => update('currency', event.target.value)}><option>ETB</option><option>USD</option></select></label>
      <label>Period<select value={filters.period} onChange={(event) => update('period', event.target.value)}>{TRACKER_PERIODS.map((period) => <option key={period} value={period}>{label(period)}</option>)}</select></label>
      {filters.period === 'custom' && <>
        <label>From<input type="date" required value={filters.from || ''} onChange={(event) => update('from', event.target.value)} /></label>
        <label>To<input type="date" required min={filters.from} value={filters.to || ''} onChange={(event) => update('to', event.target.value)} /></label>
      </>}
    </fieldset>
    <nav className="admin-tool-nav" aria-label="Accounting sections">{tabs.map((name) => <button key={name} aria-pressed={tab === name} disabled={resource.busy} onClick={() => setTab(name)}>{name}</button>)}</nav>
    {resource.loading && <p role="status">Loading private ledger…</p>}
    {resource.error && <p role="alert">{resource.error}</p>}
    {resource.notice && <p role="status">{resource.notice}</p>}
    <button disabled={resource.loading || resource.busy} onClick={resource.reload}>Refresh ledger</button>
    {data && <TrackerContent key={`${data.entity._id}:${filters.currency}:${tab}`} data={data} resource={resource} tab={tab} currency={filters.currency}
      page={filters.page} auditPage={filters.auditPage} setPage={(page) => setFilters((current) => ({ ...current, page }))}
      journalPage={filters.journalPage} setJournalPage={(journalPage) => setFilters((current) => ({ ...current, journalPage }))}
      setAuditPage={(auditPage) => setFilters((current) => ({ ...current, auditPage }))} />}
  </section>
}

function Field({ name, title = label(name), type = 'text', required = true, ...props }) {
  return <label>{title}<input name={name} type={type} required={required} {...props} /></label>
}

function Select({ name, title = label(name), options, required = true, blank = 'Select…', ...props }) {
  return <label>{title}<select name={name} required={required} {...props}><option value="">{blank}</option>
    {options.map((item) => <option key={item.value} value={item.value}>{item.title}</option>)}</select></label>
}
const choices = (values) => values.map((value) => ({ value, title: label(value) }))
const records = (values) => values.map((value) => ({ value: value._id, title: value.name }))

export function LedgerForm({ title, resource, path, method = 'POST', payload, idempotent = method === 'POST', children, submit = 'Save', reset = true }) {
  const [error, setError] = useState('')
  const send = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    setError('')
    try {
      const body = payload(formValues(form))
      if (await resource.save(path, method, body, idempotent)) { if (reset) form.reset() }
    } catch (failure) { setError(failure.message) }
  }
  return <form className="panel tracker-form" onSubmit={send} aria-label={title}>
    <h3>{title}</h3>
    <fieldset disabled={resource.busy}><legend className="tracker-sr">{title}</legend><div className="form-grid">{children}</div>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={resource.busy}>{resource.busy ? 'Saving…' : submit}</button>
    </fieldset>
  </form>
}

function TrackerContent({ data, resource, tab, currency, page, auditPage, setPage, setAuditPage, journalPage, setJournalPage }) {
  const entityId = data.entity._id
  const accounts = data.accounts.filter((account) => account.currency === currency)
  const scope = (body) => ({ ...body, entityId })
  const paymentAccounts = accounts.filter((account) => ['CASH', 'CHECKING', 'SAVINGS'].includes(account.subtype) || (account.type === 'LIABILITY' && !account.system))
  const paymentOptions = choices((data.constants.paymentMethods || []).filter((method) => !['CREDIT_CARD', 'BUY_NOW_PAY_LATER', 'PERSONAL_LOAN'].includes(method)))
  const date = <Field name="date" title="Posting date" type="date" defaultValue={localDate()} />
  const accountSelect = (name = 'accountId', title = 'Payment / receiving account', required = true) => <Select name={name} title={title} required={required} options={records(paymentAccounts)} />
  const money = (value) => minorMoney(value, currency)
  return <>
    <h2>{data.entity.name} · {currency} · {tab}</h2>
    {['Overview', 'Dashboard'].includes(tab) && <Dashboard data={data} currency={currency} overview={tab === 'Overview'} />}
    {tab === 'Businesses' && <>
      <p>Each business has its own ledger. Personal is created automatically. Selecting a business never merges its transactions with another ledger.</p>
      <ul>{data.entities.map((entity) => <li key={entity._id}>{entity.name} — {label(entity.ownerType)}</li>)}</ul>
      <LedgerForm title="Create business" resource={resource} path="/entities" payload={(body) => body}><Field name="name" title="Business name" maxLength={120} /></LedgerForm>
    </>}
    {tab === 'Accounts' && <>
      <p>Opening balances post to opening equity. Card purchases are expenses when recorded; paying the card bill is a transfer, not another expense. Borrowing and principal repayments are also transfers.</p>
      {accounts.map((account) => <article key={account._id} className="order-card"><h3>{account.name}</h3>
        <p>{label(account.subtype)} · {money(account.balanceMinor)}{account.dueDate && ` · Due ${account.dueDate.slice(0, 10)}`}{account.system && ' · System ledger account'}</p>
        {!account.system && <details><summary>Update account metadata</summary><LedgerForm title={`Update ${account.name}`} resource={resource} path={`/accounts/${account._id}`} method="PUT" payload={(body) => ({ ...body, dueDate: body.dueDate || null })} reset={false}>
          <Field name="name" title="Account name" defaultValue={account.name} maxLength={120} />
          <Field name="dueDate" title="Card / debt due date" type="date" required={false} defaultValue={account.dueDate?.slice(0, 10) || ''} />
        </LedgerForm></details>}
        {!account.system && ['ASSET', 'LIABILITY'].includes(account.type) && <details><summary>Audited valuation / balance adjustment</summary>
          <LedgerForm title={`Adjust ${account.name}`} resource={resource} path={`/accounts/${account._id}/adjustments`} idempotent payload={(body) => moneyFields(body, { amount: { signed: true } })}>
            <Field name="amount" title="Signed adjustment (positive increases balance)" inputMode="decimal" />
            <Field name="date" type="date" defaultValue={localDate()} />
            <Field name="description" title="Required adjustment reason" minLength={3} maxLength={1000} />
          </LedgerForm><p>Posts against equity, never income or expense. Reverse the resulting transaction to correct it.</p>
        </details>}
      </article>)}
      <AccountForm data={data} resource={resource} currency={currency} />
    </>}
    {tab === 'Categories' && <>
      <ul>{data.categories.map((category) => <li key={category._id}>{category.name} · {label(category.type)}{category.parentId ? ` · under ${data.categories.find((parent) => parent._id === category.parentId)?.name || 'parent category'}` : ''}</li>)}</ul>
      <CategoryForm data={data} resource={resource} />
    </>}
    {tab === 'Income & Expenses' && <>
      <p>Record the full invoice at recognition. Paid amount may be zero; remaining amounts stay receivable/payable. Later payments settle the invoice without duplicating income or expense. For a credit-card purchase select the card account and set already paid to zero; subsequently pay its bill in Transfers & Debt, not here.</p>
      <TransactionForm data={data} resource={resource} currency={currency} accounts={paymentAccounts} />
      {data.transactions.map((transaction) => <Transaction key={transaction._id} transaction={transaction} resource={resource} currency={currency} accounts={paymentAccounts} paymentOptions={paymentOptions} />)}
      <Pagination value={page} info={data.pagination.transactions} change={setPage} busy={resource.busy} />
      {!data.transactions.length && <p>No transactions in this reporting period.</p>}
    </>}
    {tab === 'Transfers & Debt' && <TransferForm data={data} resource={resource} currency={currency} />}
    {tab === 'Savings Goals' && <>
      <p>Goals allocate money already held in a savings account. Allocations are not expenses and do not increase net worth. Use Transfers to actually move cash into savings first.</p>
      <LedgerForm title="Create savings goal" resource={resource} path="/goals" payload={(body) => scope(moneyFields(body, { targetAmount: {}, savedAmount: { zero: true } }))}>
        <Field name="name" title="Goal name" maxLength={120} />
        <Select name="accountId" title="Backing savings account" options={records(accounts.filter((account) => account.subtype === 'SAVINGS'))} />
        <Field name="targetAmount" title={`Target (${currency})`} inputMode="decimal" />
        <Field name="savedAmount" title={`Allocated (${currency})`} inputMode="decimal" defaultValue="0" />
        <Field name="targetDate" type="date" required={false} />
      </LedgerForm>
      {data.goals.filter((goal) => accounts.some((account) => account._id === goal.accountId)).map((goal) => <article key={goal._id} className="order-card">
        <h3>{goal.name}</h3><p>{money(goal.savedMinor)} allocated / {money(goal.targetMinor)} target</p>
        <LedgerForm title={`Update ${goal.name} allocation`} resource={resource} path={`/goals/${goal._id}`} method="PUT" payload={(body) => ({ ...moneyFields(body, { savedAmount: { zero: true }, targetAmount: {} }), targetDate: body.targetDate || null })}>
          <Field name="name" title="Goal name" defaultValue={goal.name} maxLength={120} />
          <Field name="savedAmount" title="New total allocated (not an additional deposit)" inputMode="decimal" />
          <Field name="targetAmount" title="New target amount (optional)" required={false} inputMode="decimal" />
          <Field name="targetDate" type="date" required={false} defaultValue={goal.targetDate?.slice(0, 10) || ''} />
        </LedgerForm>
      </article>)}
    </>}
    {tab === 'Statements' && <><Statements report={data.report} accounts={accounts} currency={currency} />
      <Pagination value={journalPage} info={data.report.journalPagination} change={setJournalPage} busy={resource.busy} /></>}
    {tab === 'Settings & Audit' && <>
      <p>Locked through: {data.settings.lockedThrough || 'No locked period'}. This lock applies to all your ledgers in this region. Entries in locked periods cannot be posted or reversed. History is immutable: correct an entry by reversing it with a reason, never deleting it.</p>
      <LedgerForm title="Lock accounting period" resource={resource} path="/settings" method="PUT" payload={(body) => ({ lockedThrough: body.lockedThrough || null })} reset={false}>
        <Field name="lockedThrough" title="Lock through (clear to unlock)" type="date" required={false} defaultValue={data.settings.lockedThrough?.slice(0, 10) || ''} />
      </LedgerForm>
      <Audit audit={data.audit} />
      <Pagination value={auditPage} info={data.pagination.audit} change={setAuditPage} busy={resource.busy} />
    </>}
    {tab === 'Dashboard' && <details><summary>Quick manual entry</summary>
      <LedgerForm title="Record account transfer" resource={resource} path="/transfers" idempotent payload={(body) => ({ ...moneyFields(body, { amount: {} }), kind: 'ACCOUNT', fromEntityId: entityId, toEntityId: entityId, currency })}>
        {accountSelect('fromAccountId', 'From account')}{accountSelect('toAccountId', 'To account')}
        <Field name="amount" inputMode="decimal" />{date}<Field name="description" required={false} />
      </LedgerForm>
    </details>}
  </>
}

export function AccountForm({ data, resource, currency }) {
  const [type, setType] = useState('ASSET')
  return <LedgerForm title="Create ledger account" resource={resource} path="/accounts" idempotent payload={(body) => ({ ...moneyFields(body, { openingBalance: { zero: true } }), entityId: data.entity._id, currency })}>
    <Field name="name" title="Account name" maxLength={120} />
    <Select name="type" options={choices(data.constants.accountTypes || [])} value={type} onChange={(event) => setType(event.target.value)} />
    <Select key={type} name="subtype" options={choices(data.constants.accountSubtypes?.[type] || [])} />
    <Field name="openingBalance" title={`Opening balance (${currency})`} defaultValue="0" inputMode="decimal" />
    <Field name="date" title="Opening balance date" type="date" defaultValue={localDate()} />
    <Field name="dueDate" title="Card / debt due date" type="date" required={false} />
  </LedgerForm>
}

function CategoryForm({ data, resource }) {
  const [type, setType] = useState('EXPENSE')
  return <LedgerForm title="Create category / subcategory" resource={resource} path="/categories" payload={(body) => ({ ...moneyFields(body, {}), entityId: data.entity._id })}>
    <Field name="name" title="Category name" maxLength={120} />
    <Select name="type" options={choices(['INCOME', 'EXPENSE'])} value={type} onChange={(event) => setType(event.target.value)} />
    <Select key={type} name="parentId" title="Parent category" required={false} blank="No parent (top-level category)" options={records(data.categories.filter((category) => category.type === type && !category.parentId))} />
  </LedgerForm>
}

export function TransactionForm({ data, resource, currency, accounts }) {
  const [type, setType] = useState('EXPENSE')
  return <LedgerForm title="Record income / expense invoice" resource={resource} path="/transactions" idempotent payload={(body) => {
    const result = moneyFields(body, { amount: {}, paidAmount: { zero: true } })
    if (BigInt(result.paidAmount.replace('.', '')) > BigInt(result.amount.replace('.', ''))) throw new Error('Paid amount cannot exceed the invoice amount.')
    if (result.paidAmount !== '0.00' && !result.accountId) throw new Error('Select the account used for the paid amount.')
    return { ...result, entityId: data.entity._id, currency }
  }}>
    <Select name="type" options={choices(['INCOME', 'EXPENSE'])} value={type} onChange={(event) => setType(event.target.value)} />
    <Select key={type} name="categoryId" title="Category / subcategory" options={data.categories.filter((category) => category.type === type).map((category) => ({
      value: category._id, title: `${category.parentId ? `${data.categories.find((item) => item._id === category.parentId)?.name || 'Category'} / ` : ''}${category.name}`,
    }))} />
    <Field name="amount" title={`Full invoice amount (${currency})`} inputMode="decimal" />
    <Field name="paidAmount" title={`Already paid (${currency})`} defaultValue="0" inputMode="decimal" />
    <Select name="accountId" title="Paid from / received into" options={records(accounts)} required={false} blank="Unpaid (no account)" />
    <Select name="paymentMethod" options={choices(data.constants.paymentMethods || [])} />
    <Field name="date" title="Recognition date" type="date" defaultValue={localDate()} />
    <Field name="dueDate" type="date" required={false} />
    <Field name="description" title="Description / invoice reference" maxLength={1000} />
  </LedgerForm>
}

function Transaction({ transaction, resource, currency, accounts, paymentOptions }) {
  const invoice = ['INCOME', 'EXPENSE'].includes(transaction.type)
  return <article className="order-card">
    <h3>{label(transaction.type)} · {transaction.description}</h3>
    <p>{transaction.date?.slice(0, 10)} · {transaction.status} · Total {minorMoney(transaction.amountMinor, currency)}
      {invoice && ` · Paid ${minorMoney(transaction.paidMinor, currency)} · Outstanding ${minorMoney(transaction.outstandingMinor, currency)}`}</p>
    {transaction.groupId && <p>Linked ledger group: {transaction.groupId}</p>}
    {transaction.creditPurchase && <p>Credit-card purchase: expense already recognized; card debt {minorMoney(transaction.liabilityOutstandingMinor, currency)} · {transaction.liabilityStatus}. Pay the card via Transfers & Debt, not a second expense.</p>}
    {transaction.dueDate && <p>Due {transaction.dueDate.slice(0, 10)}</p>}
    {!transaction.reversed && <>
      {invoice && transaction.outstandingMinor > 0 && <details><summary>Record invoice payment</summary>
        <LedgerForm title={`Payment for ${transaction.description}`} resource={resource} path={`/transactions/${transaction._id}/payments`} idempotent payload={(body) => moneyFields(body, { amount: {} })}>
          <Select name="accountId" title="Settlement account" options={records(accounts.filter((account) => ['CASH', 'CHECKING', 'SAVINGS'].includes(account.subtype)))} />
          <Field name="amount" title="Payment amount" inputMode="decimal" />
          <Select name="paymentMethod" options={paymentOptions} />
          <Field name="date" type="date" defaultValue={localDate()} />
        </LedgerForm>
      </details>}
      <details><summary>Reverse entry (immutable correction)</summary>
        <LedgerForm title={`Reverse ${transaction.description}`} resource={resource} path={`/transactions/${transaction._id}/reverse`} idempotent payload={(body) => body} submit="Post reversal">
          <Field name="date" title="Reversal date" type="date" defaultValue={localDate()} /><Field name="reason" title="Required reversal reason" minLength={3} maxLength={1000} />
        </LedgerForm>
      </details>
    </>}
    {transaction.reversed && <p>Reversed — original entry retained.</p>}
    {!!transaction.payments?.length && <details><summary>Recorded payments</summary><ul>{transaction.payments.map((payment) => <li key={payment._id}>{payment.date?.slice(0, 10)} · {minorMoney(payment.amountMinor, currency)} · {label(payment.paymentMethod)}</li>)}</ul></details>}
  </article>
}

export function TransferForm({ data, resource, currency }) {
  const [kind, setKind] = useState('ACCOUNT')
  const [toEntityId, setToEntityId] = useState(data.entity._id)
  const personalId = data.entities.find((entity) => entity.ownerType === 'PERSONAL')?._id
  const businessId = data.entities.find((entity) => entity.ownerType === 'BUSINESS')?._id
  const kinds = (data.constants.transferKinds || []).filter((value) => data.entity.ownerType === 'BUSINESS'
    ? value !== 'PERSONAL_BUSINESS_EXPENSE' : ['ACCOUNT', 'PERSONAL_BUSINESS_EXPENSE'].includes(value))
  const destinations = data.entities.filter((entity) => kind === 'ACCOUNT' ||
    entity.ownerType === (kind === 'PERSONAL_BUSINESS_EXPENSE' ? 'BUSINESS' : 'PERSONAL'))
  return <>
    <p>No money is sent. Transfers record money already moved manually. Loan borrowing: loan → cash; principal repayment: cash → loan; credit-card bill: cash → card. Record interest separately as an expense. Salary, draws, business-paid personal purchases and personally funded business expenses create linked ledger entries.</p>
    <LedgerForm title="Record transfer / borrowing / repayment" resource={resource} path="/transfers" idempotent payload={(body) => ({ ...moneyFields(body, { amount: {} }), fromEntityId: data.entity._id, currency })}>
      <Select name="kind" options={choices(kinds)} value={kind} onChange={(event) => {
        setKind(event.target.value)
        setToEntityId(event.target.value === 'ACCOUNT' ? data.entity._id : (event.target.value === 'PERSONAL_BUSINESS_EXPENSE' ? businessId : personalId) || '')
      }} />
      <Select name="fromAccountId" title="From account (loan for borrowing)" options={records(data.accounts.filter((account) => account.currency === currency && !account.system &&
        (kind === 'ACCOUNT' ? ['ASSET', 'LIABILITY'].includes(account.type) : ['CASH', 'CHECKING', 'SAVINGS'].includes(account.subtype))))} />
      <Select name="toEntityId" title="Destination ledger" options={records(destinations)} value={toEntityId} onChange={(event) => setToEntityId(event.target.value)} />
      <DestinationAccounts entityId={toEntityId} current={data} currency={currency} kind={kind} key={`${toEntityId}:${kind}`} />
      {kind === 'SALARY' && <Select name="categoryId" title="Business salary expense category" required={false} options={records(data.categories.filter((category) => category.type === 'EXPENSE'))} />}
      <Field name="amount" title={`Amount (${currency})`} inputMode="decimal" />
      <Field name="date" type="date" defaultValue={localDate()} />
      <Field name="description" maxLength={1000} />
    </LedgerForm>
  </>
}

function DestinationAccounts({ entityId, current, currency, kind }) {
  // Loading the destination's owner-private workspace does not merge its ledger.
  return entityId === current.entity._id
    ? <Select name="toAccountId" title="To account (loan / card for repayment)" options={records(current.accounts.filter((account) => account.currency === currency && !account.system && ['ASSET', 'LIABILITY'].includes(account.type)))} />
    : <RemoteDestinationAccounts entityId={entityId} currency={currency} kind={kind} />
}

function RemoteDestinationAccounts({ entityId, currency, kind }) {
  const resource = useFinancialWorkspace({ entityId, currency, period: 'monthly' })
  return <div>{resource.error && <p role="alert">{resource.error}</p>}
    {['BUSINESS_PERSONAL_EXPENSE', 'PERSONAL_BUSINESS_EXPENSE'].includes(kind)
      ? <Select name="categoryId" title={`Destination ${kind === 'PERSONAL_BUSINESS_EXPENSE' ? 'business' : 'personal'} expense category`} options={records((resource.data?.categories || []).filter((category) => category.type === 'EXPENSE'))} />
      : <Select name="toAccountId" title="Destination account" blank={resource.loading ? 'Loading destination accounts…' : 'Select destination account'}
        options={records((resource.data?.accounts || []).filter((account) => account.currency === currency && ['CASH', 'CHECKING', 'SAVINGS'].includes(account.subtype)))} />}
  </div>
}

function Pagination({ value, info, change, busy }) {
  return <div className="tracker-pagination"><button disabled={busy || value <= 1} onClick={() => change(value - 1)}>Previous</button>
    <span>Page {value} of {info?.pages ?? 'unavailable'} · {info?.total ?? 'unavailable'} records</span>
    <button disabled={busy || !info || value >= info.pages} onClick={() => change(value + 1)}>Next</button></div>
}

function Dashboard({ data, currency, overview }) {
  const report = data.report
  const totals = report.totals
  const [graph, setGraph] = useState('monthlyIncomeExpense')
  if (!totals || !report.series) return <p role="alert">Accounting report is incomplete. Balances unavailable.</p>
  const metrics = [
    ['Net worth (not income)', 'netWorthMinor'], ['Assets', 'assetsMinor'], ['Liabilities', 'liabilitiesMinor'],
    ['Accrual income', 'incomeMinor'], ['Accrual expenses', 'expenseMinor'], ['Net income', 'netIncomeMinor'],
    ['Cash', 'cashMinor'], ['Savings account balance', 'savingsMinor'], ['Receivables', 'receivablesMinor'],
    ['Debt', 'debtMinor'], ['Cash in', 'cashInMinor'], ['Cash out', 'cashOutMinor'], ['Net cash flow', 'cashFlowMinor'],
  ]
  const graphs = {
    monthlyIncomeExpense: ['Monthly income & expenses', ['incomeMinor', 'expenseMinor']],
    spending: ['Spending', ['amountMinor']], category: ['Category spending', ['amountMinor']],
    savings: ['Savings', ['amountMinor']], debt: ['Debt', ['amountMinor']], cashflow: ['Cash flow', ['inMinor', 'outMinor', 'netMinor']],
  }
  return <>
    {overview && <p>This overview shows the selected ledger only. Net worth is assets minus liabilities, never revenue. Switch ledgers above; currencies are never added together.</p>}
    {overview && Array.isArray(data.combinedNetWorth) && <section className="panel"><h3>Combined net worth · personal + your businesses</h3>
      <p>Assets minus liabilities across your private ledgers. This is not income. Currency totals are separate.</p>
      {data.combinedNetWorth.map((item) => <section key={item.currency} aria-label={`${item.currency} net worth breakdown`}>
        <h4>{item.currency} · as of {item.asOf?.slice(0, 10)}</h4>
        {Array.isArray(item.entities) && <div className="tracker-table"><table>
          <caption>Personal and business net worth ({item.currency})</caption>
          <thead><tr><th>Ledger</th><th>Assets</th><th>Liabilities</th><th>Net worth</th></tr></thead>
          <tbody>{item.entities.map((entity) => <tr key={entity.entityId}>
            <th scope="row">{entity.name} ({label(entity.ownerType)})</th>
            <td>{minorMoney(entity.assetsMinor, item.currency)}</td>
            <td>{minorMoney(entity.liabilitiesMinor, item.currency)}</td>
            <td>{minorMoney(entity.netWorthMinor, item.currency)}</td>
          </tr>)}</tbody>
        </table></div>}
        <p>Combined total: {minorMoney(item.netWorthMinor, item.currency)}</p>
      </section>)}
    </section>}
    <p>Reporting {report.from?.slice(0, 10)} to {report.to?.slice(0, 10)}. Balances are as of the end date; income, expenses and cash movements cover the selected period.</p>
    <div className="tracker-cards">{metrics.map(([title, field]) => <article className="panel" key={field}><h3>{title}</h3><p>{minorMoney(totals[field], currency)}</p></article>)}</div>
    <label>Chart<select value={graph} onChange={(event) => setGraph(event.target.value)}>{Object.entries(graphs).map(([key, [title]]) => <option key={key} value={key}>{title}</option>)}</select></label>
    <ReportChart title={graphs[graph][0]} rows={report.series[graph]} fields={graphs[graph][1]} currency={currency} />
  </>
}

function ReportChart({ title, rows, fields, currency }) {
  if (!Array.isArray(rows)) return <p role="alert">{title} chart unavailable.</p>
  const values = rows.flatMap((row) => fields.map((field) => row[field]))
  if (values.some((value) => !Number.isSafeInteger(value))) return <p role="alert">{title} contains invalid amounts.</p>
  const maximum = Math.max(1, ...values.map(Math.abs))
  const width = Math.max(480, rows.length * 80)
  return <section aria-label={title}><h3>{title}</h3>
    {!rows.length ? <p>No data in this period.</p> : <>
      <div className="tracker-chart"><svg viewBox={`0 0 ${width} 220`} role="img" aria-label={`${title} in ${currency}; exact amounts in the table below.`} style={{ minWidth: width, width: '100%', maxHeight: 260 }}>
        <line x1="0" x2={width} y1="110" y2="110" stroke="currentColor" />
        {rows.map((row, index) => <g key={row.date || row.categoryId || index}>
          {fields.map((field, series) => {
            const value = row[field]
            const height = Math.abs(value) / maximum * 85
            return <rect key={field} x={index * 80 + series * 18 + 10} y={value >= 0 ? 110 - height : 110} width="15" height={height} fill={['#166534', '#b45309', '#1d4ed8'][series]}>
              <title>{`${row.name || row.date}: ${label(field.replace('Minor', ''))} ${minorMoney(value, currency)}`}</title>
            </rect>
          })}
          <text x={index * 80 + 10} y="210" fontSize="10" fill="currentColor">{(row.name || row.date || '').slice(0, 10)}</text>
        </g>)}
      </svg></div>
      <div className="tracker-table"><table><caption>{title} — exact amounts ({currency})</caption><thead><tr><th>Date / category</th>{fields.map((field) => <th key={field}>{label(field.replace('Minor', ''))}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.date || row.categoryId || index}><th scope="row">{row.name || row.date}</th>{fields.map((field) => <td key={field}>{minorMoney(row[field], currency)}</td>)}</tr>)}</tbody>
      </table></div>
    </>}
  </section>
}

function Statements({ report, accounts, currency }) {
  const money = (value) => minorMoney(value, currency)
  const sheet = report.balanceSheet
  const income = report.incomeStatement
  const trial = report.trialBalance
  if (!sheet || !income || !trial || !Array.isArray(report.journal)) return <p role="alert">Financial statements unavailable.</p>
  return <>
    <h3>Balance sheet</h3>
    <p>Assets {money(sheet.assetsMinor)} · Liabilities {money(sheet.liabilitiesMinor)} · Equity {money(sheet.equityMinor)} · Net worth {money(sheet.netWorthMinor)} · {sheet.balanced ? 'Balanced' : 'Not balanced — review ledger'}</p>
    <ul>{sheet.accounts?.filter((account) => ['ASSET', 'LIABILITY', 'EQUITY'].includes(account.type)).map((account) => <li key={account._id}>{account.name} ({label(account.type)}) {money(account.balanceMinor)}</li>)}</ul>
    <h3>Income statement</h3><p>Income {money(income.incomeMinor)} · Expenses {money(income.expenseMinor)} · Net income {money(income.netIncomeMinor)}</p>
    <h3>Cash flow statement (direct method)</h3><p>Cash received {money(report.totals?.cashInMinor)} · Cash paid {money(report.totals?.cashOutMinor)} · Net cash flow {money(report.totals?.cashFlowMinor)}</p>
    <h3>Trial balance</h3>
    <div className="tracker-table"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
      {trial.accounts.map((account) => <tr key={account.accountId}><th scope="row">{account.name}</th><td>{money(account.debitMinor)}</td><td>{money(account.creditMinor)}</td></tr>)}
    </tbody><tfoot><tr><th>Total · {trial.balanced ? 'Balanced' : 'Not balanced'}</th><td>{money(trial.debitMinor)}</td><td>{money(trial.creditMinor)}</td></tr></tfoot></table></div>
    <h3>Immutable journal</h3>
    {report.journal.map((entry) => <article className="order-card" key={entry._id}><h4>{entry.date?.slice(0, 10)} · {label(entry.kind)} · {entry.description}</h4>
      <p>Journal {entry._id}{entry.reversalOf && ` · Reversal of ${entry.reversalOf}`}{entry.groupId && ` · Linked group ${entry.groupId}`}</p>
      <ul>{entry.lines.map((line, index) => <li key={`${line.accountId}:${index}`}>{accounts.find((account) => account._id === line.accountId)?.name || line.accountId} · Debit {money(line.debitMinor)} · Credit {money(line.creditMinor)}</li>)}</ul>
    </article>)}
    {!report.journal.length && <p>No journal entries in this period.</p>}
    <p>Manual bookkeeping reports, not certified tax accounting. Review with a qualified accountant before statutory reporting.</p>
  </>
}
function Audit({ audit }) {
  return <><h3>Immutable audit history</h3><ul>{audit.map((entry) => <li key={entry._id}>{entry.at} · {entry.action} · {entry.resourceId}
    {entry.detail && <details><summary>Audit details</summary><pre>{JSON.stringify(entry.detail, null, 2)}</pre></details>}
  </li>)}</ul></>
}
