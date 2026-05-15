import { createSlice } from '@reduxjs/toolkit'

const CART_KEY = 'shopCartItems'

function getInitialItems() {
  const raw = localStorage.getItem(CART_KEY)
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
  localStorage.setItem(CART_KEY, JSON.stringify(items))
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
  },
})

export const { addToCart, removeFromCart, updateCartQuantity, clearCart } =
  cartSlice.actions
export default cartSlice.reducer