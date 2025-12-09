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
    } catch (e) { }

    let leftPos = 100, topPos = 100;
    try {
        const currentWin = await chrome.windows.getLastFocused();
        if (currentWin.width && currentWin.height) {
            // Align top-right of the current window
            leftPos = (currentWin.left + currentWin.width) - 520;
            topPos = currentWin.top + 50;

            // Simple bounds check (heuristic)
            if (leftPos < 0) leftPos = 50;
            if (topPos < 0) topPos = 50;
        }
    } catch (e) { }

    let finalUrl = mgr.url;
    if (providerKey === 'chatgpt_web') {
        const hasQuery = finalUrl.includes('?');
        finalUrl += (hasQuery ? '&' : '?') + 'temporary-chat=true';
    }

    const win = await chrome.windows.create({
        url: finalUrl,
        type: "popup",
        width: 500, height: 750,
        left: Math.round(leftPos), top: Math.round(topPos),
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
