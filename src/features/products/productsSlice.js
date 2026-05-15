import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'

export const fetchProducts = createAsyncThunk(
  'products/fetchProducts',
  async ({ categoryId } = {}) => {
    const allProducts = await apiRequest('/products')
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
    return apiRequest(`/products/${productId}`)
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
  },
})

export default productsSlice.reducer