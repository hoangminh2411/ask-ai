// Window/tab reuse for provider popups
// Updated to support worker clones (chatgpt_web_2, etc.)

async function ensureWindow(workerId, port) {
    // Support clone workers: chatgpt_web_2 -> base provider is chatgpt_web
    const isClone = /_\d+$/.test(workerId);
    const baseProviderId = isClone ? workerId.replace(/_\d+$/, '') : workerId;

    // Get base manager for URL config
    const baseMgr = self.ASKGPT_BG.MANAGERS[baseProviderId];
    if (!baseMgr) throw new Error("Unknown Provider: " + baseProviderId);

    // Ensure manager entry exists for this worker (clone or default)
    if (!self.ASKGPT_BG.MANAGERS[workerId]) {
        self.ASKGPT_BG.MANAGERS[workerId] = {
            windowId: null,
            tabId: null,
            url: baseMgr.url,
            matchUrl: baseMgr.matchUrl
        };
    }
    const mgr = self.ASKGPT_BG.MANAGERS[workerId];

    // Check if we already have a window for this specific worker
    if (mgr.windowId) {
        try {
            await chrome.windows.get(mgr.windowId);
            await chrome.windows.update(mgr.windowId, { focused: true, state: 'normal' });
            return { windowId: mgr.windowId, tabId: mgr.tabId };
        } catch (e) { mgr.windowId = null; }
    }

    // For clones, always create a new window (don't reuse tabs)
    // For default workers, try to find existing popup tab
    if (!isClone) {
        try {
            const tabs = await chrome.tabs.query({ url: mgr.matchUrl || baseMgr.matchUrl });
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
    }

    let leftPos = 100, topPos = 100;
    try {
        const currentWin = await chrome.windows.getLastFocused();
        if (currentWin.width && currentWin.height) {
            // Offset for clones so multiple windows don't stack
            const cloneOffset = isClone ? parseInt(workerId.match(/_(\d+)$/)?.[1] || '0') * 30 : 0;
            leftPos = (currentWin.left + currentWin.width) - 520 - cloneOffset;
            topPos = currentWin.top + 50 + cloneOffset;

            if (leftPos < 0) leftPos = 50;
            if (topPos < 0) topPos = 50;
        }
    } catch (e) { }

    let finalUrl = mgr.url || baseMgr.url;
    if (baseProviderId === 'chatgpt_web') {
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

    const displayName = isClone ? `${baseProviderId} clone #${workerId.match(/_(\d+)$/)?.[1]}` : workerId;
    if (port) port.postMessage({ status: 'progress', message: `Khởi động ${displayName}...` });

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
