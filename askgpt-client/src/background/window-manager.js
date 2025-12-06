// Window/tab reuse for provider popups

async function ensureWindow(providerKey, port) {
    const mgr = self.ASKGPT_BG.MANAGERS[providerKey];
    if (!mgr) throw new Error("Unknown Provider");

    if (mgr.windowId) {
        try {
            await chrome.windows.get(mgr.windowId);
            await chrome.windows.update(mgr.windowId, { focused: true, state: 'normal' });
            return { windowId: mgr.windowId, tabId: mgr.tabId };
        } catch (e) { mgr.windowId = null; }
    }

    try {
        const tabs = await chrome.tabs.query({ url: mgr.matchUrl });
        for (const tab of tabs) {
            const win = await chrome.windows.get(tab.windowId);
            if (win.type === 'popup') {
                mgr.windowId = win.id;
                mgr.tabId = tab.id;
                await chrome.windows.update(mgr.windowId, { focused: true, state: 'normal' });
                return { windowId: mgr.windowId, tabId: mgr.tabId };
            }
        }
    } catch (e) {}

    let leftPos = 0, topPos = 0;
    try {
        const currentWin = await chrome.windows.getLastFocused();
        leftPos = currentWin.left + currentWin.width;
        topPos = currentWin.top + currentWin.height;
    } catch (e) {}

    const win = await chrome.windows.create({
        url: mgr.url,
        type: "popup",
        width: 150, height: 150,
        left: leftPos - 150, top: topPos - 150,
        focused: true
    });

    mgr.windowId = win.id;
    mgr.tabId = win.tabs[0].id;

    if (port) port.postMessage({ status: 'progress', message: `Khởi động ${providerKey}...` });

    await new Promise(resolve => {
        const listener = (tid, info) => {
            if (tid === mgr.tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });

    await new Promise(r => setTimeout(r, 1500));
    return { windowId: mgr.windowId, tabId: mgr.tabId };
}

self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    ensureWindow
});
