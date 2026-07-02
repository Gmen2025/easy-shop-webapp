import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ProductDetailsPage from './pages/ProductDetailsPage'
import CartPage from './pages/CartPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OrdersPage from './pages/OrdersPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ProfilePage from './pages/ProfilePage'
import EditProfilePage from './pages/EditProfilePage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import PaymentCancelPage from './pages/PaymentCancelPage'
import NotFoundPage from './pages/NotFoundPage'
import MaintenancePage from './pages/MaintenancePage'
import { fetchMaintenanceMode } from './features/maintenance/maintenanceSlice'

const MAINTENANCE_EXEMPT_PREFIXES = [
  '/admin',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]
const MAINTENANCE_SYNC_INTERVAL_MS = 30 * 60 * 1000

function isMaintenanceExemptPath(pathname) {
  return MAINTENANCE_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function App() {
  const dispatch = useDispatch()
  const location = useLocation()
  const user = useSelector((state) => state.auth.user)
  const token = useSelector((state) => state.auth.token)
  const maintenanceEnabled = useSelector((state) => state.maintenance.enabled)
  const isAuthenticated = Boolean(user && token)
  const isAdmin = Boolean(user?.isAdmin)
  const showMaintenancePage =
    maintenanceEnabled && !isAdmin && !isMaintenanceExemptPath(location.pathname)

  useEffect(() => {
    dispatch(fetchMaintenanceMode())

    const intervalId = setInterval(() => {
      dispatch(fetchMaintenanceMode())
    }, MAINTENANCE_SYNC_INTERVAL_MS)

    const syncOnFocus = () => dispatch(fetchMaintenanceMode())
    window.addEventListener('focus', syncOnFocus)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', syncOnFocus)
    }
  }, [dispatch])

  useEffect(() => {
    dispatch(fetchMaintenanceMode())
  }, [dispatch, location.pathname])

  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route
            index
            element={showMaintenancePage ? <MaintenancePage /> : <HomePage />}
          />
          <Route
            path="products/:id"
            element={showMaintenancePage ? <MaintenancePage /> : <ProductDetailsPage />}
          />
          <Route
            path="cart"
            element={showMaintenancePage ? <MaintenancePage /> : <CartPage />}
          />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={showMaintenancePage ? <MaintenancePage /> : <RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
          <Route
            path="payment/success"
            element={showMaintenancePage ? <MaintenancePage /> : <PaymentSuccessPage />}
          />
          <Route
            path="payment/cancel"
            element={showMaintenancePage ? <MaintenancePage /> : <PaymentCancelPage />}
          />
          <Route
            path="profile"
            element={
              showMaintenancePage
                ? <MaintenancePage />
                : isAuthenticated
                  ? <ProfilePage />
                  : <Navigate to="/login" replace />
            }
          />
          <Route
            path="edit-profile"
            element={
              showMaintenancePage
                ? <MaintenancePage />
                : isAuthenticated
                  ? <EditProfilePage />
                  : <Navigate to="/login" replace />
            }
          />
          <Route
            path="privacy-policy"
            element={showMaintenancePage ? <MaintenancePage /> : <PrivacyPolicyPage />}
          />
          <Route
            path="orders"
            element={
              showMaintenancePage
                ? <MaintenancePage />
                : isAuthenticated
                  ? <OrdersPage />
                  : <Navigate to="/login" replace />
            }
          />
          <Route
            path="admin"
            element={
              isAuthenticated && isAdmin ? <AdminDashboardPage /> : <Navigate to="/login" replace />
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}

export default App
