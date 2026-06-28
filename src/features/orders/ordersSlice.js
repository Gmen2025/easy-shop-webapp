import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiRequest } from '../../api/client'
import { deleteOrderAdmin } from '../admin/adminSlice'
import { getLowStockThreshold, saveInventoryStockOverrides } from '../../utils/inventory'

const toId = (entity) => String(entity?.id || entity?._id || '')

const toProductName = (product) =>
  String(product?.name || product?.title || 'a product').trim()

const toOrderSuccessMessage = (payload) =>
  payload?.message || 'Order created successfully.'

async function notifyAdminLowStockByEmail({
  lowStockProducts,
  minimumStockThreshold,
  orderResponse,
  payload,
}) {
  if (!Array.isArray(lowStockProducts) || !lowStockProducts.length) {
    return false
  }

  const notificationPayload = {
    lowStockProducts,
    minimumStockThreshold,
    orderId: orderResponse?.id || orderResponse?._id || null,
    customerEmail: payload?.customerEmail || null,
  }

  const candidateEndpoints = [
    '/orders/notify-admin-low-stock',
    '/notifications/low-stock',
    '/users/notify-admin-low-stock',
  ]

  for (const endpoint of candidateEndpoints) {
    try {
      await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(notificationPayload),
      })
      return true
    } catch {
      // Keep trying other known backend routes.
    }
  }

  return false
}

const normalizeProductInventoryPayload = (product, remainingStock) => {
  const images = [
    ...(Array.isArray(product?.images) ? product.images : []),
    product?.image,
  ]
    .map((image) => String(image || '').trim())
    .filter((image, index, array) => image && array.indexOf(image) === index)

  return {
    name: product?.name || '',
    description: product?.description || '',
    richDescription: product?.richDescription || '',
    image: images[0] || '',
    images,
    brand: product?.brand || '',
    price: Number(product?.price || 0),
    category: product?.category?.id || product?.category?._id || product?.category || '',
    countInStock: Number(remainingStock || 0),
    isFeatured: Boolean(product?.isFeatured),
  }
}

export const createOrder = createAsyncThunk(
  'orders/createOrder',
  async (payload) => {
    return apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
)

export const createOrderWithInventorySync = createAsyncThunk(
  'orders/createOrderWithInventorySync',
  async (payload) => {
    const minimumStockThreshold = getLowStockThreshold()
    const products = await apiRequest('/products')
    const productsById = new Map(products.map((product) => [toId(product), product]))
    const orderItems = Array.isArray(payload?.orderItems) ? payload.orderItems : []
    const inventoryUpdates = []
    const lowStockProducts = []

    for (const item of orderItems) {
      const productId = String(item?.product || '')
      const requestedQuantity = Number(item?.quantity || 0)

      if (!productId || requestedQuantity < 1) {
        continue
      }

      const product = productsById.get(productId)
      if (!product) {
        throw new Error('One of the products in your cart is no longer available.')
      }

      const availableStock = Number(product?.countInStock || 0)
      const productName = toProductName(product)

      if (requestedQuantity > availableStock) {
        throw new Error(
          `Only ${availableStock} item(s) left in stock for ${productName}. Please update your cart.`,
        )
      }

      const remainingStock = Math.max(availableStock - requestedQuantity, 0)
      inventoryUpdates.push({
        productId,
        productName,
        remainingStock,
      })

      if (remainingStock <= minimumStockThreshold) {
        lowStockProducts.push({
          productId,
          productName,
          remainingStock,
        })
      }
    }

    const orderResponse = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    saveInventoryStockOverrides(inventoryUpdates)

    const adminLowStockEmailSent = await notifyAdminLowStockByEmail({
      lowStockProducts,
      minimumStockThreshold,
      orderResponse,
      payload,
    })

    await Promise.allSettled(
      inventoryUpdates.map((update) => {
        const sourceProduct = productsById.get(update.productId)
        if (!sourceProduct) {
          return Promise.resolve()
        }

        return apiRequest(`/products/${update.productId}`, {
          method: 'PUT',
          body: JSON.stringify(
            normalizeProductInventoryPayload(sourceProduct, update.remainingStock),
          ),
        })
      }),
    )

    return {
      orderResponse,
      inventoryUpdates,
      lowStockProducts,
      minimumStockThreshold,
      adminLowStockEmailSent,
    }
  },
)

export const fetchUserOrders = createAsyncThunk(
  'orders/fetchUserOrders',
  async (userId) => {
    return apiRequest(`/orders/get/userorders/${userId}`)
  },
)

const ordersSlice = createSlice({
  name: 'orders',
  initialState: {
    items: [],
    loading: false,
    creating: false,
    error: null,
    successMessage: null,
    lowStockAlerts: [],
    minimumStockThreshold: getLowStockThreshold(),
  },
  reducers: {
    clearOrderState(state) {
      state.error = null
      state.successMessage = null
      state.lowStockAlerts = []
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserOrders.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchUserOrders.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload
      })
      .addCase(fetchUserOrders.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
      .addCase(createOrder.pending, (state) => {
        state.creating = true
        state.error = null
        state.successMessage = null
        state.lowStockAlerts = []
      })
      .addCase(createOrder.fulfilled, (state, action) => {
        state.creating = false
        state.successMessage = toOrderSuccessMessage(action.payload)
      })
      .addCase(createOrderWithInventorySync.pending, (state) => {
        state.creating = true
        state.error = null
        state.successMessage = null
        state.lowStockAlerts = []
      })
      .addCase(createOrderWithInventorySync.fulfilled, (state, action) => {
        state.creating = false
        state.minimumStockThreshold = Number(
          action.payload?.minimumStockThreshold || getLowStockThreshold(),
        )
        const orderMessage = toOrderSuccessMessage(action.payload?.orderResponse)
        const lowStockAlerts = Array.isArray(action.payload?.lowStockProducts)
          ? action.payload.lowStockProducts
          : []
        const adminLowStockEmailSent = Boolean(action.payload?.adminLowStockEmailSent)
        state.lowStockAlerts = lowStockAlerts

        if (!lowStockAlerts.length) {
          state.successMessage = orderMessage
          return
        }

        const alertSummary = lowStockAlerts
          .map((item) => `${item.productName} (${item.remainingStock} left)`)
          .join(', ')
        const adminNotificationMessage = adminLowStockEmailSent
          ? 'Admin was notified by email.'
          : 'Admin email notification could not be confirmed.'
        state.successMessage = `${orderMessage} Low stock alert: ${alertSummary}. ${adminNotificationMessage}`
      })
      .addCase(createOrder.rejected, (state, action) => {
        state.creating = false
        state.error = action.error.message
      })
      .addCase(createOrderWithInventorySync.rejected, (state, action) => {
        state.creating = false
        state.error = action.error.message
      })
      .addCase(deleteOrderAdmin.fulfilled, (state, action) => {
        state.items = state.items.filter((order) => {
          const orderId = order?.id || order?._id
          return orderId !== action.payload
        })
      })
  },
})

export const { clearOrderState } = ordersSlice.actions
export default ordersSlice.reducer