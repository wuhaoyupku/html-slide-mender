(() => {
  const ns = window.HtmlSlideMenderExtension = window.HtmlSlideMenderExtension || {};
  const { EDITOR_BUILD_ID, MESSAGE_NAMESPACE } = ns.constants;
  const previous = window.__htmlSlideMenderBootstrap;

  if (previous?.buildId === EDITOR_BUILD_ID && previous.editor && previous.listener) {
    return;
  }

  if (previous?.listener) {
    try {
      chrome.runtime.onMessage.removeListener(previous.listener);
    } catch (_error) {
      // The listener can already be detached after an extension reload.
    }
  }

  if (previous?.editor?.active) {
    Promise.resolve(previous.editor.exit()).catch((error) => {
      console.warn("[HTML Mender] Failed to dispose previous editor.", error);
    });
  }

  const editor = new ns.HtmlSlideMender();

  const listener = (message, _sender, sendResponse) => {
    if (!message || message.namespace !== MESSAGE_NAMESPACE || message.type !== "EDITOR_COMMAND") {
      return false;
    }

    editor.handleCommand(message.command, message.payload)
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.error("[HTML Mender]", error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });

    return true;
  };

  chrome.runtime.onMessage.addListener(listener);
  window.__htmlSlideMenderBootstrap = {
    buildId: EDITOR_BUILD_ID,
    editor,
    listener
  };
  window.__htmlSlideMenderLoaded = true;
})();
