import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'

export const createPaymentIntent = createAsyncThunk(
  'payment/createPaymentIntent',
  async ({ amount, currency = 'usd', orderId }, { rejectWithValue }) => {
    try {
      return await apiRequest('/stripe/create-payment-intent', {
        method: 'POST',
        body: JSON.stringify({ amount, currency, orderId }),
      })
    } catch (error) {
      return rejectWithValue(error?.message || 'Unable to initialize card payment.')
    }
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
        state.clientSecret =
          action.payload?.client_secret ||
          action.payload?.clientSecret ||
          action.payload?.data?.client_secret ||
          action.payload?.data?.clientSecret ||
          null
        if (!state.clientSecret) {
          state.error = 'Stripe did not return a payment client secret.'
        }
      })
      .addCase(createPaymentIntent.rejected, (state, action) => {
        state.creatingIntent = false
        state.error = action.payload || action.error.message
      })
  },
})

export const { clearPaymentState } = paymentSlice.actions
export default paymentSlice.reducer