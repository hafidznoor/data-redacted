#!/usr/bin/env node
/**
 * Privacy guard.
 *
 * The whole product rests on one claim: nothing leaves the tab. That claim is easy
 * to break by accident — an analytics snippet, a Google Font, a "quick" error
 * reporter in a well-meaning PR. This fails the build when source code gains the
 * ability to talk to anything but itself.
 *
 * Scans src/ only. Config files legitimately reference URLs (the SheetJS tarball
 * in package.json is a build-time dependency fetch, not a runtime call).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = 'src'
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html'])

const RULES = [
  { re: /\bfetch\s*\(/g, msg: 'fetch() call' },
  { re: /\bXMLHttpRequest\b/g, msg: 'XMLHttpRequest' },
  { re: /\bnavigator\s*\.\s*sendBeacon\b/g, msg: 'navigator.sendBeacon' },
  { re: /\bnew\s+WebSocket\b/g, msg: 'WebSocket' },
  { re: /\bnew\s+EventSource\b/g, msg: 'EventSource' },
  // Captures the path too, so namespace URLs can be told apart from endpoints.
  { re: /https?:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+(?:\/[\w./-]*)?/g, msg: 'remote URL' },
  // Matched as domains and package names, not bare words. An earlier version
  // keyed on 'plausible' and fired on the English word in a code comment —
  // a guard that cries wolf on prose is a guard someone eventually deletes.
  { re: /googletagmanager|google-analytics|plausible\.io|posthog[-.]|@sentry\/|sentry\.io|mixpanel[-.]|segment\.com|amplitude[-.]js|heap\.io|\bgtag\s*\(/gi, msg: 'analytics/telemetry' },
  { re: /fonts\.(googleapis|gstatic)\.com/g, msg: 'Google Fonts' },
]

// Lines carrying this marker are reviewed exceptions — e.g. a URL that only ever
// appears in human-readable copy, never in a request.
const ALLOW = /privacy-guard-ok/

/**
 * XML namespace identifiers. These look like URLs and are never fetched by
 * anything — they are just globally unique names for a vocabulary. Every inline
 * SVG in the codebase carries one, so without this the guard is pure noise.
 */
const NAMESPACE_URLS = /^https?:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|1999\/xhtml|XML\/1998)/

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (EXTS.has(extname(p))) out.push(p)
  }
  return out
}

const violations = []
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (ALLOW.test(line)) return
    for (const { re, msg } of RULES) {
      re.lastIndex = 0
      const m = re.exec(line)
      if (!m) continue
      if (msg === 'remote URL' && NAMESPACE_URLS.test(m[0])) continue
      violations.push(`${file}:${i + 1}  ${msg} → ${m[0]}`)
    }
  })
}

if (violations.length) {
  console.error('\n✗ Privacy guard failed. This app must not talk to the network.\n')
  for (const v of violations) console.error('  ' + v)
  console.error('\nIf one of these is genuinely safe, add a `privacy-guard-ok` comment on that line.\n')
  process.exit(1)
}
console.log('✓ Privacy guard passed — no network calls in src/')
