import { useState } from 'react'
import AdminNavigation from '../components/AdminNavigation'
import { apiRequest, getSelectedDatabaseName } from '../api/client'
import useFinancialHealth from '../features/financialManagement/useFinancialHealth'
import { validateFinancialHealthSettings } from '../utils/financialHealth'

export default function FinancialHealthSettingsPage() {
  const availability = useFinancialHealth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const save = async (enabled) => {
    setSaving(true); setError(''); setNotice('')
    try {
      validateFinancialHealthSettings(await apiRequest('/settings/financial-health', {
        method: 'PUT', body: JSON.stringify({ enabled }),
      }))
      setNotice(enabled ? 'Financial Health enabled for signed-in customers.' : 'Financial Health disabled. Customer records are preserved.')
      await availability.reload()
    } catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }
  return <section className="page-stack admin-console">
    <AdminNavigation />
    <h1>Financial Health service</h1>
    <p>Region: {getSelectedDatabaseName()}. Off by default.</p>
    <label><input type="checkbox" checked={availability.configuredEnabled === true}
      disabled={saving || availability.configuredEnabled === null} onChange={(event) => save(event.target.checked)} /> Enable Financial Health service</label>
    {availability.configuredEnabled === null && !availability.error && <p role="status">Loading availability...</p>}
    {(error || availability.error) && <p role="alert">{error || availability.error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button disabled={saving} onClick={availability.reload}>Refresh availability</button>
    <p>Off restricts Financial Health to Admin and approved verified testers without deleting records.
      Manage the shared regional tester list in Service availability or Maintenance settings.</p>
    <p>Each signed-in customer has private personal and business ledgers. This switch never changes the admin Revenue &amp; Expense Tracker or grants access to customer records.</p>
  </section>
}
