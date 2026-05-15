import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'

export const createOrder = createAsyncThunk(
  'orders/createOrder',
  async (payload) => {
    return apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
)

export const fetchUserOrders = createAsyncThunk(
  'orders/fetchUserOrders',
  async (userId) => {
    return apiRequest(`/orders/get/userorders/${userId}`)
  },
)

const ordersSlice = createSlice({
  name: 'orders',
  initialState: {
    items: [],
    loading: false,
    creating: false,
    error: null,
    successMessage: null,
  },
  reducers: {
    clearOrderState(state) {
      state.error = null
      state.successMessage = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserOrders.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchUserOrders.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchUserOrders.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(createOrder.pending, (state) => {
        state.creating = true
        state.error = null
        state.successMessage = null
      })
      .addCase(createOrder.fulfilled, (state, action) => {
        state.creating = false
        state.successMessage =
          action.payload?.message || 'Order created successfully.'
      })
      .addCase(createOrder.rejected, (state, action) => {
        state.creating = false
        state.error = action.error.message
      })
  },
})

export const { clearOrderState } = ordersSlice.actions
export default ordersSlice.reducer