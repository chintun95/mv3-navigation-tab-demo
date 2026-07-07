const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URLSearchParams } = require("node:url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8790);
const DISPLAY_HOST = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
const DATA_DIR = path.join(__dirname, "data");
const SELECTION_LOG_PATH = path.join(DATA_DIR, "selection-log.json");
const DIRECT_SELECTION_LOG_PATH = path.join(DATA_DIR, "direct-selection-log.json");
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "https://mv3-navigation-tab-demo.onrender.com";
const LOCAL_DEV_ORIGINS = new Set([
  "http://127.0.0.1:8790",
  "http://localhost:8790"
]);

let currentTitle = "MV3 Navigation Lab";
const titleLog = [
  {
    title: currentTitle,
    at: new Date().toISOString(),
    source: "server-start"
  }
];
let selectionLog = [];
let directSelectionLog = [];

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data, null, 2), {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
}

function sendCorsRejection(res, origin) {
  sendJson(res, 403, {
    ok: false,
    error: "Cross-site webpage origins are rejected for selection capture in this lab.",
    origin: origin || ""
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function renderAdminPage() {
  const rows = titleLog
    .slice(-8)
    .reverse()
    .map((entry) => {
      return `<li><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.source)} at ${escapeHtml(entry.at)}</span></li>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Remote Title Admin</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f6f4ef;
      color: #202124;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px;
    }

    main {
      width: min(720px, 100%);
      background: #fffefa;
      border: 1px solid #ddd7c8;
      border-radius: 8px;
      box-shadow: 0 18px 40px rgba(31, 35, 40, 0.12);
      padding: 28px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: clamp(28px, 5vw, 44px);
      letter-spacing: 0;
    }

    p {
      margin: 0 0 22px;
      color: #5f6368;
      line-height: 1.55;
    }

    label {
      display: block;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .row {
      display: flex;
      gap: 10px;
      align-items: stretch;
    }

    input {
      flex: 1;
      min-width: 0;
      border: 1px solid #b7b7b7;
      border-radius: 6px;
      padding: 12px 14px;
      font: inherit;
    }

    button {
      border: 0;
      border-radius: 6px;
      background: #176b5d;
      color: white;
      font: inherit;
      font-weight: 700;
      padding: 0 16px;
      cursor: pointer;
    }

    button:focus-visible,
    input:focus-visible {
      outline: 3px solid #8ecfc4;
      outline-offset: 2px;
    }

    #status {
      min-height: 24px;
      margin-top: 14px;
      color: #176b5d;
      font-weight: 700;
    }

    section {
      margin-top: 28px;
      border-top: 1px solid #e7e1d2;
      padding-top: 20px;
    }

    ol {
      display: grid;
      gap: 10px;
      padding-left: 22px;
      margin-bottom: 0;
    }

    li span {
      display: block;
      color: #6f7478;
      font-size: 13px;
      margin-top: 2px;
    }

    code {
      background: #ece7da;
      border-radius: 4px;
      padding: 2px 5px;
    }

    @media (max-width: 560px) {
      body {
        padding: 18px;
      }

      main {
        padding: 22px;
      }

      .row {
        flex-direction: column;
      }

      button {
        min-height: 46px;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>Remote Title Admin</h1>
    <p>This hosted page pretends to be the remote server. The extension content script enhances this form, then tells the MV3 service worker that the title changed.</p>

    <form id="title-form" action="/api/title" method="post">
      <label for="title">Navigation tab title</label>
      <div class="row">
        <input id="title" name="title" value="${escapeHtml(currentTitle)}" maxlength="80" autocomplete="off">
        <button type="submit">Update title</button>
      </div>
      <div id="status" role="status" aria-live="polite">Current API value: <code>${escapeHtml(currentTitle)}</code></div>
    </form>

    <section>
      <h2>Recent updates</h2>
      <ol id="title-log">${rows}</ol>
    </section>
  </main>
</body>
</html>`;
}

async function handleTitlePost(req, res) {
  const body = await readBody(req);
  const contentType = req.headers["content-type"] || "";
  let nextTitle = "";

  if (contentType.includes("application/json")) {
    nextTitle = JSON.parse(body || "{}").title || "";
  } else {
    nextTitle = new URLSearchParams(body).get("title") || "";
  }

  nextTitle = nextTitle.trim().slice(0, 80);
  if (!nextTitle) {
    sendJson(res, 400, { ok: false, error: "Title is required." });
    return;
  }

  currentTitle = nextTitle;
  titleLog.push({
    title: currentTitle,
    at: new Date().toISOString(),
    source: "admin-form"
  });

  sendJson(res, 200, {
    ok: true,
    title: currentTitle,
    log: titleLog.slice(-8).reverse()
  });
}

async function handleSelectionPost(req, res) {
  const body = await readBody(req);
  const data = JSON.parse(body || "{}");
  const result = await storeSelection(data, selectionLog, SELECTION_LOG_PATH, req.headers);
  selectionLog = result.log;

  sendJson(res, 200, {
    ok: true,
    saved: result.entry,
    count: selectionLog.length
  });
}

async function handleDirectSelectionPost(req, res) {
  const body = await readBody(req);
  const data = JSON.parse(body || "{}");
  const result = await storeSelection(data, directSelectionLog, DIRECT_SELECTION_LOG_PATH, req.headers);
  directSelectionLog = result.log;

  sendJson(res, 200, {
    ok: true,
    saved: result.entry,
    count: directSelectionLog.length,
    delivery: "content-script-direct"
  });
}

async function storeSelection(data, log, filePath, headers) {
  const selectedText = String(data.selectedText || "").trim().slice(0, 1000);

  if (!selectedText) {
    const error = new Error("selectedText is required.");
    error.status = 400;
    throw error;
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    selectedText,
    pageUrl: String(data.pageUrl || "").slice(0, 2000),
    pageTitle: String(data.pageTitle || "").slice(0, 300),
    delivery: String(data.delivery || "service-worker").slice(0, 80),
    requestHeaders: normalizeHeaders(headers),
    selectedAt: data.selectedAt || new Date().toISOString(),
    storedAt: new Date().toISOString()
  };

  const nextLog = [...log, entry].slice(-200);
  await writeJsonFile(filePath, nextLog);
  return { entry, log: nextLog };
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)])
  );
}

function isSelectionPath(pathname) {
  return pathname === "/api/selections" || pathname === "/api/direct-selections";
}

function isAllowedSelectionOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (origin.startsWith("chrome-extension://")) {
    return true;
  }

  if (origin === PUBLIC_ORIGIN || LOCAL_DEV_ORIGINS.has(origin)) {
    return true;
  }

  return false;
}

