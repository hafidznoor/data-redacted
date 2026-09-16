import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

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
  base: '/data-redacted/',
  plugins: [react(), tailwindcss(), cspPlugin(), spaFallbackPlugin()],
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
