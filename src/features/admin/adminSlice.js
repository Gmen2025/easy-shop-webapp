import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'

const toId = (entity) => entity?.id || entity?._id

const normalizeProductInput = (payload) => ({
  ...payload,
  price: Number(payload.price || 0),
  countInStock: Number(payload.countInStock || 0),
  isFeatured: Boolean(payload.isFeatured),
})

export const fetchAdminCatalog = createAsyncThunk(
  'admin/fetchAdminCatalog',
  async () => {
    const [categories, products] = await Promise.all([
      apiRequest('/categories'),
      apiRequest('/products'),
    ])
    return { categories, products }
  },
)

export const createCategoryAdmin = createAsyncThunk(
  'admin/createCategoryAdmin',
  async (payload) => {
    return apiRequest('/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
)

export const updateCategoryAdmin = createAsyncThunk(
  'admin/updateCategoryAdmin',
  async ({ id, payload }) => {
    return apiRequest(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
)

export const deleteCategoryAdmin = createAsyncThunk(
  'admin/deleteCategoryAdmin',
  async (id) => {
    await apiRequest(`/categories/${id}`, {
      method: 'DELETE',
    })
    return id
  },
)

export const createProductAdmin = createAsyncThunk(
  'admin/createProductAdmin',
  async (payload) => {
    return apiRequest('/products', {
      method: 'POST',
      body: JSON.stringify(normalizeProductInput(payload)),
    })
  },
)

export const updateProductAdmin = createAsyncThunk(
  'admin/updateProductAdmin',
  async ({ id, payload }) => {
    return apiRequest(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(normalizeProductInput(payload)),
    })
  },
)

export const deleteProductAdmin = createAsyncThunk(
  'admin/deleteProductAdmin',
  async (id) => {
    await apiRequest(`/products/${id}`, {
      method: 'DELETE',
    })
    return id
  },
)

const adminSlice = createSlice({
  name: 'admin',
  initialState: {
    categories: [],
    products: [],
    loading: false,
    saving: false,
    error: null,
    message: null,
  },
  reducers: {
    clearAdminState(state) {
      state.error = null
      state.message = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdminCatalog.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchAdminCatalog.fulfilled, (state, action) => {
        state.loading = false
        state.categories = action.payload.categories
        state.products = action.payload.products
      })
      .addCase(fetchAdminCatalog.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(createCategoryAdmin.fulfilled, (state, action) => {
        state.saving = false
        state.categories.unshift(action.payload)
        state.message = 'Category created.'
      })
      .addCase(updateCategoryAdmin.fulfilled, (state, action) => {
        state.saving = false
        state.categories = state.categories.map((category) =>
          toId(category) === toId(action.payload) ? action.payload : category,
        )
        state.message = 'Category updated.'
      })
      .addCase(deleteCategoryAdmin.fulfilled, (state, action) => {
        state.saving = false
        state.categories = state.categories.filter(
          (category) => toId(category) !== action.payload,
        )
        state.message = 'Category deleted.'
      })
      .addCase(createProductAdmin.fulfilled, (state, action) => {
        state.saving = false
        state.products.unshift(action.payload)
        state.message = 'Product created.'
      })
      .addCase(updateProductAdmin.fulfilled, (state, action) => {
        state.saving = false
        state.products = state.products.map((product) =>
          toId(product) === toId(action.payload) ? action.payload : product,
        )
        state.message = 'Product updated.'
      })
      .addCase(deleteProductAdmin.fulfilled, (state, action) => {
        state.saving = false
        state.products = state.products.filter(
          (product) => toId(product) !== action.payload,
        )
        state.message = 'Product deleted.'
      })
      .addMatcher(
        (action) =>
          action.type.startsWith('admin/') &&
          action.type.endsWith('/pending') &&
          !action.type.includes('fetchAdminCatalog'),
        (state) => {
          state.saving = true
          state.error = null
          state.message = null
        },
      )
      .addMatcher(
        (action) =>
          action.type.startsWith('admin/') &&
          action.type.endsWith('/rejected') &&
          !action.type.includes('fetchAdminCatalog'),
        (state, action) => {
          state.saving = false
          state.error = action.error.message
        },
      )
  },
})

export const { clearAdminState } = adminSlice.actions
export default adminSlice.reducer