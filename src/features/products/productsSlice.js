import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'
import { createOrderWithInventorySync } from '../orders/ordersSlice'
import { applyInventoryOverride, applyInventoryOverrides } from '../../utils/inventory'

const toId = (entity) => String(entity?.id || entity?._id || '')

export const fetchProducts = createAsyncThunk(
  'products/fetchProducts',
  async ({ categoryId } = {}) => {
    const payload = await apiRequest('/products')
    const rawProducts = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.products)
        ? payload.products
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.data?.products)
            ? payload.data.products
            : []
    const allProducts = applyInventoryOverrides(rawProducts)
    if (!categoryId) {
      return allProducts
    }
    return allProducts.filter((product) => {
      const productCategoryId = product?.category?.id || product?.category?._id
      return productCategoryId === categoryId
    })
  },
)

export const fetchProductById = createAsyncThunk(
  'products/fetchProductById',
  async (productId) => {
    const payload = await apiRequest(`/products/${productId}`)
    const product = payload?.product || payload?.data?.product || payload?.data || payload
    return applyInventoryOverride(product)
  },
)

const productsSlice = createSlice({
  name: 'products',
  initialState: {
    items: [],
    selectedProduct: null,
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(fetchProductById.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProductById.fulfilled, (state, action) => {
        state.loading = false
        state.selectedProduct = action.payload
      })
      .addCase(fetchProductById.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(createOrderWithInventorySync.fulfilled, (state, action) => {
        const inventoryUpdates = Array.isArray(action.payload?.inventoryUpdates)
          ? action.payload.inventoryUpdates
          : []

        if (!inventoryUpdates.length) {
          return
        }

        const updatesByProductId = new Map(
          inventoryUpdates.map((update) => [String(update.productId), update]),
        )

        state.items = state.items.map((product) => {
          const productId = toId(product)
          if (!updatesByProductId.has(productId)) {
            return product
          }

          const update = updatesByProductId.get(productId)
          return {
            ...product,
            countInStock: Number(update.remainingStock || 0),
          }
        })

        const selectedId = toId(state.selectedProduct)
        if (selectedId && updatesByProductId.has(selectedId)) {
          const selectedUpdate = updatesByProductId.get(selectedId)
          state.selectedProduct = {
            ...state.selectedProduct,
            countInStock: Number(selectedUpdate.remainingStock || 0),
          }
        }
      })
  },
})

export default productsSlice.reducer