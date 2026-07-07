const MESSAGE = {
  TITLE_CHANGED_FROM_ADMIN: "TITLE_CHANGED_FROM_ADMIN"
};

const form = document.querySelector("#title-form");
const input = document.querySelector("#title");
const status = document.querySelector("#status");
const log = document.querySelector("#title-log");

if (form && input && status) {
  status.textContent = "Extension content script is active. Submit the form to update open new tabs.";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = input.value.trim();
    if (!title) {
      status.textContent = "Please enter a title first.";
      input.focus();
      return;
    }

    status.textContent = "Saving title on the local server...";

    try {
      const response = await fetch("/api/title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ title })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Server returned HTTP ${response.status}.`);
      }

      status.textContent = `Saved "${data.title}". Telling the service worker now.`;
      renderLog(data.log || []);

      const workerResponse = await chrome.runtime.sendMessage({
        type: MESSAGE.TITLE_CHANGED_FROM_ADMIN
      });

      if (workerResponse && workerResponse.ok) {
        status.textContent = `New tabs updated to "${workerResponse.title}".`;
      } else {
        status.textContent = `Saved, but the worker used cache: ${workerResponse?.error || "unknown error"}`;
      }
    } catch (error) {
      status.textContent = `Update failed: ${error.message}`;
    }
  });
}

function renderLog(entries) {
  if (!log) {
    return;
  }

  log.textContent = "";
  for (const entry of entries) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const meta = document.createElement("span");

    title.textContent = entry.title;
    meta.textContent = `${entry.source} at ${entry.at}`;
    item.append(title, meta);
    log.append(item);
  }
}
