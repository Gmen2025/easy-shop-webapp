import { useRef, useState } from 'react'
import { apiRequest } from '../api/client'
import { useCompanyAction } from '../features/company/useCompanyResource'
import { financeMoney, payoutAmount } from '../utils/finance'

export default function DepositWallet({ wallet, account, path, admin, reload }) {
  const action = useCompanyAction()
  const [policy, setPolicy] = useState(account.depositPolicy)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank')
  const [reference, setReference] = useState('')
  const [depositedAt, setDepositedAt] = useState('')
  const [notes, setNotes] = useState('')
  const request = useRef(null)
  const enabled = wallet.enabled && account.depositPolicy.enabled
  const money = (value) => financeMoney(value, wallet.currency)
  const send = (url, body, method = 'POST') => apiRequest(url, { method, body: JSON.stringify(body) })
  const key = (signature) => {
    if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() }
    return request.current.key
  }
  const openPayment = (url) => {
    if (!/^https:\/\//.test(url)) throw new Error('The payment gateway did not return a secure URL.')
    window.location.assign(url)
  }
  const verify = (entry, approve) => action.run(async () => {
    await send(`${path}/wallet/deposits/${entry._id}/verify`, entry.method === 'bank'
      ? { action: approve ? 'approve' : 'reject', confirmedReceived: approve } : {})
    await reload()
  }, 'Deposit status verified. Only confirmed funds increase the balance.')
  return <article className="panel" aria-label="Prepaid cash-fee deposit wallet">
    <h2>Prepaid cash-fee deposit balance</h2>
    <h3>{money(wallet.balance)}</h3>
    <p>Regional requirement {wallet.enabled ? 'ON' : 'OFF'} / Account requirement {account.depositPolicy.enabled ? 'ON' : 'OFF'}.</p>
    <p>Separate from earnings and payouts. Deposits pay configured fees for confirmed cash/off-platform transactions only. Online-paid transactions do not deduct this balance. Company-owned income still belongs to the company.</p>
    {wallet.state === 'blocked' && <p role="alert">Top up to resume new work. Active work can finish; Admin suspensions are not removed by a top-up.</p>}
    {wallet.state === 'low' && <p role="alert">Low deposit balance. Replenish it soon to avoid interruption.</p>}
    <p>Warning at {money(account.depositPolicy.lowBalance)}; new work blocked at or below {money(account.depositPolicy.minimumBalance)} when enabled.</p>
    {action.error && <p role="alert">{action.error} Refresh income to recover any saved deposit before submitting another.</p>}
    {action.notice && <p role="status">{action.notice}</p>}
    {admin && <>
      <button disabled={action.busy} onClick={() => {
        if (!window.confirm(`${wallet.enabled ? 'Turn OFF' : 'Turn ON'} the cash deposit requirement for ALL drivers and stores in this region? Turning it off pauses top-ups, cash-fee deductions and deposit blocking, not existing payment verification.`)) return
        action.run(async () => { await send('/finance/wallet-config', { enabled: !wallet.enabled }, 'PUT'); await reload() }, 'Regional cash deposit switch updated.')
      }}>{wallet.enabled ? 'Turn OFF regional cash deposit requirement' : 'Turn ON regional cash deposit requirement'}</button>
      <form onSubmit={(event) => {
        event.preventDefault()
        action.run(async () => {
          await send(`${path}/wallet/settings`, { enabled: policy.enabled,
            lowBalance: Number(policy.lowBalance), minimumBalance: Number(policy.minimumBalance) }, 'PUT')
          await reload()
        }, 'Account deposit requirement saved.')
      }}><fieldset disabled={action.busy}>
        <label><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy({ ...policy, enabled: event.target.checked })} />Require this account to maintain a deposit (including company-owned accounts)</label>
        <label>Low-balance warning<input required type="number" min="0.01" step="0.01" value={policy.lowBalance} onChange={(event) => setPolicy({ ...policy, lowBalance: event.target.value })} /></label>
        <label>Minimum balance<input required type="number" min="0" step="0.01" value={policy.minimumBalance} onChange={(event) => setPolicy({ ...policy, minimumBalance: event.target.value })} /></label>
        <button>Save account deposit settings</button>
      </fieldset></form>
    </>}
    <h3>Deposit with the company</h3>
    {wallet.bankAccounts.map((bank) => <p key={bank._id}>{bank.bankName}: {bank.accountNumber} / {bank.accountHolderName} ({wallet.currency})</p>)}
    {!wallet.bankAccounts.length && <p>Contact Admin for the company's verified deposit instructions.</p>}
    <form onSubmit={(event) => {
      event.preventDefault()
      action.run(async () => {
        const value = payoutAmount(amount)
        const result = await send(`${path}/wallet/deposits`, { amount: value, currency: wallet.currency, method, reference,
          depositedAt: method === 'bank' ? new Date(depositedAt).toISOString() : undefined,
          requestKey: key(`deposit:${value}:${method}:${reference}:${depositedAt}`) })
        request.current = null
        setAmount('')
        await reload()
        if (result.paymentUrl) openPayment(result.paymentUrl)
      }, 'Deposit saved. Funds are credited only after verification.')
    }}><fieldset disabled={!enabled || action.busy}>
      <label>Deposit amount ({wallet.currency})<input required type="number" step="0.01" min="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Deposit method<select value={method} onChange={(event) => setMethod(event.target.value)}>
        <option value="bank" disabled={!wallet.methods.bank}>Bank transfer / company receipt (Admin verification)</option>
        {wallet.methods.card && <option value="card">Card (verified gateway)</option>}
        {wallet.methods.telebirr && <option value="telebirr">Telebirr (verified gateway)</option>}
      </select></label>
      {method === 'bank' && <>
        <label>Transfer / company receipt reference<input required maxLength="150" value={reference} onChange={(event) => setReference(event.target.value)} /></label>
        <label>Actual deposit date and time<input required type="datetime-local" value={depositedAt} onChange={(event) => setDepositedAt(event.target.value)} /></label>
      </>}
      <button disabled={!wallet.methods[method]}>Submit deposit / open payment</button>
    </fieldset></form>
    {admin && <form onSubmit={(event) => {
      event.preventDefault()
      if (!window.confirm('Deduct this separately itemized fee from the deposit balance? Do not charge an online-paid transaction fee again.')) return
      action.run(async () => {
        const value = payoutAmount(amount)
        await send(`${path}/wallet/charges`, { amount: value, notes, requestKey: key(`charge:${value}:${notes}`) })
        request.current = null
        setAmount('')
        setNotes('')
        await reload()
      }, 'Additional cash/off-platform fee recorded.')
    }}><fieldset disabled={!enabled || action.busy}>
      <h3>Admin: additional cash/off-platform fee</h3>
      <p>Use the amount above. Offline transactions not recorded in the platform require an itemized Admin charge.</p>
      <label>Fee amount ({wallet.currency})<input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Reason / offline transaction reference<input required maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <button>Record additional fee</button>
    </fieldset></form>}
    <h3>Deposit & fee history (latest 100)</h3>
    {wallet.transactions.map((entry) => <div className="order-card" key={entry._id}>
      <strong>{entry.type === 'fee' ? '-' : '+'}{money(entry.amountMinor / 100)} / {entry.type} / {entry.status}</strong>
      <p>Requested/recorded: {new Date(entry.createdAt).toLocaleString()}</p>
      {entry.depositedAt && <p>Deposited: {new Date(entry.depositedAt).toLocaleString()}</p>}
      {entry.verifiedAt && <p>Verified: {new Date(entry.verifiedAt).toLocaleString()}</p>}
      {entry.balanceAfterMinor !== undefined && <p>Balance after: {money(entry.balanceAfterMinor / 100)}</p>}
      <p>{entry.reference} {entry.notes}</p>
      {entry.type === 'deposit' && !['completed', 'failed'].includes(entry.status) && (entry.method === 'bank' ? admin && <>
        <button disabled={action.busy} onClick={() => { if (window.confirm(`Confirm the company received ${money(entry.amountMinor / 100)} with reference ${entry.reference}?`)) verify(entry, true) }}>Confirm received & credit</button>
        <button disabled={action.busy} onClick={() => { if (window.confirm('Reject this deposit claim without crediting funds?')) verify(entry, false) }}>Reject claim</button>
      </> : <>
        <button disabled={action.busy} onClick={() => verify(entry)}>Verify gateway payment</button>
        {(entry.paymentUrl || entry.status === 'pending') && <button disabled={action.busy} onClick={() => action.run(async () => {
          const result = await send(`${path}/wallet/deposits/${entry._id}/start`, {})
          await reload()
          if (result.paymentUrl) openPayment(result.paymentUrl)
        })}>Open saved payment</button>}
      </>)}
    </div>)}
    {wallet.legacyTransactions.length > 0 && <details><summary>Historical driver wallet records</summary>
      {wallet.legacyTransactions.map((entry) => <div key={entry._id}><p>{entry.type}: {money(entry.amount)} / {entry.status} / {new Date(entry.createdAt).toLocaleString()} / {entry.reference}</p>
        {admin && entry.type === 'deposit' && entry.status === 'pending' && <button disabled={action.busy} onClick={() => {
          if (!window.confirm(`Confirm receipt of legacy deposit ${money(entry.amount)} / ${entry.reference}?`)) return
          action.run(async () => { await send(`/drivers/wallet/deposit-requests/${entry._id}/approve`, { confirmedReceived: true }, 'PUT'); await reload() }, 'Legacy deposit verified.')
        }}>Verify legacy deposit</button>}
      </div>)}
    </details>}
  </article>
}
