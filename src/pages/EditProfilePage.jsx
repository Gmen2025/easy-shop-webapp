import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import countries from '../../data/countries.json'
import { apiRequest } from '../api/client'
import {
  fetchCurrentUserProfile,
  removeUserAccount,
  saveUserProfile,
} from '../features/auth/authSlice'

const countryOptions = countries
  .map((countryItem) => String(countryItem?.name || '').trim())
  .filter(Boolean)

function isObjectIdLike(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''))
}

function EditProfilePage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector((state) => state.auth.user)
  const userId = user?._id || user?.id || null
  const profileLoading = useSelector((state) => state.auth.loading)
  const [latestOrderPrefill, setLatestOrderPrefill] = useState(null)

  function readNonEmpty(source, keys) {
    for (const key of keys) {
      const value = source?.[key]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value)
      }
    }

    return ''
  }

  function getHydratedField(profile, orderPrefill, keys) {
    return readNonEmpty(profile, keys) || readNonEmpty(orderPrefill, keys)
  }

  const [formData, setFormData] = useState({
    name: getHydratedField(user, latestOrderPrefill, ['name']),
    email: getHydratedField(user, latestOrderPrefill, ['email']),
    phone: getHydratedField(user, latestOrderPrefill, ['phone']),
    addressLine1: getHydratedField(
      user,
      latestOrderPrefill,
      ['addressLine1', 'shippingAddress1', 'address1'],
    ),
    addressLine2: getHydratedField(
      user,
      latestOrderPrefill,
      ['addressLine2', 'shippingAddress2', 'address2'],
    ),
    city: getHydratedField(user, latestOrderPrefill, ['city']),
    postalCode: getHydratedField(user, latestOrderPrefill, ['postalCode', 'zip']),
    country: getHydratedField(user, latestOrderPrefill, ['country']),
  })

  useEffect(() => {
    if (!user) {
      return
    }

    setFormData((current) => ({
      name: current.name || getHydratedField(user, latestOrderPrefill, ['name']),
      email: current.email || getHydratedField(user, latestOrderPrefill, ['email']),
      phone: current.phone || getHydratedField(user, latestOrderPrefill, ['phone']),
      addressLine1:
        current.addressLine1 ||
        getHydratedField(user, latestOrderPrefill, ['addressLine1', 'shippingAddress1', 'address1']),
      addressLine2:
        current.addressLine2 ||
        getHydratedField(user, latestOrderPrefill, ['addressLine2', 'shippingAddress2', 'address2']),
      city: current.city || getHydratedField(user, latestOrderPrefill, ['city']),
      postalCode:
        current.postalCode || getHydratedField(user, latestOrderPrefill, ['postalCode', 'zip']),
      country: current.country || getHydratedField(user, latestOrderPrefill, ['country']),
    }))
  }, [user, latestOrderPrefill])

  useEffect(() => {
    dispatch(fetchCurrentUserProfile())
  }, [dispatch])

  useEffect(() => {
    if (!isObjectIdLike(userId)) {
      return
    }

    let cancelled = false

    async function fillFromLatestOrder() {
      try {
        const userOrdersPayload = await apiRequest(`/orders/get/userorders/${userId}`)
        const userOrders = Array.isArray(userOrdersPayload)
          ? userOrdersPayload
          : Array.isArray(userOrdersPayload?.orders)
            ? userOrdersPayload.orders
            : Array.isArray(userOrdersPayload?.data)
              ? userOrdersPayload.data
              : Array.isArray(userOrdersPayload?.data?.orders)
                ? userOrdersPayload.data.orders
                : []

        if (!userOrders.length || cancelled) {
          return
        }

        const latestOrder = [...userOrders].sort((a, b) => {
          const aTime = new Date(a?.dateOrdered || a?.createdAt || 0).getTime()
          const bTime = new Date(b?.dateOrdered || b?.createdAt || 0).getTime()
          return bTime - aTime
        })[0]

        if (!latestOrder || cancelled) {
          return
        }

        setLatestOrderPrefill(latestOrder)
      } catch {
        // Keep current form values if order history cannot be loaded.
      }
    }

    fillFromLatestOrder()

    return () => {
      cancelled = true
    }
  }, [userId])

  if (!user) {
    return <Navigate to="/login" replace />
  }

  function updateField(key, value) {
    setFormData((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    dispatch(
      saveUserProfile({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        addressLine1: formData.addressLine1.trim(),
        shippingAddress1: formData.addressLine1.trim(),
        addressLine2: formData.addressLine2.trim(),
        shippingAddress2: formData.addressLine2.trim(),
        city: formData.city.trim(),
        postalCode: formData.postalCode.trim(),
        zip: formData.postalCode.trim(),
        country: formData.country.trim(),
      }),
    ).then((action) => {
      if (saveUserProfile.rejected.match(action)) {
        toast.error(action.payload || action.error.message || 'Profile update failed')
        return
      }

      toast.success(
        action.payload?.syncMode === 'remote'
          ? 'Profile updated on the server'
          : 'Profile updated locally',
      )
      navigate('/profile')
    })
  }

  function handleDeleteAccount() {
    const confirmed = window.confirm(
      'Delete your account? This removes your local sign-in information.',
    )

    if (!confirmed) {
      return
    }

    dispatch(removeUserAccount()).then((action) => {
      if (removeUserAccount.rejected.match(action)) {
        toast.error(action.payload || action.error.message || 'Account deletion failed')
        return
      }

      toast.success(
        action.payload?.syncMode === 'remote'
          ? 'Account deleted on the server'
          : 'Account deleted locally',
      )
      navigate('/register', { replace: true })
    })
  }

  return (
    <section className="page-stack profile-page">
      <section className="hero-panel">
        <p className="eyebrow">Account center</p>
        <h1>Edit Profile</h1>
        <p>
          {profileLoading
            ? 'Loading your saved profile details...'
            : 'Update your customer details or delete the account from here.'}
        </p>
      </section>

      <section className="profile-form-layout">
        <form className="panel profile-form" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">Edit Profile</p>
            <h2>Update details</h2>
            <p className="section-note">
              Fields are loaded from your saved profile so you can review and update them quickly.
            </p>
          </div>

          <input
            id="name"
            name="name"
            autoComplete="name"
            value={formData.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="Customer Name"
            required
          />

          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={(event) => updateField('email', event.target.value)}
            placeholder="Email"
            required
          />

          <input
            id="phone"
            name="phone"
            autoComplete="tel"
            value={formData.phone}
            onChange={(event) => updateField('phone', event.target.value)}
            placeholder="Phone"
            required
          />

          <input
            id="addressLine1"
            name="addressLine1"
            autoComplete="address-line1"
            value={formData.addressLine1}
            onChange={(event) => updateField('addressLine1', event.target.value)}
            placeholder="Address Line 1"
            required
          />

          <input
            id="addressLine2"
            name="addressLine2"
            autoComplete="address-line2"
            value={formData.addressLine2}
            onChange={(event) => updateField('addressLine2', event.target.value)}
            placeholder="Address Line 2"
          />

          <input
            id="city"
            name="city"
            autoComplete="address-level2"
            value={formData.city}
            onChange={(event) => updateField('city', event.target.value)}
            placeholder="City"
            required
          />

          <input
            id="postalCode"
            name="postalCode"
            autoComplete="postal-code"
            value={formData.postalCode}
            onChange={(event) => updateField('postalCode', event.target.value)}
            placeholder="Postal Code"
            required
          />

          <select
            id="country"
            name="country"
            autoComplete="country-name"
            value={formData.country}
            onChange={(event) => updateField('country', event.target.value)}
            required
          >
            <option value="">Select country</option>
            {formData.country && !countryOptions.includes(formData.country) ? (
              <option value={formData.country}>{formData.country}</option>
            ) : null}
            {countryOptions.map((countryName) => (
              <option key={countryName} value={countryName}>
                {countryName}
              </option>
            ))}
          </select>

          <div className="action-row">
            <button type="submit" className="solid-button">
              Save Changes
            </button>
            <Link className="ghost-button" to="/profile">
              Cancel
            </Link>
          </div>
        </form>

        <article className="panel danger-card">
          <div>
            <p className="eyebrow">Delete Account</p>
            <h2>Remove this account</h2>
          </div>
          <p className="section-note">
            Deleting the account clears the saved sign-in data from this browser.
          </p>
          <button type="button" className="danger-button" onClick={handleDeleteAccount}>
            Delete account
          </button>
        </article>
      </section>
    </section>
  )
}

export default EditProfilePage