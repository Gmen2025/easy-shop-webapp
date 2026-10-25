import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeInitials, normalizeStoreLogo } from '../src/utils/storeLogo.js'
import { companyPayload } from '../src/utils/adminOperations.js'

test('store initials come from the registered name, including non-Latin and single-word names', () => {
  for (const [name, initials] of [['Bole Market', 'BM'], ['Addu Genet Easy Shop', 'AS'], ['  Sunshine  ', 'S'],
    ['ሐበሻ ገበያ', 'ሐገ'], ['Fresh-Food Market', 'FM'], ['', 'ST'], [null, 'ST']]) {
    assert.equal(storeInitials(name), initials)
  }
})

test('company store logos can be added, changed or explicitly removed without affecting driver forms', () => {
  const form = { name: 'Bole Market', email: 'store@example.test', phone: '123', address: 'Bole', latitude: '', longitude: '' }
  const createForm = { ...form, password: 'password', address1: 'Bole', city: 'Addis', latitude: '9', longitude: '38' }
  assert.equal(companyPayload({ ...createForm, logo: '' }).logo, '')
  assert.equal(companyPayload({ ...createForm, logo: 'https://example.test/logo.png' }).logo, 'https://example.test/logo.png')
  assert.equal('logo' in companyPayload(form, { editing: true }), false)
  assert.equal(companyPayload({ ...form, logo: '' }, { editing: true }).logo, '')
  assert.equal(companyPayload({ ...form, logo: ' https://example.test/logo.png ' }, { editing: true }).logo, 'https://example.test/logo.png')
  assert.equal('logo' in companyPayload({ ...form, logo: 'invalid' }, { driver: true, editing: true }), false)
  for (const value of ['invalid', 'http://example.test/logo.png', 'data:image/png;base64,abc', 'https://example.test/a b',
    'https://user:pass@example.test/logo.png', `https://example.test/${'a'.repeat(500)}`]) {
    assert.throws(() => normalizeStoreLogo(value), /HTTPS/)
  }
})

test('logo fields render optional upload/removal and uploads use store-specific signed storage', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const originalFetch = globalThis.fetch
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  globalThis.localStorage = { getItem: () => null }
  const cacheDir = await mkdtemp(join(tmpdir(), 'store-logo-test-'))
  const server = await createServer({ cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const { default: StoreLogo } = await server.ssrLoadModule('/src/components/StoreLogo.jsx')
    const { default: Field } = await server.ssrLoadModule('/src/components/StoreLogoField.jsx')
    const fallback = renderToStaticMarkup(createElement(StoreLogo, { name: 'Bole Market', logo: '' }))
    assert.match(fallback, />BM<\/div>/)
    assert.match(fallback, /aria-label="Bole Market initials"/)
    const image = renderToStaticMarkup(createElement(StoreLogo, { name: 'Bole Market', logo: 'https://example.test/logo.png' }))
    assert.match(image, /alt="Bole Market logo"/)
    assert.match(image, /src="https:\/\/example.test\/logo.png"/)
    const field = renderToStaticMarkup(createElement(Field, { name: 'Bole Market', value: 'https://example.test/logo.png',
      onChange: () => {}, onBusyChange: () => {} }))
    assert.match(field, /type="file"/)
    assert.match(field, /Logo image URL \(optional\)/)
    assert.match(field, /Remove logo \/ use initials/)
    assert.doesNotMatch(field, /required=""/)
    const { uploadStoreLogo, uploadProductImage } = await server.ssrLoadModule('/src/api/uploads.js')
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify(String(url).includes('/cloudinary/sign')
        ? { api_key: 'test-key', timestamp: 123, signature: 'test-signature', cloud_name: 'test-cloud' }
        : { secure_url: 'https://example.test/uploaded.png' }), { headers: { 'Content-Type': 'application/json' } })
    }
    const file = new File(['image'], 'logo.png', { type: 'image/png' })
    assert.equal(await uploadStoreLogo(file), 'https://example.test/uploaded.png')
    assert.deepEqual(JSON.parse(calls[0].options.body), { folder: 'eshop/stores' })
    assert.equal(calls[1].options.body.get('folder'), 'eshop/stores')
    assert.equal(calls[1].options.body.get('file').name, 'logo.png')
    assert.equal(calls[1].options.body.get('signature'), 'test-signature')
    await assert.rejects(uploadStoreLogo(new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })), /JPEG, PNG or WebP/)
    await assert.rejects(uploadStoreLogo({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), /5 MB/)
    assert.equal(calls.length, 2)
    await uploadProductImage(file)
    assert.deepEqual(JSON.parse(calls[2].options.body), { folder: 'eshop/products' })
    assert.equal(calls[3].options.body.get('folder'), 'eshop/products')
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Cloudinary not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } })
    await assert.rejects(uploadStoreLogo(file), /Cloudinary not configured/)
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
