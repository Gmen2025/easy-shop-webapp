import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('website forms retain visible, associated labels and address control grouping', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter } = await import('react-router-dom')
  const { Provider } = await import('react-redux')
  const { configureStore } = await import('@reduxjs/toolkit')
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: () => null, setItem: () => {} },
  })
  const cacheDir = await mkdtemp(join(tmpdir(), 'website-form-test-'))
  const server = await createServer({
    cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
  })
  try {
    const store = configureStore({ reducer: {
      auth: () => ({ user: { id: 'customer', name: 'Test Customer' }, loading: false }),
      account: () => ({ socialProviders: null }),
      products: () => ({ items: [], loading: false }),
      categories: () => ({ items: [] }),
    } })
    const render = async (path, props = {}) => {
      const { default: Component } = await server.ssrLoadModule(path)
      return renderToStaticMarkup(createElement(Provider, { store },
        createElement(MemoryRouter, null, createElement(Component, props))))
    }
    const hasField = (markup, text, control) => {
      assert.match(markup, new RegExp(`<label[^>]*>\\s*${text}(?:(?!</label>)[\\s\\S])*?<${control}\\b`))
    }
    const login = await render('/src/pages/LoginPage.jsx')
    hasField(login, 'Store', 'select')
    hasField(login, 'Email', 'input')
    hasField(login, 'Password', 'input')
    const register = await render('/src/pages/RegisterPage.jsx')
    for (const label of ['Full Name', 'Email', 'Password', 'Phone']) hasField(register, label, 'input')
    const profile = await render('/src/pages/EditProfilePage.jsx')
    for (const label of ['Customer Name', 'Email', 'Phone', 'Address Line 1', 'City']) {
      hasField(profile, label, 'input')
    }
    hasField(profile, 'Country', 'select')
    const catalog = await render('/src/pages/HomePage.jsx')
    assert.match(catalog, /<label class="catalog-search"><span class="catalog-search-label">Search products<\/span>/)
    assert.match(catalog, /<input type="search"/)
    assert.match(catalog, /class="catalog-search-control"/)
    const bank = await render('/src/components/BankTransferCheckout.jsx', { amount: 25 })
    hasField(bank, 'Bank', 'select')
    hasField(bank, 'Transfer Reference / Receipt Number', 'input')
    hasField(bank, 'Sender Name', 'input')
    const telebirr = await render('/src/components/TelebirrCheckout.jsx', { amount: 25 })
    hasField(telebirr, 'Full Name', 'input')
    hasField(telebirr, 'Phone Number', 'input')
    const address = await render('/src/components/AddressAutocomplete.jsx', {
      label: 'Pickup location', value: '', country: 'Ethiopia', onChange: () => {}, onSelect: () => {},
    })
    assert.match(address, /class="address-autocomplete form-field"/)
    const id = address.match(/<label for="([^"]+)">Pickup location<\/label>/)?.[1]
    assert.ok(id, 'Address has a visible, explicitly associated label')
    assert.ok(address.includes(`id="${id}"`))
    assert.match(address, /class="address-input-control"><input[^>]*role="combobox"/)
    assert.match(address, /aria-describedby="[^"]+-status"/)
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