function corsHeadersForSelection(origin) {
  if (!origin) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin"
  };
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not read ${filePath}:`, error.message);
    }
    return [];
  }
}

async function writeJsonFile(filePath, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${DISPLAY_HOST}:${PORT}`);

    if (req.method === "OPTIONS" && isSelectionPath(url.pathname)) {
      const origin = req.headers.origin || "";
      if (!isAllowedSelectionOrigin(origin)) {
        sendCorsRejection(res, origin);
        return;
      }

      send(res, 204, "", corsHeadersForSelection(origin));
      return;
    }

    if (req.method === "OPTIONS") {
      send(res, 204, "", {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/admin")) {
      send(res, 200, renderAdminPage(), {
        "Content-Type": "text/html; charset=utf-8"
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/title") {
      sendJson(res, 200, {
        ok: true,
        title: currentTitle,
        updatedAt: titleLog.at(-1).at,
        source: "hosted-title-server"
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/selections") {
      sendJson(res, 200, {
        ok: true,
        count: selectionLog.length,
        selections: selectionLog.slice().reverse()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/direct-selections") {
      sendJson(res, 200, {
        ok: true,
        count: directSelectionLog.length,
        selections: directSelectionLog.slice().reverse()
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/title") {
      await handleTitlePost(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/selections") {
      if (!isAllowedSelectionOrigin(req.headers.origin || "")) {
        sendCorsRejection(res, req.headers.origin);
        return;
      }

      await handleSelectionPost(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/direct-selections") {
      if (!isAllowedSelectionOrigin(req.headers.origin || "")) {
        sendCorsRejection(res, req.headers.origin);
        return;
      }

      await handleDirectSelectionPost(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found." });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: error.message
    });
  }
});

Promise.all([
  readJsonFile(SELECTION_LOG_PATH),
  readJsonFile(DIRECT_SELECTION_LOG_PATH)
]).then(([savedSelections, savedDirectSelections]) => {
  selectionLog = savedSelections;
  directSelectionLog = savedDirectSelections;
  server.listen(PORT, HOST, () => {
    console.log(`MV3 title server running at http://${DISPLAY_HOST}:${PORT}/admin`);
  });
});
