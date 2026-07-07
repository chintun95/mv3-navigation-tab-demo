const http = require("node:http");
const { URLSearchParams } = require("node:url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8790);
const DISPLAY_HOST = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;

let currentTitle = "MV3 Navigation Lab";
const titleLog = [
  {
    title: currentTitle,
    at: new Date().toISOString(),
    source: "server-start"
  }
];

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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${DISPLAY_HOST}:${PORT}`);

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

    if (req.method === "POST" && url.pathname === "/api/title") {
      await handleTitlePost(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found." });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MV3 title server running at http://${DISPLAY_HOST}:${PORT}/admin`);
});
