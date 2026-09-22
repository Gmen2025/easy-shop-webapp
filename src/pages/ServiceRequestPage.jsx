import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { getSelectedDatabaseName } from '../api/client'
import { createServiceRequest } from '../api/serviceRequests'

const getCountryFromDatabase = (databaseName) => {
  return databaseName === 'E_ShopUSA' ? 'USA' : 'Ethiopia'
}

const initialForm = {
  country: getCountryFromDatabase(getSelectedDatabaseName()),
  serviceLocation: '',
  machineType: '',
  manufacturer: '',
  model: '',
  controller: '',
  errorCode: '',
  problemDescription: '',
  priority: 'Normal',
  locationCity: '',
  locationAddress: '',
  budgetEstimate: '',
}

function ServiceRequestPage() {
  const user = useSelector((state) => state.auth.user)
  const navigate = useNavigate()
  const selectedDatabase = getSelectedDatabaseName()
  const [formData, setFormData] = useState(() => ({
    ...initialForm,
    country: getCountryFromDatabase(selectedDatabase),
  }))
  const [submitting, setSubmitting] = useState(false)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  function updateField(event) {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  const countryOptions = [
    { value: 'Ethiopia', label: 'Ethio' },
    { value: 'USA', label: 'USA' },
  ]

  async function handleSubmit(event) {
    event.preventDefault()

    if (!user || !localStorage.getItem('authToken')) {
      toast.error('Your session has expired. Please log in again.')
      navigate('/login', { replace: true })
      return
    }

    setSubmitting(true)

    const payload = {
      ...formData,
      budgetEstimate: formData.budgetEstimate ? Number(formData.budgetEstimate) : undefined,
    }

    try {
      await createServiceRequest(payload)
      toast.success('Service request submitted successfully.')
      setFormData(initialForm)
    } catch (error) {
      const isUnauthorized = error?.status === 401 || /unauthorized|session|login/i.test(error?.message || '')

      if (isUnauthorized) {
        toast.error('Your session has expired. Please log in again.')
        navigate('/login', { replace: true })
        return
      }

      toast.error(error?.payload?.message || error?.message || 'Unable to submit the service request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="page-stack service-request-page">
      <section className="hero-panel">
        <p className="eyebrow">Technical support</p>
        <h1>Request a service visit</h1>
        <p>Tell our technicians what is happening and where the machine needs attention.</p>
      </section>

      <form className="panel service-request-form" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Service request</p>
          <h2>Machine details</h2>
          <p className="section-note">Required fields are marked by the browser before submission.</p>
        </div>

        <div className="service-form-grid">
          <label>
            Country
            <select name="country" value={formData.country} onChange={updateField} required>
              {countryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service location
            <input name="serviceLocation" value={formData.serviceLocation} onChange={updateField} placeholder="On-site or remote" required />
          </label>
          <label>
            Machine type
            <input name="machineType" value={formData.machineType} onChange={updateField} placeholder="e.g. CNC machine" required />
          </label>
          <label>
            Manufacturer
            <input name="manufacturer" value={formData.manufacturer} onChange={updateField} placeholder="Optional" />
          </label>
          <label>
            Model
            <input name="model" value={formData.model} onChange={updateField} placeholder="Optional" />
          </label>
          <label>
            Controller
            <input name="controller" value={formData.controller} onChange={updateField} placeholder="Optional" />
          </label>
          <label>
            Error code
            <input name="errorCode" value={formData.errorCode} onChange={updateField} placeholder="Optional" />
          </label>
          <label>
            Priority
            <select name="priority" value={formData.priority} onChange={updateField}>
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Emergency">Emergency</option>
            </select>
          </label>
          <label>
            City
            <input name="locationCity" value={formData.locationCity} onChange={updateField} placeholder="Optional" />
          </label>
          <label>
            Address
            <input name="locationAddress" value={formData.locationAddress} onChange={updateField} placeholder="Optional" />
          </label>
          <label>
            Budget estimate
            <input name="budgetEstimate" type="number" min="0" step="0.01" value={formData.budgetEstimate} onChange={updateField} placeholder="Optional" />
          </label>
        </div>

        <label>
          Problem description
          <textarea name="problemDescription" value={formData.problemDescription} onChange={updateField} rows="6" placeholder="Describe the symptoms, timing, and any troubleshooting already attempted." required />
        </label>

        <div className="action-row">
          <button className="solid-button" type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit service request'}
          </button>
          <Link className="ghost-button" to="/profile">Back to profile</Link>
        </div>
      </form>
    </section>
  )
}

export default ServiceRequestPage
