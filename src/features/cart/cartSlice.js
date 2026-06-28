import { createSlice } from '@reduxjs/toolkit'
import { getSelectedDatabaseName } from '../../api/client'

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
  },
  reducers: {
    addToCart(state, action) {
      const { product, quantity } = action.payload
      const productId = product.id || product._id
      const existing = state.items.find((item) => item.product.id === productId)
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
            name: product.name,
            price: product.price,
            image: product.image,
            countInStock: product.countInStock,
          },
          quantity: nextQuantity,
        })
      }

      saveItems(state.items)
    },
    removeFromCart(state, action) {
      state.items = state.items.filter(
        (item) => item.product.id !== action.payload,
      )
      saveItems(state.items)
    },
    updateCartQuantity(state, action) {
      const { productId, quantity } = action.payload
      const target = state.items.find((item) => item.product.id === productId)
      if (target) {
        target.quantity = clampQuantity(quantity, target.product.countInStock)
      }
      saveItems(state.items)
    },
    clearCart(state) {
      state.items = []
      saveItems(state.items)
    },
    switchDatabase(state) {
      // Reload cart items for the newly selected database
      state.items = getInitialItems()
    },
  },
})

export const { addToCart, removeFromCart, updateCartQuantity, clearCart, switchDatabase } =
  cartSlice.actions
export default cartSlice.reducer