import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { API_BASE_URL, apiRequest } from '../../api/client'

const savedUser = localStorage.getItem('authUser')
const savedToken = localStorage.getItem('authToken')

function isObjectIdLike(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''))
}

function normalizeProfileFields(profile = {}, fallback = {}) {
  return {
    _id: profile._id || profile.id || fallback._id || fallback.id || null,
    name: profile.name ?? fallback.name ?? '',
    email: profile.email ?? fallback.email ?? '',
    phone: profile.phone ?? fallback.phone ?? '',
    addressLine1:
      profile.addressLine1 ??
      profile.shippingAddress1 ??
      profile.address1 ??
      fallback.addressLine1 ??
      fallback.shippingAddress1 ??
      fallback.address1 ??
      '',
    addressLine2:
      profile.addressLine2 ??
      profile.shippingAddress2 ??
      profile.address2 ??
      fallback.addressLine2 ??
      fallback.shippingAddress2 ??
      fallback.address2 ??
      '',
    city: profile.city ?? fallback.city ?? '',
    postalCode:
      profile.postalCode ?? profile.zip ?? fallback.postalCode ?? fallback.zip ?? '',
    country: profile.country ?? fallback.country ?? '',
    isAdmin: profile.isAdmin ?? fallback.isAdmin ?? false,
  }
}

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

function buildProfileMutationCandidates(userId) {
  return [
    '/users/profile',
    '/users/me',
    isObjectIdLike(userId) ? `/users/${userId}` : null,
    isObjectIdLike(userId) ? `/users/${userId}/profile` : null,
  ].filter(Boolean)
}

function buildProfileReadCandidates(userId) {
  return [
    '/users/profile',
    '/users/me',
    isObjectIdLike(userId) ? `/users/${userId}` : null,
    isObjectIdLike(userId) ? `/users/${userId}/profile` : null,
  ].filter(Boolean)
}

async function attemptProfileMutation(paths, options) {
  let lastError = null

  for (const path of paths) {
    try {
      return await apiRequest(path, options)
    } catch (error) {
      lastError = error
      const status = error?.status
      const message = String(error?.message || '')
      const routeMissing =
        status === 404 ||
        status === 405 ||
        status === 501 ||
        message.toLowerCase().includes('not found') ||
        message.toLowerCase().includes('cannot')

      if (!routeMissing) {
        throw error
      }
    }
  }

  throw lastError || new Error('Profile request failed unexpectedly.')
}

async function attemptProfileRead(paths) {
  let lastError = null

  for (const path of paths) {
    try {
      return await apiRequest(path)
    } catch (error) {
      lastError = error
      const status = error?.status
      const message = String(error?.message || '')
      const routeMissing =
        status === 404 ||
        status === 405 ||
        status === 501 ||
        message.toLowerCase().includes('not found') ||
        message.toLowerCase().includes('cannot')

      if (!routeMissing) {
        throw error
      }
    }
  }

  throw lastError || new Error('Profile request failed unexpectedly.')
}

export const fetchCurrentUserProfile = createAsyncThunk(
  'auth/fetchCurrentUserProfile',
  async (_, { getState, rejectWithValue }) => {
    const state = getState()
    const userId = state.auth.user?._id

    try {
      const response = await attemptProfileRead(buildProfileReadCandidates(userId))
      const serverUser =
        response?.user || response?.data?.user || response?.data || response || null

      if (serverUser && typeof serverUser === 'object') {
        return {
          user: normalizeProfileFields(serverUser, state.auth.user),
          syncMode: 'remote',
        }
      }

      return {
        user: state.auth.user,
        syncMode: 'local-fallback',
      }
    } catch (error) {
      const fallbackMessage = error?.status
        ? null
        : error?.message || 'Unable to load profile data.'

      if (fallbackMessage && !/timed out|network|fetch/i.test(fallbackMessage)) {
        return rejectWithValue(fallbackMessage)
      }

      return {
        user: state.auth.user,
        syncMode: 'local-fallback',
      }
    }
  },
)

export const saveUserProfile = createAsyncThunk(
  'auth/saveUserProfile',
  async (payload, { getState, rejectWithValue }) => {
    const state = getState()
    const userId = state.auth.user?._id

    try {
      const response = await attemptProfileMutation(
        buildProfileMutationCandidates(userId),
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      )

      const serverUser =
        response?.user || response?.data?.user || response?.data || response || null

      if (serverUser && typeof serverUser === 'object') {
        return {
          user: normalizeProfileFields(serverUser, payload),
          syncMode: 'remote',
        }
      }

      return {
        user: normalizeProfileFields(payload, state.auth.user),
        syncMode: 'remote',
      }
    } catch (error) {
      const fallbackMessage = error?.status
        ? null
        : error?.message || 'Unable to save profile remotely.'

      if (fallbackMessage && !/timed out|network|fetch/i.test(fallbackMessage)) {
        return rejectWithValue(fallbackMessage)
      }

      return {
        user: normalizeProfileFields(payload, state.auth.user),
        syncMode: 'local-fallback',
      }
    }
  },
)

export const removeUserAccount = createAsyncThunk(
  'auth/removeUserAccount',
  async (_, { getState, rejectWithValue }) => {
    const state = getState()
    const userId = state.auth.user?._id

    try {
      await attemptProfileMutation(buildProfileMutationCandidates(userId), {
        method: 'DELETE',
      })

      return { syncMode: 'remote' }
    } catch (error) {
      const fallbackMessage = error?.status
        ? null
        : error?.message || 'Unable to delete account remotely.'

      if (fallbackMessage && !/timed out|network|fetch/i.test(fallbackMessage)) {
        return rejectWithValue(fallbackMessage)
      }

      return { syncMode: 'local-fallback' }
    }
  },
)

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: savedUser ? normalizeProfileFields(JSON.parse(savedUser)) : null,
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
    updateProfile(state, action) {
      if (!state.user) {
        return
      }

      state.user = normalizeProfileFields(action.payload, state.user)
      localStorage.setItem('authUser', JSON.stringify(state.user))
    },
    deleteAccountLocally(state) {
      state.user = null
      state.token = null
      localStorage.removeItem('authUser')
      localStorage.removeItem('authToken')
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
        state.user = normalizeProfileFields(action.payload, {
          _id: action.payload._id,
          email: action.payload.user,
          name: action.payload.name,
          phone: action.payload.phone,
          isAdmin: action.payload.isAdmin,
        })
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
      .addCase(fetchCurrentUserProfile.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCurrentUserProfile.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        localStorage.setItem('authUser', JSON.stringify(state.user))
      })
      .addCase(fetchCurrentUserProfile.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || action.error.message
      })
      .addCase(saveUserProfile.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(saveUserProfile.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        localStorage.setItem('authUser', JSON.stringify(state.user))
      })
      .addCase(saveUserProfile.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || action.error.message
      })
      .addCase(removeUserAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(removeUserAccount.fulfilled, (state) => {
        state.loading = false
        state.user = null
        state.token = null
        localStorage.removeItem('authUser')
        localStorage.removeItem('authToken')
      })
      .addCase(removeUserAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || action.error.message
      })
  },
})

export const {
  clearAuthError,
  deleteAccountLocally,
  logout,
  updateProfile,
} = authSlice.actions
export default authSlice.reducer