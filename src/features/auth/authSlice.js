import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { API_BASE_URL, apiRequest } from '../../api/client'

const savedUser = localStorage.getItem('authUser')
const savedToken = localStorage.getItem('authToken')

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ email, password, databaseName }, { rejectWithValue }) => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const headers = {
      'Content-Type': 'application/json',
      ...(databaseName ? { 'x-database-name': databaseName } : {}),
    }

    try {
      const response = await fetch(`${API_BASE_URL}/users/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: normalizedEmail, password }),
      })

      const contentType = response.headers.get('content-type') || ''
      const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text()

      const selectedDatabase =
        response.headers.get('x-selected-database') || databaseName || null

      if (!response.ok) {
        const responseBody =
          typeof payload === 'string' ? payload : JSON.stringify(payload)
        const message =
          typeof payload === 'string'
            ? payload
            : payload?.message || 'Login failed unexpectedly.'

        return rejectWithValue({
          message,
          status: response.status,
          contentType,
          responseBody,
          databaseSent: databaseName || null,
          selectedDatabase,
        })
      }

      return {
        ...payload,
        _debug: {
          status: response.status,
          databaseSent: databaseName || null,
          selectedDatabase,
        },
      }
    } catch (error) {
      return rejectWithValue({
        message: error?.message || 'Network error during login.',
        status: null,
        contentType: null,
        responseBody: null,
        databaseSent: databaseName || null,
        selectedDatabase: null,
      })
    }
  },
)

export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (payload) => {
    const normalizedEmail = String(payload?.email || '').trim().toLowerCase()
    return apiRequest('/users/register', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        email: normalizedEmail,
      }),
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
    loginDebug: null,
    registerMessage: null,
  },
  reducers: {
    clearAuthError(state) {
      state.error = null
      state.loginDebug = null
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
        state.loginDebug = null
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
        state.loginDebug = action.payload._debug || null
        if (action.meta?.arg?.databaseName) {
          localStorage.setItem('selectedDatabaseName', action.meta.arg.databaseName)
        }
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false
        if (action.payload?.message) {
          state.error = action.payload.message
          state.loginDebug = {
            status: action.payload.status,
            contentType: action.payload.contentType,
            responseBody: action.payload.responseBody,
            databaseSent: action.payload.databaseSent,
            selectedDatabase: action.payload.selectedDatabase,
          }
        } else {
          state.error = action.error.message
          state.loginDebug = null
        }
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