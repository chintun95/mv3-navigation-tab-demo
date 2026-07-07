# MV3 Navigation Tab Learning Demo

This is a small Chrome Manifest V3 extension built from scratch. It replaces the New Tab page with a simple navigation tab whose title comes from a free hosted server.

The goal is not to build a fancy dashboard. The goal is to learn the moving parts of MV3 by watching them talk to each other.

## What You Will Learn

- `manifest.json` is the extension entry point.
- `chrome_url_overrides.newtab` replaces Chrome's New Tab page.
- A service worker coordinates background work in MV3.
- A content script runs on a normal webpage and messages the service worker.
- A second content script can run on all HTTP/HTTPS pages, read highlighted text, and send it through the service worker.
- `chrome.storage.local` keeps state when the service worker goes idle.
- Static Declarative Net Request rules can redirect matching network requests without a blocking JavaScript listener.
- Popup, options, and side panel pages are extension-owned pages that can also talk to the service worker.

## Project Map

```text
mv3-navigation-tab-demo/
  package.json
  README.md
  server/
    server.js
  scripts/
    configure-remote.js
  render.yaml
  extension/
    manifest.json
    service-worker.js
    rules/static-rules.json
    content/admin-content.js
    content/selection-content.js
    newtab/newtab.html
    popup/popup.html
    options/options.html
    sidepanel/sidepanel.html
```

## Step 1: Deploy the Server for Free

This demo is set up for Render's free web service tier. Render gives you a public HTTPS URL for a small Node web service. Free services are good for demos, but they can sleep after inactivity and take a little while to wake up.

1. Put this `mv3-navigation-tab-demo` folder in a GitHub repository.
2. Sign in to Render.
3. Create a new **Web Service** from that repository.
4. Use these settings:

```text
Name: mv3-navigation-title-server
Runtime: Node
Build Command: npm install
Start Command: npm run serve
Instance Type: Free
```

If Render detects `render.yaml`, it can prefill these settings from the blueprint.

After deploy, Render will give you a URL like:

```text
https://mv3-navigation-title-server.onrender.com
```

For the examples below, replace this placeholder with your actual URL:

```text
REMOTE_SERVER_URL=https://mv3-navigation-tab-demo.onrender.com
```

## Step 2: Configure the Extension for Your Hosted URL

Chrome MV3 static rules and content-script match patterns are declared in the extension package. That means the extension must know the hosted server URL before you load it.

Run this from the demo folder:

```powershell
npm run configure-remote -- https://mv3-navigation-title-server.onrender.com
```

This updates:

- `extension/manifest.json`
- `extension/rules/static-rules.json`
- The admin-page links in the extension UI

## Optional: Test the Server Locally First

You can still test the server on your machine before deploying:

```powershell
npm run serve
```

Then open:

```text
http://127.0.0.1:8790/admin
```

This local test is only for debugging the server. For the real remote demo, use your Render URL and run `npm run configure-remote`.

## Step 3: Load the Extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this folder:

```text
E:\Research\MV3extension\mv3-navigation-tab-demo\extension
```

If you run `npm run configure-remote` again later, reload the unpacked extension from `chrome://extensions`.

## Step 4: Open a New Tab

Chrome should show the custom navigation tab instead of the default New Tab page.

The new tab page sends this message:

```js
{ type: "TITLE_GET" }
```

The service worker receives it and always fetches the fake remote URL before responding. This means every newly opened tab asks the hosted server for the newest JSON title. The result is also saved to `chrome.storage.local` as a fallback for server errors.

## Step 5: Watch the Static Rule Work

The service worker fetches:

```text
http://remote-title.example/api/title
```

The extension never needs that fake host to exist. The static DNR rule in `extension/rules/static-rules.json` redirects the request to:

```text
https://mv3-navigation-title-server.onrender.com/api/title
```

The important lesson: MV3 request changes are declared up front in rules, not decided request-by-request in a persistent background page.

## Step 6: Change the Title

Keep a new tab open. In another tab, open:

```text
https://mv3-navigation-title-server.onrender.com/admin
```

Submit a new title. The content script on the admin page will:

