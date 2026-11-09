import { combineReducers, configureStore } from '@reduxjs/toolkit'
import authReducer, { removeUserAccount } from '../features/auth/authSlice'
import productsReducer from '../features/products/productsSlice'
import categoriesReducer from '../features/categories/categoriesSlice'
import cartReducer from '../features/cart/cartSlice'
import ordersReducer from '../features/orders/ordersSlice'
import adminReducer from '../features/admin/adminSlice'
import accountReducer from '../features/account/accountSlice'
import paymentReducer from '../features/payment/paymentSlice'
import maintenanceReducer from '../features/maintenance/maintenanceSlice'

const appReducer = combineReducers({
  auth: authReducer,
  products: productsReducer,
  categories: categoriesReducer,
  cart: cartReducer,
  orders: ordersReducer,
  admin: adminReducer,
  account: accountReducer,
  payment: paymentReducer,
  maintenance: maintenanceReducer,
})

export function rootReducer(state, action) {
  if (removeUserAccount.fulfilled.match(action)) {
    state = { ...state, orders: undefined, admin: undefined, account: undefined, payment: undefined }
  }
  return appReducer(state, action)
}

export const store = configureStore({
  reducer: rootReducer,
})