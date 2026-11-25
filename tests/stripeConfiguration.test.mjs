import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('website card forms use the backend mode and reject mismatched keys', async () => {
  const { createServer } = await import('vite')
  const cacheDir = await mkdtemp(join(tmpdir(), 'stripe-config-'))
  const modules = {
    'virtual:stripe-react': `
      let cursor = 0, values = [], effects = []
      const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i])
      export function reset() { cursor = 0 }
      export async function flush() { while (effects.length) effects.shift()(); await new Promise(resolve => setImmediate(resolve)) }
      export function useState(initial) {
        const i = cursor++; if (!(i in values)) values[i] = initial
        return [values[i], value => { values[i] = value }]
      }
      export function useMemo(factory, deps) {
        const i = cursor++
        if (!values[i] || changed(values[i].deps, deps)) values[i] = { deps, value: factory() }
        return values[i].value
      }
      export function useEffect(effect, deps) {
        const i = cursor++
        if (!values[i] || changed(values[i].deps, deps)) {
          if (values[i]?.cleanup) values[i].cleanup()
          values[i] = { deps }
          effects.push(() => { values[i].cleanup = effect() })
        }
      }`,
    'virtual:stripe-api': `
      let fixture = {}, database = 'E_ShopUSA'
      export function configure(value, db) { fixture = value; database = db }
      export function getSelectedDatabaseName() { return database }
      export async function apiRequest(path) { if (!['/stripe/config', '/stripe/mode'].includes(path)) throw new Error('Unexpected request'); return fixture }`,
    'virtual:stripe-sdk': `export function loadStripe(key) { return { key } }`,
  }
  const server = await createServer({
    configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'stripe-configuration-fixture',
      enforce: 'pre',
      resolveId(id) { if (id in modules) return `\0${id}` },
      load(id) { if (id.startsWith('\0virtual:')) return modules[id.slice(1)] },
      transform(code, id) {
        if (!id.endsWith('/useStripeConfiguration.js')) return
        return code.replace("from 'react'", "from 'virtual:stripe-react'")
          .replace("from '@stripe/stripe-js'", "from 'virtual:stripe-sdk'")
          .replace("from '../../api/client'", "from 'virtual:stripe-api'")
      },
    }],
  })
  try {
    const hooks = await server.ssrLoadModule('virtual:stripe-react')
    const api = await server.ssrLoadModule('virtual:stripe-api')
    const { default: useConfig } = await server.ssrLoadModule('/src/features/payment/useStripeConfiguration.js')
    const render = (enabled = true, explicitKey = '') => { hooks.reset(); return useConfig(explicitKey, enabled) }
    for (const [mode, key] of [['test', 'pk_test_fixture'], ['live', 'pk_live_fixture']]) {
      api.configure({ mode, publishableKey: key }, `db_${mode}`)
      assert.equal(render().stripe, null)
      await hooks.flush()
      assert.equal(render().stripe.key, key)
    }
    api.configure({ mode: 'test', publishableKey: 'pk_live_fixture' }, 'db_invalid')
    assert.equal(render().stripe, null)
    await hooks.flush()
    assert.match(render().error, /invalid card payment configuration/)
    assert.equal(render().stripe, null)
    api.configure({ mode: 'test' }, 'db_saved')
    assert.equal(render(true, 'pk_live_saved').stripe, null)
    await hooks.flush()
    assert.match(render(true, 'pk_live_saved').error, /does not match/)
    assert.equal(render(true, 'pk_live_saved').stripe, null)
    assert.equal(render(true, 'pk_test_saved').stripe, null)
    await hooks.flush()
    assert.equal(render(true, 'pk_test_saved').stripe.key, 'pk_test_saved')
  } finally {
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
  }
})
