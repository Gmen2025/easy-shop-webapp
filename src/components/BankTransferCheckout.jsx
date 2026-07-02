import { useMemo, useState } from 'react'

const ETHIOPIAN_BANKS = [
  'Commercial Bank of Ethiopia (CBE)',
  'Awash Bank',
  'Dashen Bank',
  'Bank of Abyssinia',
  'Cooperative Bank of Oromia',
  'Nib International Bank',
  'Wegagen Bank',
  'Zemen Bank',
  'Abyssinia Bank',
]

function BankTransferCheckout({ amount, onConfirmed, onError }) {
  const [bankName, setBankName] = useState(ETHIOPIAN_BANKS[0])
  const [transferReference, setTransferReference] = useState('')
  const [senderName, setSenderName] = useState('')

  const roundedAmount = useMemo(() => Math.round(Number(amount || 0)), [amount])

  function handleConfirm() {
    const normalizedReference = transferReference.trim()
    const normalizedSenderName = senderName.trim()

    if (!bankName.trim()) {
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
      bankName: bankName.trim(),
      transferReference: normalizedReference,
      senderName: normalizedSenderName,
      amount: roundedAmount,
      currency: 'ETB',
    })
  }

  return (
    <div className="bank-transfer-form">
      <p className="section-note">
        Transfer the exact amount below using your preferred Ethiopian bank, then submit your transfer details.
      </p>

      <label htmlFor="bank-transfer-bank">Bank</label>
      <select
        id="bank-transfer-bank"
        value={bankName}
        onChange={(event) => setBankName(event.target.value)}
      >
        {ETHIOPIAN_BANKS.map((bank) => (
          <option key={bank} value={bank}>
            {bank}
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
