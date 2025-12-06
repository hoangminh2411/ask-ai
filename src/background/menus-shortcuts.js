// Context menu and shortcuts wiring

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "askgpt-summarize-page",
        title: "dY` TA3m tắt trang này (Side Panel)",
        contexts: ["page", "selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "askgpt-summarize-page") {
        chrome.tabs.sendMessage(tab.id, { action: "summarize_page" });
    }
});

chrome.commands.onCommand.addListener((command) => {
    if (command === "summarize-page") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "summarize_page" });
            }
        });
    }
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "config_updated") {
        self.ASKGPT_BG.activeDebuggers.clear();
        self.ASKGPT_BG.MANAGERS.chatgpt_web.windowId = null;
        self.ASKGPT_BG.MANAGERS.gemini_web.windowId = null;
    }
});
