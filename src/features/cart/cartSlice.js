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

      if (existing) {
        existing.quantity += quantity
      } else {
        state.items.push({
          product: {
            id: productId,
            name: product.name,
            price: product.price,
            image: product.image,
            countInStock: product.countInStock,
          },
          quantity,
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
        target.quantity = quantity
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