import { CONTENT_SCRIPT_FILES } from "../content/content-script-files.js";

const MESSAGE_NAMESPACE = "HTML_SLIDE_MENDER";
const DATA_URL_LIMIT = 18 * 1024 * 1024;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.namespace !== MESSAGE_NAMESPACE) {
    return false;
  }

  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.error("[HTML Mender]", error);
      sendResponse({ ok: false, error: readableError(error) });
    });

  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case "POPUP_COMMAND":
      return sendCommandToActiveTab(message.command, message.payload);
    case "DOWNLOAD_HTML":
      return downloadHtml(message.payload, sender);
    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}

async function sendCommandToActiveTab(command, payload = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, error: "No active tab found." };
  }

  await ensureEditorInjected(tab.id);

  try {
    return await chrome.tabs.sendMessage(tab.id, {
      namespace: MESSAGE_NAMESPACE,
      type: "EDITOR_COMMAND",
      command,
      payload
    });
  } catch (error) {
    await ensureEditorInjected(tab.id);
    return chrome.tabs.sendMessage(tab.id, {
      namespace: MESSAGE_NAMESPACE,
      type: "EDITOR_COMMAND",
      command,
      payload
    });
  }
}

async function ensureEditorInjected(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES
  });
}

async function downloadHtml(payload = {}, sender) {
  const html = String(payload.html || "");
  const filename = normalizeFilename(payload.filename || "edited-html-slide.html");

  if (!html.trim()) {
    return { ok: false, error: "Nothing to download." };
  }

  const encoded = encodeURIComponent(html);
  if (encoded.length > DATA_URL_LIMIT) {
    return {
      ok: false,
      code: "HTML_TOO_LARGE_FOR_DATA_URL",
      error: "The generated HTML is too large for the downloads API data URL path."
    };
  }

  const id = await chrome.downloads.download({
    url: `data:text/html;charset=utf-8,${encoded}`,
    filename,
    saveAs: true,
    conflictAction: "uniquify"
  });

  return { ok: true, downloadId: id, tabId: sender?.tab?.id };
}

function normalizeFilename(value) {
  const fallback = "edited-html-slide.html";
  const safe = String(value)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);

  if (!safe) {
    return fallback;
  }

  return safe.toLowerCase().endsWith(".html") ? safe : `${safe}.html`;
}

function readableError(error) {
  if (!error) {
    return "Unknown error.";
  }
  if (error.message) {
    return error.message;
  }
  return String(error);
}
