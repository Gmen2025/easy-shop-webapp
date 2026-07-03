import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../api/client'

function toBankId(bank) {
  return String(bank?._id || bank?.id || '').trim()
}

function normalizeBankAccounts(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.bankAccounts)
      ? payload.bankAccounts
      : Array.isArray(payload?.data?.bankAccounts)
        ? payload.data.bankAccounts
        : []

  return list
    .filter((bank) => bank && typeof bank === 'object')
    .map((bank) => ({
      _id: toBankId(bank),
      bankName: String(bank?.bankName || bank?.bank || '').trim(),
      accountNumber: String(bank?.accountNumber || '').trim(),
      accountHolderName: String(bank?.accountHolderName || '').trim(),
      bankCode: String(bank?.bankCode || '').trim(),
      additionalInfo: String(bank?.additionalInfo || '').trim(),
    }))
    .filter((bank) => bank._id && bank.bankName && bank.accountNumber)
}

function BankTransferCheckout({ amount, onConfirmed, onError }) {
  const [bankAccounts, setBankAccounts] = useState([])
  const [bankAccountsLoading, setBankAccountsLoading] = useState(true)
  const [bankAccountsError, setBankAccountsError] = useState('')
  const [selectedBankId, setSelectedBankId] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [senderName, setSenderName] = useState('')

  const roundedAmount = useMemo(() => Math.round(Number(amount || 0)), [amount])
  const selectedBank = useMemo(
    () => bankAccounts.find((bank) => toBankId(bank) === selectedBankId) || null,
    [bankAccounts, selectedBankId],
  )

  useEffect(() => {
    let cancelled = false

    async function loadBankAccounts() {
      setBankAccountsLoading(true)
      setBankAccountsError('')

      try {
        const payload = await apiRequest('/settings/bank-account')
        if (cancelled) {
          return
        }

        const normalized = normalizeBankAccounts(payload)
        setBankAccounts(normalized)
        setSelectedBankId((current) => current || toBankId(normalized[0]))
      } catch (error) {
        if (cancelled) {
          return
        }

        setBankAccounts([])
        setSelectedBankId('')
        setBankAccountsError(
          error?.message || 'Unable to load bank accounts right now. Please try again.',
        )
      } finally {
        if (!cancelled) {
          setBankAccountsLoading(false)
        }
      }
    }

    loadBankAccounts()

    return () => {
      cancelled = true
    }
  }, [])

  function handleConfirm() {
    const normalizedReference = transferReference.trim()
    const normalizedSenderName = senderName.trim()
    const selected = selectedBank

    if (!selected) {
      onError?.('No bank account is available right now. Please contact support.')
      return
    }

    if (!selected.bankName) {
      onError?.('Please choose a bank for your transfer.')
      return
    }

    if (!normalizedReference) {
      onError?.('Please enter your transfer reference/receipt number.')
      return
    }

    if (normalizedReference.length < 4) {
      onError?.('Transfer reference looks too short. Please double-check it.')
      return
    }

    onConfirmed?.({
      bankAccountId: selected._id,
      bankName: selected.bankName,
      accountNumber: selected.accountNumber,
      accountHolderName: selected.accountHolderName,
      transferReference: normalizedReference,
      senderName: normalizedSenderName,
      amount: roundedAmount,
      currency: 'ETB',
    })
  }

  return (
    <div className="bank-transfer-form">
      <p className="section-note">
        Transfer the exact amount below to one of the official accounts, then submit your transfer details.
      </p>

      {bankAccountsLoading ? <p className="section-note">Loading bank accounts...</p> : null}
      {bankAccountsError ? <p className="form-error">{bankAccountsError}</p> : null}

      {bankAccounts.length ? (
        <div className="bank-account-list">
          {bankAccounts.map((bank) => (
            <button
              key={bank._id}
              type="button"
              className={`bank-account-card ${selectedBankId === bank._id ? 'selected' : ''}`}
              onClick={() => setSelectedBankId(bank._id)}
            >
              <div className="bank-account-primary">
                <strong>{bank.bankName}</strong>
                <small>
                  <span>Account Number:</span> {bank.accountNumber}
                </small>
                <small>
                  <span>Account Holder:</span> {bank.accountHolderName || 'N/A'}
                </small>
              </div>
              {bank.bankCode ? (
                <small>
                  <span>Bank Code:</span> {bank.bankCode}
                </small>
              ) : null}
              {bank.additionalInfo ? <small>{bank.additionalInfo}</small> : null}
            </button>
          ))}
        </div>
      ) : null}

      <label htmlFor="bank-transfer-bank">Bank</label>
      <select
        id="bank-transfer-bank"
        value={selectedBankId}
        onChange={(event) => setSelectedBankId(event.target.value)}
        disabled={!bankAccounts.length || bankAccountsLoading}
      >
        {!bankAccounts.length ? <option value="">No active bank account available</option> : null}
        {bankAccounts.map((bank) => (
          <option key={bank._id} value={bank._id}>
            {bank.bankName} - {bank.accountNumber}
          </option>
        ))}
      </select>

      <label htmlFor="bank-transfer-reference">Transfer Reference / Receipt Number</label>
      <input
        id="bank-transfer-reference"
        type="text"
        value={transferReference}
        onChange={(event) => setTransferReference(event.target.value)}
        placeholder="e.g. FT2026-88391"
        required
      />

      <label htmlFor="bank-transfer-sender">Sender Name (optional)</label>
      <input
        id="bank-transfer-sender"
        type="text"
        value={senderName}
        onChange={(event) => setSenderName(event.target.value)}
        placeholder="Name on the bank account"
      />

      <p className="telebirr-amount">Amount to Transfer: {roundedAmount} ETB</p>

      <button type="button" className="solid-button" onClick={handleConfirm}>
        I Have Transferred, Place Order
      </button>
    </div>
  )
}

export default BankTransferCheckout
