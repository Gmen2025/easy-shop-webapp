import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'

function summarizeError(rawError) {
  const text = String(rawError || '')
  if (!text) {
    return 'Request failed. Please try again.'
  }
  if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
    return 'The link is invalid or has expired.'
  }
  return text
}

export const requestPasswordReset = createAsyncThunk(
  'account/requestPasswordReset',
  async (email) => {
    return apiRequest('/users/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },
)

export const verifyResetToken = createAsyncThunk(
  'account/verifyResetToken',
  async ({ token, email }) => {
    return apiRequest(
      `/users/verify-reset-token?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
    )
  },
)

export const resetPassword = createAsyncThunk(
  'account/resetPassword',
  async ({ token, email, newPassword }) => {
    return apiRequest('/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, email, newPassword }),
    })
  },
)

export const verifyEmail = createAsyncThunk(
  'account/verifyEmail',
  async ({ token, email }) => {
    await apiRequest(
      `/users/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
    )
    return { message: 'Email verified successfully. You can now log in.' }
  },
)

export const resendVerification = createAsyncThunk(
  'account/resendVerification',
  async (email) => {
    return apiRequest('/users/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },
)

const accountSlice = createSlice({
  name: 'account',
  initialState: {
    loading: false,
    verifyingReset: false,
    resetTokenValid: null,
    message: null,
    error: null,
  },
  reducers: {
    clearAccountState(state) {
      state.message = null
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(requestPasswordReset.pending, (state) => {
        state.loading = true
        state.message = null
        state.error = null
      })
      .addCase(requestPasswordReset.fulfilled, (state, action) => {
        state.loading = false
        state.message =
          action.payload?.message || 'Reset link request has been processed.'
      })
      .addCase(requestPasswordReset.rejected, (state, action) => {
        state.loading = false
        state.error = summarizeError(action.error.message)
      })
      .addCase(verifyResetToken.pending, (state) => {
        state.verifyingReset = true
        state.resetTokenValid = null
        state.error = null
      })
      .addCase(verifyResetToken.fulfilled, (state, action) => {
        state.verifyingReset = false
        state.resetTokenValid = true
        state.message = action.payload?.message || 'Reset token is valid.'
      })
      .addCase(verifyResetToken.rejected, (state, action) => {
        state.verifyingReset = false
        state.resetTokenValid = false
        state.error = summarizeError(action.error.message)
      })
      .addCase(resetPassword.pending, (state) => {
        state.loading = true
        state.error = null
        state.message = null
      })
      .addCase(resetPassword.fulfilled, (state, action) => {
        state.loading = false
        state.message = action.payload?.message || 'Password has been reset.'
      })
      .addCase(resetPassword.rejected, (state, action) => {
        state.loading = false
        state.error = summarizeError(action.error.message)
      })
      .addCase(verifyEmail.pending, (state) => {
        state.loading = true
        state.error = null
        state.message = null
      })
      .addCase(verifyEmail.fulfilled, (state, action) => {
        state.loading = false
        state.message = action.payload.message
      })
      .addCase(verifyEmail.rejected, (state, action) => {
        state.loading = false
        state.error = summarizeError(action.error.message)
      })
      .addCase(resendVerification.pending, (state) => {
        state.loading = true
        state.error = null
        state.message = null
      })
      .addCase(resendVerification.fulfilled, (state, action) => {
        state.loading = false
        state.message = action.payload?.message || 'Verification email resent.'
      })
      .addCase(resendVerification.rejected, (state, action) => {
        state.loading = false
        state.error = summarizeError(action.error.message)
      })
  },
})

export const { clearAccountState } = accountSlice.actions
export default accountSlice.reducer