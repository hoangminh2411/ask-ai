// Side panel wiring: open panel on action click and relay selection requests if needed
const lastPanelState = new Map(); // tabId -> { selection, prompt, finalQuery }

chrome.runtime.onInstalled.addListener(() => {
    try {
        chrome.sidePanel.setOptions({ path: "sidepanel.html", enabled: true });
    } catch (_) { /* sidePanel may not be available */ }
});

chrome.action.onClicked.addListener(async (tab) => {
    try {
        await chrome.sidePanel.setOptions({ tabId: tab.id, path: "sidepanel.html", enabled: true });
        await chrome.sidePanel.open({ tabId: tab.id });
    } catch (err) {
        console.warn("Failed to open side panel", err);
    }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === "askgpt_open_sidepanel") {
        const tabId = msg.tabId || sender?.tab?.id;
        if (!tabId) return;
        chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true }, () => {
            const optErr = chrome.runtime.lastError;
            if (optErr) {
                console.warn("sidePanel.setOptions failed", optErr);
                chrome.tabs.sendMessage(tabId, { action: "askgpt_sidepanel_failed", error: optErr.message || "" }).catch(() => {});
                return;
            }
            chrome.sidePanel.open({ tabId }, () => {
                const openErr = chrome.runtime.lastError;
                if (openErr) {
                    console.warn("sidePanel.open failed", openErr);
                    chrome.tabs.sendMessage(tabId, { action: "askgpt_sidepanel_failed", error: openErr.message || "" }).catch(() => {});
                }
            });
        });
    }
    else if (msg?.action === "askgpt_panel_handle" || msg?.action === "askgpt_panel_set_context") {
        const tabId = msg.tabId || sender?.tab?.id || 0;
        lastPanelState.set(tabId, { selection: msg.selection || "", prompt: msg.prompt || "", finalQuery: msg.finalQuery || "", promptLabel: msg.promptLabel || "" });
    }
    else if (msg?.action === "askgpt_panel_request_state") {
        const tabId = msg.tabId || sender?.tab?.id || 0;
        const state = lastPanelState.get(tabId) || null;
        sendResponse?.({ state });
        return true;
    }
    else if (msg?.action === "askgpt_get_selection") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) {
                sendResponse({ text: "" });
                return;
            }
            chrome.scripting.executeScript(
                { target: { tabId: tab.id }, func: () => window.getSelection().toString() },
                (res) => {
                    const text = res && res[0] && typeof res[0].result === "string" ? res[0].result.trim() : "";
                    sendResponse({ text });
                }
            );
        });
        return true;
    }
    else if (msg?.action === "askgpt_proxy_image" && msg.url) {
        fetch(msg.url, { redirect: "follow" })
            .then(res => {
                if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
                return res.blob();
            })
            .then(blob => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }))
            .then(dataUrl => sendResponse({ dataUrl }))
            .catch(err => sendResponse({ error: String(err) }));
        return true;
    }
    else if (msg?.action === "askgpt_pinterest_fetch" && msg.query) {
        const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(msg.query)}`;
        fetch(url, { redirect: "follow" })
            .then(res => res.text())
            .then(html => {
                const urls = [];
                const normalized = html.replace(/\\u002F/g, "/").replace(/\\\\\//g, "/");
                const sizeWhitelist = ['/236x/', '/474x/', '/564x/', '/736x/', '/originals/'];
                const isValidPin = (u) => {
                    if (!u.includes('i.pinimg.com')) return false;
                    if (u.includes('/avatars/') || u.includes('/30x30/')) return false;
                    return sizeWhitelist.some(sz => u.includes(sz));
                };
                // Extract from pinrep-image elements (src only to avoid srcset duplicates), dedupe by ID
                const seenIds = new Set();
                const getId = (u) => {
                    try {
                        const path = new URL(u).pathname;
                        const last = path.split('/').pop() || "";
                        return last.split('.')[0];
                    } catch (_) { return ""; }
                };
                const imgTags = [...normalized.matchAll(/<img[^>]*pinrep-image[^>]*>/gi)];
                imgTags.forEach(tag => {
                    if (urls.length >= 80) return;
                    const srcMatch = tag[0].match(/src=\"([^\"]+pinimg[^\"]+)\"/i);
                    const candidate = srcMatch ? srcMatch[1] : "";
                    const id = candidate ? getId(candidate) : "";
                    if (candidate && id && isValidPin(candidate) && !seenIds.has(id)) {
                        seenIds.add(id);
                        urls.push(candidate);
                    }
                });
                // Direct pinimg links anywhere
                const pinRegex = /https?:\/\/i\.pinimg\.com\/[^\s"'\\]+?\.(?:jpg|jpeg|png)/gi;
                let m;
                while ((m = pinRegex.exec(normalized)) && urls.length < 80) {
                    const candidate = m[0];
                    const id = getId(candidate);
                    if (isValidPin(candidate) && id && !seenIds.has(id)) {
                        seenIds.add(id);
                        urls.push(candidate);
                    }
                }
                sendResponse({ urls });
            })
            .catch(err => sendResponse({ error: String(err), urls: [] }));
        return true;
    }
});
