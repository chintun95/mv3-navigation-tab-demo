const MESSAGE = {
  TITLE_STATUS: "TITLE_STATUS",
  TITLE_REFRESH: "TITLE_REFRESH"
};

const ADMIN_URL = "http://127.0.0.1:8790/admin";

const titleEl = document.querySelector("#title");
const openAdmin = document.querySelector("#open-admin");
const refresh = document.querySelector("#refresh");

openAdmin.addEventListener("click", () => {
  chrome.tabs.create({ url: ADMIN_URL });
});

refresh.addEventListener("click", async () => {
  titleEl.textContent = "Refreshing...";
  const state = await chrome.runtime.sendMessage({ type: MESSAGE.TITLE_REFRESH });
  titleEl.textContent = state.title;
});

chrome.runtime.sendMessage({ type: MESSAGE.TITLE_STATUS }).then((state) => {
  titleEl.textContent = state.title;
});
