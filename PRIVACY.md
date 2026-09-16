# Privacy

**Your file never leaves the browser tab.** This page explains how that is
enforced, and how you can check it yourself rather than taking our word for it.

## What happens to your file

1. You choose a file. The browser hands it to the page as bytes.
2. Those bytes go straight into a Web Worker, which parses the workbook.
3. The worker sends back only metadata — sheet names, column headers, detection
   scores, and a small sample of rows for the preview.
4. When you export, the worker builds a new file and hands back the finished
   blob, which your browser saves directly to disk.

At no point is there a server involved. There is no server to involve — this is
a static page on GitHub Pages.

## What we do not do

- No upload, no API, no backend
- No analytics, telemetry, error reporting or crash reporting
- No cookies, no tracking, no fingerprinting
- No third-party scripts, fonts or CDN requests at runtime
- No storing of file contents anywhere, including browser storage

The only thing written to browser storage is your interface language, under the
key `data-redacted:lang`. Nothing else, ever.

## How it is enforced

**Content Security Policy.** The page ships a CSP that restricts every resource
to its own origin:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'
```

**A build-time guard.** `scripts/check-no-network.mjs` fails CI if any source
file gains a `fetch`, an `XMLHttpRequest`, a `sendBeacon`, a WebSocket, a remote
URL, or a known analytics package. A future pull request cannot quietly break
the promise this tool is built on.

**An offline service worker.** The app precaches itself, so it runs with the
network physically disconnected.

## Two honest caveats

We would rather tell you these than have you find them.

**1. The CSP is a `<meta>` tag, not an HTTP header.** GitHub Pages cannot set
response headers. A meta CSP is real and enforced by the browser, but a few
directives — notably `frame-ancestors` and `report-uri` — are ignored in that
form. Self-hosting behind a server that sets real headers would be strictly
stronger.

**2. `style-src` allows `'unsafe-inline'`.** The animation library behind the
interface writes inline `style` attributes on every frame, so the alternative is
no animation at all. The risk this normally carries is CSS-based exfiltration,
which needs somewhere to send data — and `img-src` and `connect-src` are both
locked to `'self'`, so there is nowhere for it to go.

`connect-src` is `'self'` rather than `'none'` because `'none'` would stop the
service worker precaching its own files. On a static host with no write
endpoint, `'self'` still means there is no third party to send anything to.

## Check it yourself

You do not have to trust any of the above.

**Watch the network.** Open DevTools, go to the Network tab, and redact a file.
After the initial page load, you will see no requests at all.

**Cut the connection.** Load the page, turn off your wifi or pull the cable,
then redact a file. It works. A tool that uploads your data cannot do that.

**Read the source.** It is MIT licensed and the whole thing is in this
repository. The redaction engine lives in `src/lib/redact/`, the worker in
`src/workers/`, and the guard that keeps it honest in `scripts/`.

## What this tool does not protect you from

Redaction is only as good as the columns you select. The tool suggests columns
by matching patterns, and it will miss things — personal data hidden in a free
text field it did not sample, an unusual identifier format, a column labelled in
a way it does not recognise. **Review every column yourself.** You are
responsible for what ends up in the file you share.

If you choose "the whole workbook, unpicked sheets unchanged", sheets you did
not review are copied across exactly as they are. The interface names them
before you export. Take that warning seriously.
