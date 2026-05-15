import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'

export const createPaymentIntent = createAsyncThunk(
  'payment/createPaymentIntent',
  async ({ amount, currency = 'usd', orderId }) => {
    return apiRequest('/stripe/create-payment-intent', {
      method: 'POST',
      body: JSON.stringify({ amount, currency, orderId }),
    })
  },
)

const paymentSlice = createSlice({
  name: 'payment',
  initialState: {
    creatingIntent: false,
    clientSecret: null,
    error: null,
  },
  reducers: {
    clearPaymentState(state) {
      state.creatingIntent = false
      state.clientSecret = null
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createPaymentIntent.pending, (state) => {
        state.creatingIntent = true
        state.clientSecret = null
        state.error = null
      })
      .addCase(createPaymentIntent.fulfilled, (state, action) => {
        state.creatingIntent = false
        state.clientSecret = action.payload?.client_secret || null
      })
      .addCase(createPaymentIntent.rejected, (state, action) => {
        state.creatingIntent = false
        state.error = action.error.message
      })
  },
})

export const { clearPaymentState } = paymentSlice.actions
export default paymentSlice.reducer