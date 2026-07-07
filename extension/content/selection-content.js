const MESSAGE = {
  SELECTION_CAPTURED: "SELECTION_CAPTURED"
};

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

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE.SELECTION_CAPTURED,
      selectedText: normalizedText,
      pageUrl: location.href,
      pageTitle: document.title,
      selectedAt
    });

    if (!response || !response.ok) {
      console.warn("[selection-content] Highlighted text was not stored.", response);
    }
  } catch (error) {
    console.warn("[selection-content] Could not send highlighted text to the service worker.", error);
  }
}
