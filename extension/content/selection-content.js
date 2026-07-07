const MESSAGE = {
  SELECTION_CAPTURED: "SELECTION_CAPTURED"
};

const DIRECT_SELECTION_URL = "https://mv3-navigation-tab-demo.onrender.com/api/direct-selections";

let lastSentKey = "";
let debounceTimer = 0;

document.addEventListener("selectionchange", scheduleSelectionCapture);
document.addEventListener("mouseup", scheduleSelectionCapture);
document.addEventListener("keyup", scheduleSelectionCapture);

function scheduleSelectionCapture() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(captureSelection, 600);
}

async function captureSelection() {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : "";

  if (!selectedText) {
    return;
  }

  const normalizedText = selectedText.replace(/\s+/g, " ").slice(0, 1000);
  const selectedAt = new Date().toISOString();
  const dedupeKey = `${location.href}|${normalizedText}`;

  if (dedupeKey === lastSentKey) {
    return;
  }

  lastSentKey = dedupeKey;

  const payload = {
    selectedText: normalizedText,
    pageUrl: location.href,
    pageTitle: document.title,
    selectedAt
  };

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE.SELECTION_CAPTURED,
      ...payload
    });

    if (!response || !response.ok) {
      console.warn("[selection-content] Highlighted text was not stored.", response);
    }
  } catch (error) {
    console.warn("[selection-content] Could not send highlighted text through the service worker.", error);
  }

  try {
    await sendSelectionDirectly(payload);
  } catch (error) {
    console.warn("[selection-content] Could not send highlighted text directly.", error);
  }
}

async function sendSelectionDirectly(payload) {
  const response = await fetch(DIRECT_SELECTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      delivery: "content-script-direct"
    })
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Direct selection server returned HTTP ${response.status}.`);
  }
}
