const MESSAGE = {
  TITLE_GET: "TITLE_GET",
  TITLE_REFRESH: "TITLE_REFRESH",
  TITLE_UPDATED: "TITLE_UPDATED"
};

const titleEl = document.querySelector("#page-title");
const statusEl = document.querySelector("#status");
const refreshButton = document.querySelector("#refresh");

refreshButton.addEventListener("click", async () => {
  statusEl.textContent = "Refreshing through the service worker...";
  const state = await chrome.runtime.sendMessage({ type: MESSAGE.TITLE_REFRESH });
  renderState(state);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === MESSAGE.TITLE_UPDATED) {
    renderState(message);
  }
});

loadTitle();

async function loadTitle() {
  try {
    const state = await chrome.runtime.sendMessage({ type: MESSAGE.TITLE_GET });
    renderState(state);
  } catch (error) {
    titleEl.textContent = "MV3 Navigation Lab";
    statusEl.textContent = `The service worker did not respond: ${error.message}`;
  }
}

function renderState(state) {
  titleEl.textContent = state.title || "MV3 Navigation Lab";

  if (state.ok === false) {
    statusEl.textContent = `Using cached title. Last error: ${state.error || "unknown error"}`;
    return;
  }

  const source = state.source || "unknown source";
  const updated = state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "just now";
  statusEl.textContent = `Updated from ${source} at ${updated}.`;
}
