import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'

const MAINTENANCE_MODE_PATH =
  import.meta.env.VITE_MAINTENANCE_MODE_PATH || '/settings/maintenance'
const MAINTENANCE_MODE_METHOD = String(
  import.meta.env.VITE_MAINTENANCE_MODE_METHOD || 'PUT',
).toUpperCase()

async function getConfiguredDatabases() {
  try {
    const payload = await apiRequest('/database/list')
    const databases = Array.isArray(payload?.databases)
      ? payload.databases
      : []

    const normalized = databases
      .map((name) => String(name || '').trim())
      .filter((name) => name)

    return normalized.length ? normalized : null
  } catch {
    return null
  }
}

function normalizeMaintenancePayload(payload) {
  if (typeof payload === 'boolean') {
    return { enabled: payload, testingAccess: false }
  }

  const candidates = [
    payload?.enabled,
    payload?.maintenance,
    payload?.maintenanceMode,
    payload?.isMaintenanceMode,
    payload?.data?.enabled,
    payload?.data?.maintenance,
    payload?.data?.maintenanceMode,
    payload?.data?.isMaintenanceMode,
    payload?.data?.settings?.maintenance,
    payload?.data?.settings?.maintenanceMode,
    payload?.settings?.maintenance,
    payload?.settings?.maintenanceMode,
  ]

  const firstBoolean = candidates.find((value) => typeof value === 'boolean')
  if (firstBoolean === undefined || (payload.testingAccess !== undefined && typeof payload.testingAccess !== 'boolean')) {
    throw new Error('Maintenance access could not be verified. Please retry.')
  }
  if (payload.usaRegionEnabled !== undefined && typeof payload.usaRegionEnabled !== 'boolean') {
    throw new Error('USA availability could not be verified. Please retry.')
  }
  return { enabled: firstBoolean, testingAccess: payload.testingAccess === true,
    usaRegionEnabled: payload.usaRegionEnabled }
}

export const fetchMaintenanceMode = createAsyncThunk(
  'maintenance/fetchMaintenanceMode',
  async (access) => {
    const payload = await apiRequest(MAINTENANCE_MODE_PATH, access?.database ?
      { headers: { 'x-database-name': access.database } } : {})
    return normalizeMaintenancePayload(payload)
  },
)

export const updateMaintenanceModeAdmin = createAsyncThunk(
  'maintenance/updateMaintenanceModeAdmin',
  async (enabled) => {
    const normalizedEnabled = Boolean(enabled)
    const databases = await getConfiguredDatabases()

    if (Array.isArray(databases) && databases.length) {
      const updates = await Promise.all(
        databases.map((databaseName) =>
          apiRequest(MAINTENANCE_MODE_PATH, {
            method: MAINTENANCE_MODE_METHOD,
            headers: {
              'x-database-name': databaseName,
            },
            body: JSON.stringify({ enabled: normalizedEnabled }),
          }),
        ),
      )

      return normalizeMaintenancePayload(updates[0])
    }

    const payload = await apiRequest(MAINTENANCE_MODE_PATH, {
      method: MAINTENANCE_MODE_METHOD,
      body: JSON.stringify({ enabled: normalizedEnabled }),
    })

    return normalizeMaintenancePayload(payload)
  },
)

const maintenanceSlice = createSlice({
  name: 'maintenance',
  initialState: {
    enabled: false,
    usaRegionEnabled: undefined,
    testingAccess: false,
    accessUserId: null,
    accessDatabase: null,
    requestId: null,
    loading: false,
    updating: false,
    error: null,
    lastSyncedAt: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMaintenanceMode.pending, (state, action) => {
        state.requestId = action.meta.requestId
        state.loading = true
        state.error = null
      })
      .addCase(fetchMaintenanceMode.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return
        state.loading = false
        state.enabled = action.payload.enabled
        state.usaRegionEnabled = action.payload.usaRegionEnabled
        state.testingAccess = action.payload.testingAccess
        state.accessUserId = action.meta.arg?.userId || null
        state.accessDatabase = action.meta.arg?.database || null
        state.lastSyncedAt = Date.now()
      })
      .addCase(fetchMaintenanceMode.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return
        state.loading = false
        state.error = action.error.message
        state.testingAccess = false
      })
      .addCase(updateMaintenanceModeAdmin.pending, (state) => {
        state.updating = true
        state.error = null
      })
      .addCase(updateMaintenanceModeAdmin.fulfilled, (state, action) => {
        state.requestId = null
        state.updating = false
        state.enabled = action.payload.enabled
        state.testingAccess = false
        state.lastSyncedAt = Date.now()
      })
      .addCase(updateMaintenanceModeAdmin.rejected, (state, action) => {
        state.updating = false
        state.error = action.error.message
      })
  },
})

export default maintenanceSlice.reducer