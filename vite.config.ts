import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const BASE = '/data-redacted/'

/**
 * The CSP is injected at build time only. In dev, Vite needs a websocket back to
 * the dev server for HMR, and a meta CSP in index.html would apply there too and
 * break it. Production is where the guarantee has to hold.
 *
 * Note: `frame-ancestors` and `report-uri` are silently ignored in meta form.
 * GitHub Pages cannot set HTTP headers, so this is as far as CSP goes here.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Motion (every rare-ui component) writes inline style attributes each frame.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // 'none' would block the service worker's own precaching. 'self' is a static
  // host with no write endpoint, so there is still nowhere to exfiltrate to.
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * GitHub Pages serves 404.html for any unmatched path. Copying the *built*
 * index.html there (not the source one, which still points at /src/main.tsx)
 * makes deep links land on the app instead of a GitHub 404.
 */
function spaFallbackPlugin() {
  return {
    name: 'spa-fallback-404',
    apply: 'build' as const,
    closeBundle() {
      const dist = path.resolve(import.meta.dirname, 'dist')
      const index = path.join(dist, 'index.html')
      if (fs.existsSync(index)) fs.copyFileSync(index, path.join(dist, '404.html'))
    },
  }
}

/**
 * Emits a service worker that precaches the built assets.
 *
 * Hand-written rather than Workbox: the whole point of this app is that a
 * sceptical person can read what it does, and ~50 lines they can audit beats a
 * generated bundle they cannot. Being able to pull the network cable and watch
 * the tool keep working is the most convincing privacy demonstration available.
 */
function serviceWorkerPlugin(base: string) {
  return {
    name: 'emit-service-worker',
    apply: 'build' as const,
    closeBundle() {
      const dist = path.resolve(import.meta.dirname, 'dist')
      if (!fs.existsSync(dist)) return

      const assets: string[] = []
      const walk = (dir: string, prefix = '') => {
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry)
          if (fs.statSync(full).isDirectory()) walk(full, `${prefix}${entry}/`)
          else if (entry !== 'sw.js') assets.push(`${prefix}${entry}`)
        }
      }
      walk(dist)

      // The hash changes whenever any asset does, which is what retires the
      // old cache on the next deploy.
      const version = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12)
      const urls = [base, ...assets.map((a) => base + a)]

      const sw = `// Generated at build time. Do not edit.
const CACHE = 'data-redacted-${version}'
const ASSETS = ${JSON.stringify(urls, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Cache-first, same-origin only. A request to any other origin is not something
// this app makes, so it is refused rather than forwarded.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit
      return fetch(request).catch(() => caches.match('${base}'))
    }),
  )
})
`
      fs.writeFileSync(path.join(dist, 'sw.js'), sw)
    },
  }
}

function cspPlugin() {
  return {
    name: 'inject-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), cspPlugin(), spaFallbackPlugin(), serviceWorkerPlugin(BASE)],
  /**
   * One fixed port, and a hard failure if it is already taken. Vite's default is
   * to hop to the next free port, which quietly leaves a second dev server on an
   * address nobody is looking at. strictPort turns that into an error instead.
   */
  server: { port: 3030, strictPort: true },
  preview: { port: 3030, strictPort: true },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    // Vite's modulepreload polyfill is an inline <script>, which would need
    // 'unsafe-inline' in script-src. Modern browsers support it natively.
    modulePreload: { polyfill: false },
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
