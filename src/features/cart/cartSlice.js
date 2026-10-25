import { createSlice } from '@reduxjs/toolkit'
import { getSelectedDatabaseName } from '../../api/client'
import { cartLineKey } from '../../utils/delivery'
import { getPrimaryProductImage } from '../../utils/format'

function getCartKey() {
  const db = getSelectedDatabaseName()
  return `shopCartItems_${db}`
}

function getInitialItems() {
  const raw = localStorage.getItem(getCartKey())
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveItems(items) {
  localStorage.setItem(getCartKey(), JSON.stringify(items))
}

function getCompletedCheckouts() {
  const raw = localStorage.getItem(`${getCartKey()}_completedDeliveryCheckouts`)
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function clampQuantity(quantity, countInStock) {
  const normalizedQuantity = Number(quantity || 1)
  const stock = Number(countInStock || 0)

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity < 1) {
    return 1
  }

  if (stock > 0) {
    return Math.min(Math.trunc(normalizedQuantity), stock)
  }

  return Math.trunc(normalizedQuantity)
}

const cartSlice = createSlice({
  name: 'cart',
  initialState: {
    items: getInitialItems(),
    completedDeliveryCheckouts: getCompletedCheckouts(),
  },
  reducers: {
    addToCart(state, action) {
      const { product, quantity } = action.payload
      const productId = product.id || product._id
      const cartKey = product.storefrontId ? `${product.storefrontId}:${productId}` : productId
      const existing = state.items.find((item) => cartLineKey(item.product) === cartKey)
      const nextQuantity = clampQuantity(quantity, product.countInStock)

      if (existing) {
        existing.quantity = clampQuantity(
          existing.quantity + nextQuantity,
          existing.product.countInStock,
        )
      } else {
        state.items.push({
          product: {
            id: productId,
            cartKey,
            storefrontId: product.storefrontId || null,
            storefrontName: product.storefrontName || '',
            name: product.name,
            price: product.price,
            image: getPrimaryProductImage(product, ''),
            countInStock: product.countInStock,
          },
          quantity: nextQuantity,
        })
      }

      saveItems(state.items)
    },
    removeFromCart(state, action) {
      state.items = state.items.filter(
        (item) => cartLineKey(item.product) !== action.payload,
      )
      saveItems(state.items)
    },
    updateCartQuantity(state, action) {
      const { productId, quantity } = action.payload
      const target = state.items.find((item) => cartLineKey(item.product) === productId)
      if (target) {
        target.quantity = clampQuantity(quantity, target.product.countInStock)
      }
      saveItems(state.items)
    },
    clearCart(state) {
      state.items = []
      saveItems(state.items)
    },
    completeDeliveryCheckout(state, action) {
      const { id, cart } = action.payload
      if (state.completedDeliveryCheckouts?.includes(id)) return
      state.items = state.items.flatMap((item) => {
        const line = cart.find((entry) => entry.key === cartLineKey(item.product))
        const quantity = item.quantity - (line?.quantity || 0)
        return quantity > 0 ? [{ ...item, quantity }] : []
      })
      state.completedDeliveryCheckouts = [...(state.completedDeliveryCheckouts || []), id]
      saveItems(state.items)
      localStorage.setItem(`${getCartKey()}_completedDeliveryCheckouts`, JSON.stringify(state.completedDeliveryCheckouts))
    },
    switchDatabase(state) {
      // Reload cart items for the newly selected database
      state.items = getInitialItems()
      state.completedDeliveryCheckouts = getCompletedCheckouts()
    },
  },
})

export const { addToCart, removeFromCart, updateCartQuantity, clearCart, completeDeliveryCheckout, switchDatabase } =
  cartSlice.actions
export default cartSlice.reducer