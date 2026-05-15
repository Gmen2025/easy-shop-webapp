import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'

const savedUser = localStorage.getItem('authUser')
const savedToken = localStorage.getItem('authToken')

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ email, password }) => {
    return apiRequest('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },
)

export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (payload) => {
    return apiRequest('/users/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
)

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: savedUser ? JSON.parse(savedUser) : null,
    token: savedToken || null,
    loading: false,
    error: null,
    registerMessage: null,
  },
  reducers: {
    clearAuthError(state) {
      state.error = null
    },
    logout(state) {
      state.user = null
      state.token = null
      localStorage.removeItem('authUser')
      localStorage.removeItem('authToken')
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false
        state.user = {
          _id: action.payload._id,
          email: action.payload.user,
          name: action.payload.name,
          phone: action.payload.phone,
          isAdmin: action.payload.isAdmin,
        }
        state.token = action.payload.token
        localStorage.setItem('authUser', JSON.stringify(state.user))
        localStorage.setItem('authToken', action.payload.token)
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(registerUser.pending, (state) => {
        state.loading = true
        state.error = null
        state.registerMessage = null
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false
        state.registerMessage =
          action.payload?.message ||
          'Registration successful. Please verify your email.'
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
  },
})

export const { clearAuthError, logout } = authSlice.actions
export default authSlice.reducer