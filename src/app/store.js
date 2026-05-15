import { configureStore } from '@reduxjs/toolkit'
import authReducer from '../features/auth/authSlice'
import productsReducer from '../features/products/productsSlice'
import categoriesReducer from '../features/categories/categoriesSlice'
import cartReducer from '../features/cart/cartSlice'
import ordersReducer from '../features/orders/ordersSlice'
import adminReducer from '../features/admin/adminSlice'
import accountReducer from '../features/account/accountSlice'
import paymentReducer from '../features/payment/paymentSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    products: productsReducer,
    categories: categoriesReducer,
    cart: cartReducer,
    orders: ordersReducer,
    admin: adminReducer,
    account: accountReducer,
    payment: paymentReducer,
  },
})