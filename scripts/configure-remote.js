const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(projectRoot, "extension");
const remoteArg = process.argv[2];

if (!remoteArg) {
  console.error("Usage: npm run configure-remote -- https://your-service.onrender.com");
  process.exit(1);
}

let remoteOrigin;
try {
  const parsed = new URL(remoteArg);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Remote URL must start with http:// or https://");
  }
  remoteOrigin = parsed.origin;
} catch (error) {
  console.error(`Invalid remote URL: ${error.message}`);
  process.exit(1);
}

const manifestPath = path.join(extensionRoot, "manifest.json");
const rulesPath = path.join(extensionRoot, "rules", "static-rules.json");
const popupPath = path.join(extensionRoot, "popup", "popup.js");
const newtabPath = path.join(extensionRoot, "newtab", "newtab.html");
const serviceWorkerPath = path.join(extensionRoot, "service-worker.js");
const selectionContentPath = path.join(extensionRoot, "content", "selection-content.js");
const readmePath = path.join(projectRoot, "README.md");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.host_permissions = [
  `${remoteOrigin}/*`,
  "http://remote-title.example/*"
];
manifest.content_scripts = manifest.content_scripts.map((entry) => {
  if (entry.js && entry.js.includes("content/admin-content.js")) {
    return {
      ...entry,
      matches: [
        `${remoteOrigin}/admin*`,
        `${remoteOrigin}/`
      ]
    };
  }

  return entry;
});
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
const titleRedirectRule = rules.find((rule) => rule.id === 1001);
const directOriginRule = rules.find((rule) => rule.id === 1002);

titleRedirectRule.action.redirect.url = `${remoteOrigin}/api/title`;

if (directOriginRule) {
  directOriginRule.action.requestHeaders[0].value = remoteOrigin;
  directOriginRule.condition.regexFilter = `^${escapeRegex(remoteOrigin)}/api/direct-selections(\\?.*)?$`;
}

fs.writeFileSync(rulesPath, `${JSON.stringify(rules, null, 2)}\n`);

replaceFileText(popupPath, /const ADMIN_URL = ".*?";/, `const ADMIN_URL = "${remoteOrigin}/admin";`);
replaceFileText(newtabPath, /href="[^"]+"([^>]*data-admin-link)/, `href="${remoteOrigin}/admin"$1`);
replaceFileText(serviceWorkerPath, /const HOSTED_SERVER_ORIGIN = ".*?";/, `const HOSTED_SERVER_ORIGIN = "${remoteOrigin}";`);
replaceFileText(selectionContentPath, /const DIRECT_SELECTION_URL = ".*?";/, `const DIRECT_SELECTION_URL = "${remoteOrigin}/api/direct-selections";`);
replaceFileText(readmePath, /REMOTE_SERVER_URL=.*/, `REMOTE_SERVER_URL=${remoteOrigin}`);

console.log(`Configured extension for remote server: ${remoteOrigin}`);
console.log("Reload the unpacked extension in chrome://extensions after this command.");

function replaceFileText(filePath, pattern, replacement) {
  const original = fs.readFileSync(filePath, "utf8");
  if (!pattern.test(original)) {
    throw new Error(`Pattern not found in ${filePath}`);
  }

  fs.writeFileSync(filePath, original.replace(pattern, replacement));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
