import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { productRating, productReviewCount, selectCatalogProducts } from '../src/utils/catalogPricing.js'

test('verified product feedback overrides legacy manual ratings in cards and filtering', () => {
  const verified = { name: 'Coffee', rating: 1, numReviews: 99, verifiedRating: 4.5, verifiedReviewCount: 2 }
  assert.equal(productRating(verified), 4.5)
  assert.equal(productReviewCount(verified), 2)
  assert.equal(selectCatalogProducts([verified], { categoryId: '', searchQuery: '',
    filters: { minPrice: '', maxPrice: '', brand: 'all', minRating: '4', sortBy: 'ratingDesc' } }, false).length, 1)
})

test('review API, photo uploads and participant rendering preserve switch and privacy requirements', async () => {
  const { createServer } = await import('vite')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const originalFetch = globalThis.fetch
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  globalThis.localStorage = { getItem: (key) => key === 'selectedDatabaseName' ? 'E_ShopUSA' : 'test-token' }
  const cacheDir = await mkdtemp(join(tmpdir(), 'review-test-'))
  const server = await createServer({ cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  try {
    const helpers = await server.ssrLoadModule('/src/api/reviews.js')
    assert.equal(helpers.reviewQuery('product', 'order a', 'coffee/one'), 'context?kind=product&transaction=order+a&product=coffee%2Fone')
    const calls = []
    let malformed = false
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      const data = url.endsWith('/reviews/settings') ? malformed ? {} : { products: true, deliveries: false, rides: true, services: false } :
        url.includes('/cloudinary/sign') ? { api_key: 'test', timestamp: 1, signature: 'test', cloud_name: 'test' } :
          { secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg' }
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
    }
    assert.equal((await helpers.reviewRequest('settings')).rides, true)
    assert.equal(calls[0].options.headers['x-database-name'], 'E_ShopUSA')
    malformed = true
    await assert.rejects(helpers.reviewRequest('settings'), /could not be verified/)
    const { uploadCustomerPhoto } = await server.ssrLoadModule('/src/api/uploads.js')
    await uploadCustomerPhoto(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }))
    assert.deepEqual(JSON.parse(calls.at(-2).options.body), { folder: 'customer_profiles' })
    assert.equal(calls.at(-1).options.body.get('folder'), 'customer_profiles')
    assert.throws(() => uploadCustomerPhoto(new File(['photo'], 'photo.svg', { type: 'image/svg+xml' })), /JPEG, PNG or WebP/)
    assert.throws(() => uploadCustomerPhoto({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }), /5 MB/)
    const { default: Profile } = await server.ssrLoadModule('/src/components/RideParticipantProfile.jsx')
    const profile = { name: 'Driver', joinedAt: '2025-01-01', profilePhotoUrl: '', vehicleMake: 'Toyota',
      vehicleModel: 'Corolla', vehicleColor: 'Blue', vehicleType: 'car', plateNumber: 'ABC123',
      rating: { average: 4.5, count: 2 }, reviews: [{ _id: 'one', rating: 5, comment: '<script>private</script>' }] }
    const render = (rides) => renderToStaticMarkup(createElement(helpers.ReviewAvailabilityContext.Provider,
      { value: { settings: { rides } } }, createElement(Profile, { profile, driver: true })))
    const enabled = render(true)
    assert.match(enabled, /4.5\/5 \(2 reviews\)/)
    assert.match(enabled, /Toyota Corolla car Blue/)
    assert.match(enabled, /ABC123/)
    assert.match(enabled, /Joined/)
    assert.match(enabled, /&lt;script&gt;/)
    assert.doesNotMatch(render(false), /4.5\/5|private/)
    for (const file of ['ReviewPanel', 'ReviewAvailabilityProvider', 'RideCustomerPhoto']) {
      assert.equal(typeof (await server.ssrLoadModule(`/src/components/${file}.jsx`)).default, 'function')
    }
    assert.equal(typeof (await server.ssrLoadModule('/src/pages/ReviewSettingsPage.jsx')).default, 'function')
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