1. Prevent the normal form submission.
2. Send the new title to `/api/title`.
3. Send this message to the service worker:

```js
{ type: "TITLE_CHANGED_FROM_ADMIN" }
```

The service worker then refreshes the title through the same fake remote URL and broadcasts:

```js
{ type: "TITLE_UPDATED", title }
```

Any open extension page that is listening, including the new tab page, updates immediately.

## Step 7: Highlight Text on Any Page

This lab also injects `content/selection-content.js` on all normal HTTP/HTTPS pages:

```json
"matches": ["http://*/*", "https://*/*"]
```

When you highlight text, that content script sends:

```js
{
  type: "SELECTION_CAPTURED",
  selectedText,
  pageUrl,
  pageTitle,
  selectedAt
}
```

The service worker receives that message and posts the data to:

```text
https://mv3-navigation-tab-demo.onrender.com/api/selections
```

The server appends the latest selections to:

```text
server/data/selection-log.json
```

Each saved entry includes the selected text, source page metadata, delivery path, and the request headers received by the server.

You can inspect the current hosted selection log at:

```text
https://mv3-navigation-tab-demo.onrender.com/api/selections
```

For comparison, the same content script also tries a direct browser fetch to:

```text
https://mv3-navigation-tab-demo.onrender.com/api/direct-selections
```

That direct path writes to:

```text
server/data/direct-selection-log.json
```

This separate log also stores request headers so you can compare direct content-script fetch headers with service-worker fetch headers.

You can inspect it at:

```text
https://mv3-navigation-tab-demo.onrender.com/api/direct-selections
```

The server intentionally rejects normal cross-site webpage origins for selection capture. After this experiment, a direct content-script fetch from a page like Wikipedia should fail CORS/preflight because its `Origin` is `https://en.wikipedia.org`. The service-worker path should still work because its `Origin` is `chrome-extension://...`.

Because this content script matches all HTTP/HTTPS pages, Chrome will warn that the extension can read and change data on websites. That is expected for this lab feature. Do not ship this behavior publicly without clear consent, a privacy policy, and a narrower purpose.

## Step 8: Inspect the Service Worker

In `chrome://extensions`, find **MV3 Navigation Tab Learning Demo** and click **service worker**.

Look for log messages like:

```text
[service-worker] New tab opened. Fetching the newest hosted title.
[service-worker] Fetching fake remote URL. Static DNR should redirect it.
[service-worker] Static DNR rule matched.
[service-worker] Content script reported an admin title change.
[service-worker] Content script captured highlighted text.
```

## Why Storage Matters

MV3 service workers are event-driven. Chrome can stop them when they are idle. That means you should not rely on global variables for important state.

This demo stores the latest title in `chrome.storage.local` so the service worker can show a fallback title if the hosted server is sleeping or temporarily unavailable. Normal new-tab loads still fetch the newest server value first.

## Message Contracts

New tab to service worker:

```js
{ type: "TITLE_GET" }
```

Admin content script to service worker:

```js
{ type: "TITLE_CHANGED_FROM_ADMIN" }
```

Service worker to extension pages:

```js
{ type: "TITLE_UPDATED", title, updatedAt, source, ok, error }
```

Selection content script to service worker:

```js
{ type: "SELECTION_CAPTURED", selectedText, pageUrl, pageTitle, selectedAt }
```

## Manual Smoke Test

1. Deploy the server to Render.
2. Run `npm run configure-remote -- YOUR_RENDER_URL`.
3. Load or reload the unpacked extension.
4. Open a new tab.
5. Open `YOUR_RENDER_URL/admin`.
6. Submit `Research Dashboard`.
7. Confirm the open new tab changes to `Research Dashboard`.
8. Open a second new tab and confirm it fetches `Research Dashboard` from the hosted server during page load.
9. Highlight text on any normal webpage.
10. Open `YOUR_RENDER_URL/api/selections` and confirm the selected text appears in the service-worker JSON log.
11. Open `YOUR_RENDER_URL/api/direct-selections` and confirm whether the same text appears in the direct content-script JSON log.

If the title does not update, inspect the service worker logs first. Most beginner MV3 issues are visible there.
