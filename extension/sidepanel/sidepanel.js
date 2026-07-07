const statusEl = document.querySelector("#status");
const refresh = document.querySelector("#refresh");

refresh.addEventListener("click", async () => {
  statusEl.textContent = "Refreshing...";
  const state = await chrome.runtime.sendMessage({ type: "TITLE_REFRESH" });
  render(state);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "TITLE_UPDATED") {
    render(message);
  }
});

chrome.runtime.sendMessage({ type: "TITLE_STATUS" }).then(render);

function render(state) {
  statusEl.textContent = `Cached title: ${state.title}`;
}
