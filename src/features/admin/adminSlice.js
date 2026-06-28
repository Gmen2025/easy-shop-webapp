import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'

const toId = (entity) => entity?.id || entity?._id

const normalizeProductInput = (payload) => {
  const normalizedImages = [
    ...(Array.isArray(payload.images) ? payload.images : []),
    payload.image,
  ]
    .map((image) => String(image || '').trim())
    .filter((image, index, array) => image && array.indexOf(image) === index)

  return {
    ...payload,
    image: normalizedImages[0] || '',
    images: normalizedImages,
    price: Number(payload.price || 0),
    countInStock: Number(payload.countInStock || 0),
    isFeatured: Boolean(payload.isFeatured),
  }
}

export const fetchAdminCatalog = createAsyncThunk(
  'admin/fetchAdminCatalog',
  async () => {
    const [categories, products, orders] = await Promise.all([
      apiRequest('/categories'),
      apiRequest('/products'),
      apiRequest('/orders'),
    ])
    return { categories, products, orders }
  },
)

export const updateOrderStatusAdmin = createAsyncThunk(
  'admin/updateOrderStatusAdmin',
  async ({ id, status }) => {
    return apiRequest(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
  },
)

export const deleteOrderAdmin = createAsyncThunk(
  'admin/deleteOrderAdmin',
  async ({ id, customerEmail, customerName }) => {
    await apiRequest(`/orders/${id}?notifyCustomer=true`, {
      method: 'DELETE',
      body: JSON.stringify({
        notifyCustomer: true,
        customerEmail,
        customerName,
      }),
    })
    return id
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
    orders: [],
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
        state.orders = action.payload.orders
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
      .addCase(updateOrderStatusAdmin.fulfilled, (state, action) => {
        state.saving = false
        state.orders = state.orders.map((order) =>
          toId(order) === toId(action.payload) ? action.payload : order,
        )
        state.message = 'Order shipping status updated.'
      })
      .addCase(deleteOrderAdmin.fulfilled, (state, action) => {
        state.saving = false
        state.orders = state.orders.filter((order) => toId(order) !== action.payload)
        state.message = 'Order deleted.'
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