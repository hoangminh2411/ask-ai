// Context menu and shortcuts wiring

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "askgpt-summarize-page",
      title: "Summarize this page (Side Panel)",
      contexts: ["page", "selection"]
    });
});

const CONTENT_SCRIPT_FILES = [
    "marked.min.js",
    "src/content/state.js",
    "src/content/extract.js",
    "src/content/layout.js",
    "src/content/modal.js",
    "src/content/chatgpt-observer.js",
    "src/content/chat-client.js",
    "src/content/floating-button.js",
    "src/content/events.js",
    "src/content/image-capture.js",
    "content.js"
];

function canInjectIntoTab(tab) {
    return !!tab?.url && /^https?:\/\//i.test(tab.url);
}

function sendActionToActiveTab(action) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab) return;

        const send = () => {
            chrome.tabs.sendMessage(tab.id, { action }, () => {
                const err = chrome.runtime.lastError;
                if (err && (err.message?.includes("Receiving end does not exist") || err.message?.includes("The message port closed before a response was received"))) {
                    injectAndRetry();
                } else if (err) {
                    console.warn(`${action} message failed:`, err.message);
                }
            });
        };

        const injectAndRetry = () => {
            if (!canInjectIntoTab(tab)) {
                console.warn(`${action} inject skipped for unsupported tab:`, tab.url);
                return;
            }
            chrome.scripting.executeScript(
                { target: { tabId: tab.id }, files: CONTENT_SCRIPT_FILES },
                () => {
                    const injectErr = chrome.runtime.lastError;
                    if (injectErr) {
                        console.warn(`${action} inject failed:`, injectErr.message);
                        return;
                    }
                    send();
                }
            );
        };

        send();
    });
}

function sendToTabWithInject(tab, payload, label) {
    if (!tab) return;
    const tabId = tab.id;
    const send = () => {
        chrome.tabs.sendMessage(tabId, payload, () => {
            const err = chrome.runtime.lastError;
            if (err && (err.message?.includes("Receiving end does not exist") || err.message?.includes("The message port closed before a response was received"))) {
                injectAndRetry();
            } else if (err) {
                console.warn(`${label} send failed:`, err.message);
            }
        });
    };
    const injectAndRetry = () => {
        if (!canInjectIntoTab(tab)) {
            console.warn(`${label} inject skipped for unsupported tab:`, tab.url);
            return;
        }
        chrome.scripting.executeScript(
            { target: { tabId }, files: CONTENT_SCRIPT_FILES },
            () => {
                const injectErr = chrome.runtime.lastError;
                if (injectErr) {
                    console.warn(`${label} inject failed:`, injectErr.message);
                    return;
                }
                send();
            }
        );
    };
    send();
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "askgpt-summarize-page") {
        chrome.tabs.sendMessage(tab.id, { action: "summarize_page" });
    }
});

chrome.commands.onCommand.addListener((command) => {
    if (command === "summarize-page") {
        sendActionToActiveTab("summarize_page");
    } else if (command === "capture-image") {
        sendActionToActiveTab("start_image_capture");
    }
});

async function focusLikelyInput(tabId) {
    try {
        const [res] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const selectors = [
                    "#prompt-textarea",
                    "textarea",
                    "input[type=\"text\"]:not([disabled])",
                    "div[contenteditable=\"true\"]",
                    "rich-textarea div[contenteditable=\"true\"]"
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        el.scrollIntoView({ block: "center" });
                        el.click();
                        el.focus();
                        return true;
                    }
                }
                return false;
            }
        });
        return !!res?.result;
    } catch (_) {
        return false;
    }
}

async function performDebugPasteToActive() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) throw new Error("No active tab");
    const tabId = tabs[0].id;
    const target = { tabId };
    await chrome.debugger.attach(target, "1.3");
    try {
        await focusLikelyInput(tabId);
        await new Promise((r) => setTimeout(r, 120));
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, key: "Control", code: "ControlLeft" });
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, key: "v", code: "KeyV", modifiers: 2 });
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, key: "v", code: "KeyV", modifiers: 2 });
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, key: "Control", code: "ControlLeft" });
    } finally {
        await chrome.debugger.detach(target).catch(() => {});
    }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "config_updated") {
        self.ASKGPT_BG.activeDebuggers.clear();
        self.ASKGPT_BG.MANAGERS.chatgpt_web.windowId = null;
        self.ASKGPT_BG.MANAGERS.gemini_web.windowId = null;
    } else if (msg.action === "capture_visible") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.captureVisibleTab(tabs[0].windowId, { format: "png" }, (dataUrl) => {
                const err = chrome.runtime.lastError;
                if (err || !dataUrl) {
                    sendToTabWithInject(tabs[0], { action: "capture_result_error", error: err ? err.message : "No data returned" }, "capture_result_error");
                    return;
                }
                sendToTabWithInject(tabs[0], { action: "capture_result", dataUrl }, "capture_result");
            });
        });
        sendResponse({ ok: true });
        return true;
    } else if (msg.action === "debug_paste") {
        performDebugPasteToActive()
            .then(() => sendResponse({ ok: true }))
            .catch((err) => sendResponse({ ok: false, error: err?.message || "debug paste failed" }));
        return true;
    }
});
