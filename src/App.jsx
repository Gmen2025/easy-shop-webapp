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
import AdminHomePage from './pages/AdminHomePage'
import AdminOperationsPage from './pages/AdminOperationsPage'
import RideSettingsPage from './pages/RideSettingsPage'
import AdminNavigation from './components/AdminNavigation'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ProfilePage from './pages/ProfilePage'
import EditProfilePage from './pages/EditProfilePage'
import SecuritySettingsPage from './pages/SecuritySettingsPage'
import ServiceRequestPage from './pages/ServiceRequestPage'
import ServiceRequestsPage from './pages/ServiceRequestsPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import PaymentCancelPage from './pages/PaymentCancelPage'
import NotFoundPage from './pages/NotFoundPage'
import MaintenancePage from './pages/MaintenancePage'
import StoreDirectoryPage from './pages/StoreDirectoryPage'
import StorefrontPage from './pages/StorefrontPage'
import RideBookingPage from './pages/RideBookingPage'
import MyRidesPage from './pages/MyRidesPage'
import DeliveryCheckoutPage from './pages/DeliveryCheckoutPage'
import DeliveryCheckoutsPage from './pages/DeliveryCheckoutsPage'
import DeliverySettingsPage from './pages/DeliverySettingsPage'
import DriverDeliveriesPage from './pages/DriverDeliveriesPage'
import CompanyStorePage from './pages/CompanyStorePage'
import StoreManagementPage from './pages/StoreManagementPage'
import StoreAssignmentsPage from './pages/StoreAssignmentsPage'
import DriverRidesPage from './pages/DriverRidesPage'
import { CompanyAccessDenied } from './components/CompanyNavigation'
import { isCompanyDriver, isCompanyStoreOwner } from './utils/company'
import { fetchCurrentUserProfile } from './features/auth/authSlice'
import InternationalPaymentsSettingsPage from './pages/InternationalPaymentsSettingsPage'
import { fetchMaintenanceMode } from './features/maintenance/maintenanceSlice'

const MAINTENANCE_EXEMPT_PREFIXES = [
  '/admin',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/security-settings',
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
  const authLoading = useSelector((state) => state.auth.loading)
  const maintenanceEnabled = useSelector((state) => state.maintenance.enabled)
  const isAuthenticated = Boolean(user && token)
  const isAdmin = Boolean(user?.isAdmin)
  const showMaintenancePage =
    maintenanceEnabled && !isAdmin && !isMaintenanceExemptPath(location.pathname)

  useEffect(() => {
    if (token) dispatch(fetchCurrentUserProfile())
  }, [dispatch, token])

  const companyPage = (allowed, page) => showMaintenancePage ? <MaintenancePage /> :
    !isAuthenticated ? <Navigate to="/login" replace /> :
      allowed ? page : authLoading ? <p role="status">Checking company account access...</p> : <CompanyAccessDenied />

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
          <Route
            path="stores"
            element={
              showMaintenancePage
                ? <MaintenancePage />
                : isAuthenticated
                  ? <StoreDirectoryPage />
                  : <Navigate to="/login" replace />
            }
          />
          <Route
            path="stores/:id"
            element={
              showMaintenancePage
                ? <MaintenancePage />
                : isAuthenticated
                  ? <StorefrontPage />
                  : <Navigate to="/login" replace />
            }
          />
          <Route path="login" element={<LoginPage />} />
          <Route path="security-settings" element={isAuthenticated ? <SecuritySettingsPage /> : <Navigate to="/login" replace />} />
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
            path="service-request"
            element={
              showMaintenancePage
                ? <MaintenancePage />
                : isAuthenticated
                  ? <ServiceRequestPage />
                  : <Navigate to="/login" replace />
            }
          />
          <Route
            path="service-requests"
            element={
              showMaintenancePage
                ? <MaintenancePage />
                : isAuthenticated
                  ? <ServiceRequestsPage />
                  : <Navigate to="/login" replace />
            }
          />
          <Route
            path="rides"
            element={
              showMaintenancePage
                ? <MaintenancePage />
                : isAuthenticated
                  ? <RideBookingPage />
                  : <Navigate to="/login" replace />
            }
          />
          <Route
            path="rides/mine"
            element={
              showMaintenancePage
                ? <MaintenancePage />
                : isAuthenticated
                  ? <MyRidesPage />
                  : <Navigate to="/login" replace />
            }
          />
          <Route
            path="privacy-policy"
            element={<PrivacyPolicyPage />}
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
              isAuthenticated && isAdmin ? <AdminHomePage /> : <Navigate to="/login" replace />
            }
          />
          <Route path="admin/tools/:section" element={isAuthenticated && isAdmin ? <AdminDashboardPage key={location.pathname} /> : <Navigate to="/login" replace />} />
          <Route path="admin/operations/:section" element={isAuthenticated && isAdmin ? <section className="page-stack admin-console"><AdminNavigation /><AdminOperationsPage key={location.pathname} /></section> : <Navigate to="/login" replace />} />
          <Route path="admin/rides" element={isAuthenticated && isAdmin ? <section className="page-stack admin-console"><AdminNavigation /><RideSettingsPage /></section> : <Navigate to="/login" replace />} />
          <Route path="delivery-checkouts" element={showMaintenancePage ? <MaintenancePage /> : isAuthenticated ? <DeliveryCheckoutsPage /> : <Navigate to="/login" replace />} />
          <Route path="delivery-checkouts/:id" element={showMaintenancePage ? <MaintenancePage /> : isAuthenticated ? <DeliveryCheckoutPage key={location.pathname} /> : <Navigate to="/login" replace />} />
          <Route path="store-owner" element={companyPage(isCompanyStoreOwner(user), <CompanyStorePage />)} />
          <Route path="store-owner/orders/:orderId" element={companyPage(isCompanyStoreOwner(user), <CompanyStorePage />)} />
          <Route path="store-owner/manage" element={companyPage(isCompanyStoreOwner(user), <StoreManagementPage />)} />
          <Route path="store-owner/assignments" element={companyPage(isCompanyStoreOwner(user), <StoreAssignmentsPage />)} />
          <Route path="driver" element={companyPage(isCompanyDriver(user), <DriverDeliveriesPage />)} />
          <Route path="driver/deliveries" element={companyPage(isCompanyDriver(user), <DriverDeliveriesPage />)} />
          <Route path="driver/rides" element={companyPage(isCompanyDriver(user), <DriverRidesPage />)} />
          <Route path="driver/rides/trip" element={companyPage(isCompanyDriver(user), <DriverRidesPage tripOnly />)} />
          <Route path="admin/delivery" element={isAuthenticated && isAdmin ? <DeliverySettingsPage /> : <Navigate to="/login" replace />} />
          <Route path="admin/delivery-payments" element={isAuthenticated && isAdmin ? <DeliveryCheckoutsPage admin /> : <Navigate to="/login" replace />} />
          <Route path="admin/international-payments" element={isAuthenticated && isAdmin ? <InternationalPaymentsSettingsPage /> : <Navigate to="/login" replace />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
export default App
