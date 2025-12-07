// Side panel wiring: open panel on action click and relay selection requests if needed
const lastPanelState = new Map(); // tabId -> { selection, prompt, finalQuery }

chrome.runtime.onInstalled.addListener(() => {
    try {
        // Cấu hình sidepanel mặc định
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
    // 1. Mở Sidepanel
    if (msg?.action === "askgpt_open_sidepanel") {
        const tabId = msg.tabId || sender?.tab?.id;
        if (!tabId) return;
        chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true }, () => {
            const optErr = chrome.runtime.lastError;
            if (optErr) {
                chrome.tabs.sendMessage(tabId, { action: "askgpt_sidepanel_failed", error: optErr.message || "" }).catch(() => {});
                return;
            }
            chrome.sidePanel.open({ tabId }, () => {
                const openErr = chrome.runtime.lastError;
                if (openErr) {
                    chrome.tabs.sendMessage(tabId, { action: "askgpt_sidepanel_failed", error: openErr.message || "" }).catch(() => {});
                }
            });
        });
    }
    // 2. Lưu trạng thái (Text Selection, Prompt)
    else if (msg?.action === "askgpt_panel_handle" || msg?.action === "askgpt_panel_set_context") {
        const tabId = msg.tabId || sender?.tab?.id || 0;
        const prev = lastPanelState.get(tabId) || {};
        lastPanelState.set(tabId, {
            ...prev,
            selection: msg.selection || "",
            prompt: msg.prompt || "",
            finalQuery: msg.finalQuery || "",
            promptLabel: msg.promptLabel || ""
        });
    }
    // 3. UI yêu cầu lấy lại trạng thái cũ
    else if (msg?.action === "askgpt_panel_request_state") {
        const tabId = msg.tabId || sender?.tab?.id || 0;
        const state = lastPanelState.get(tabId) || null;
        sendResponse?.({ state });
        return true;
    }
    // 4. Xử lý kết quả từ LENS (Quan trọng)
    else if (msg?.action === "askgpt_panel_lens_results" && msg.payload) {
        const tabId = msg.tabId || sender?.tab?.id || 0;
        const prev = lastPanelState.get(tabId) || {};
        const payload = msg.payload || {};
        
        // Lưu kết quả vào bộ nhớ đệm
        lastPanelState.set(tabId, { ...prev, lensResults: payload });
        
        // Nếu muốn gửi ngược lại Content Script (tuỳ chọn, nhưng giữ lại để an toàn)
        if (tabId) {
            try {
                chrome.tabs.sendMessage(tabId, { action: "askgpt_panel_lens_results", payload });
            } catch (_) { /* ignore */ }
        }
    }
    // 5. Lấy text đang bôi đen
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
    // 6. Proxy tải ảnh (để tránh CORS)
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
    // 7. Pinterest Search
    else if (msg?.action === "askgpt_pinterest_fetch" && msg.query) {
        const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(msg.query)}`;
        fetch(url, { redirect: "follow" })
            .then(res => res.text())
            .then(html => {
                const urls = [];
                // Simple parsing logic logic
                const normalized = html.replace(/\\u002F/g, "/").replace(/\\\\\//g, "/");
                const pinRegex = /https?:\/\/i\.pinimg\.com\/[^\s"'\\]+?\.(?:jpg|jpeg|png)/gi;
                let m;
                const seen = new Set();
                while ((m = pinRegex.exec(normalized)) && urls.length < 80) {
                   if (!seen.has(m[0])) { seen.add(m[0]); urls.push(m[0]); }
                }
                sendResponse({ urls });
            })
            .catch(err => sendResponse({ error: String(err), urls: [] }));
        return true;
    }
});