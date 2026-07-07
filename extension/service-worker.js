const MESSAGE = {
  TITLE_GET: "TITLE_GET",
  TITLE_CHANGED_FROM_ADMIN: "TITLE_CHANGED_FROM_ADMIN",
  TITLE_UPDATED: "TITLE_UPDATED",
  TITLE_REFRESH: "TITLE_REFRESH",
  TITLE_STATUS: "TITLE_STATUS",
  SELECTION_CAPTURED: "SELECTION_CAPTURED"
};

const STORAGE_KEYS = {
  title: "navigationTitle",
  updatedAt: "navigationTitleUpdatedAt",
  lastSource: "navigationTitleLastSource",
  lastError: "navigationTitleLastError"
};

const DEFAULT_TITLE = "MV3 Navigation Lab";
const REMOTE_TITLE_URL = "http://remote-title.example/api/title";
const HOSTED_SERVER_ORIGIN = "https://mv3-navigation-tab-demo.onrender.com";

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[service-worker] Installed. Seeding default storage and checking rules.");
  const existing = await chrome.storage.local.get(STORAGE_KEYS.title);
  if (!existing[STORAGE_KEYS.title]) {
    await saveTitle(DEFAULT_TITLE, "install-default");
  }

  const enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
  console.log("[service-worker] Enabled static rulesets:", enabledRulesets);
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[service-worker] Browser profile started. The worker will still sleep when idle.");
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  console.log("[service-worker] Static DNR rule matched:", {
    ruleId: info.rule.ruleId,
    rulesetId: info.rule.rulesetId,
    url: info.request.url,
    type: info.request.type
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === MESSAGE.TITLE_GET) {
    console.log("[service-worker] New tab opened. Fetching the newest hosted title.");
    handleTitleGet().then(sendResponse);
    return true;
  }

  if (message.type === MESSAGE.TITLE_REFRESH) {
    console.log("[service-worker] Manual refresh requested by an extension page.");
    refreshTitle("manual-refresh").then(sendResponse);
    return true;
  }

  if (message.type === MESSAGE.TITLE_STATUS) {
    getTitleState().then(sendResponse);
    return true;
  }

  if (message.type === MESSAGE.TITLE_CHANGED_FROM_ADMIN) {
    console.log("[service-worker] Content script reported an admin title change.", {
      tabId: sender.tab && sender.tab.id
    });
    refreshTitle("admin-content-script").then((state) => {
      broadcastTitle(state);
      sendResponse(state);
    });
    return true;
  }

  if (message.type === MESSAGE.SELECTION_CAPTURED) {
    console.log("[service-worker] Content script captured highlighted text.", {
      tabId: sender.tab && sender.tab.id,
      url: message.pageUrl
    });
    postSelectionToServer(message, sender).then(sendResponse);
    return true;
  }

  return false;
});

async function handleTitleGet() {
  return refreshTitle("newtab-opened");
}

async function refreshTitle(source) {
  try {
    const title = await fetchTitleFromRemote();
    const state = await saveTitle(title, source);
    console.log("[service-worker] Title refreshed:", state);
    return state;
  } catch (error) {
    const fallback = await getTitleState();
    const state = {
      ...fallback,
      ok: false,
      error: error.message
    };

    await chrome.storage.local.set({
      [STORAGE_KEYS.lastError]: error.message
    });

    console.warn("[service-worker] Could not refresh title. Returning cached value.", state);
    return state;
  }
}

async function fetchTitleFromRemote() {
  console.log("[service-worker] Fetching fake remote URL. Static DNR should redirect it:", REMOTE_TITLE_URL);
  const response = await fetch(`${REMOTE_TITLE_URL}?cacheBust=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Remote title request failed with HTTP ${response.status}.`);
  }

  const data = await response.json();
  const title = String(data.title || "").trim();
  if (!title) {
    throw new Error("Remote title response did not include a title.");
  }

  return title.slice(0, 80);
}

async function postSelectionToServer(message, sender) {
  try {
    const payload = {
      selectedText: String(message.selectedText || "").trim().slice(0, 1000),
      pageUrl: String(message.pageUrl || sender.tab?.url || "").slice(0, 2000),
      pageTitle: String(message.pageTitle || sender.tab?.title || "").slice(0, 300),
      selectedAt: message.selectedAt || new Date().toISOString(),
      tabId: sender.tab?.id || null
    };

    if (!payload.selectedText) {
      return { ok: false, error: "No selected text to send." };
    }

    const response = await fetch(`${HOSTED_SERVER_ORIGIN}/api/selections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Selection server returned HTTP ${response.status}.`);
    }

    return data;
  } catch (error) {
    console.warn("[service-worker] Could not store highlighted text.", error);
    return { ok: false, error: error.message };
  }
}

async function saveTitle(title, source) {
  const updatedAt = new Date().toISOString();
  const state = {
    ok: true,
    title,
    updatedAt,
    source,
    error: ""
  };

  await chrome.storage.local.set({
    [STORAGE_KEYS.title]: title,
    [STORAGE_KEYS.updatedAt]: updatedAt,
    [STORAGE_KEYS.lastSource]: source,
    [STORAGE_KEYS.lastError]: ""
  });

  return state;
}

async function getTitleState() {
  const values = await chrome.storage.local.get([
    STORAGE_KEYS.title,
    STORAGE_KEYS.updatedAt,
    STORAGE_KEYS.lastSource,
    STORAGE_KEYS.lastError
  ]);

  return {
    ok: !values[STORAGE_KEYS.lastError],
    title: values[STORAGE_KEYS.title] || DEFAULT_TITLE,
    updatedAt: values[STORAGE_KEYS.updatedAt] || "",
    source: values[STORAGE_KEYS.lastSource] || "memory-default",
    error: values[STORAGE_KEYS.lastError] || ""
  };
}

function broadcastTitle(state) {
  chrome.runtime.sendMessage({
    type: MESSAGE.TITLE_UPDATED,
    title: state.title,
    updatedAt: state.updatedAt,
    source: state.source,
    ok: state.ok,
    error: state.error || ""
  }).catch(() => {
    console.log("[service-worker] Title refreshed, but no extension page was listening for the broadcast.");
  });
}
