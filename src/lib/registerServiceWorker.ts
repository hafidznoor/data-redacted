/**
 * Registers the offline service worker in production only.
 *
 * In dev it would cache Vite's module graph and fight HMR. The registration
 * path is derived from the app's base so it works under a project-page URL.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // Offline support is a bonus, not a requirement. A failed registration
      // (private window, unsupported browser) must not break the tool.
    })
  })
}
