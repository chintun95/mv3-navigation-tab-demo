chrome.runtime.sendMessage({ type: "TITLE_STATUS" }).then((state) => {
  document.querySelector("#title").textContent = state.title;
  document.querySelector("#source").textContent = state.source;
});
