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
                chrome.tabs.sendMessage(tabId, { action: "askgpt_sidepanel_failed", error: optErr.message || "" }).catch(() => { });
                return;
            }
            chrome.sidePanel.open({ tabId }, () => {
                const openErr = chrome.runtime.lastError;
                if (openErr) {
                    chrome.tabs.sendMessage(tabId, { action: "askgpt_sidepanel_failed", error: openErr.message || "" }).catch(() => { });
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

    // ============================================
    // WORKER MANAGEMENT HANDLERS
    // ============================================

    // 8. Get workers summary for UI
    else if (msg?.action === "get_workers_summary") {
        const workerManager = self.ASKGPT_BG?.workerManager;
        if (workerManager && workerManager.initialized) {
            const summary = workerManager.getWorkersSummary();
            sendResponse(summary);
        } else {
            // Return default if not initialized
            sendResponse({
                workers: [
                    { id: 'chatgpt_web', name: 'ChatGPT', icon: '🤖', isMain: true, status: 'online', enabled: true, badges: ['Main Worker'] },
                    { id: 'gemini_web', name: 'Gemini', icon: '✨', isMain: false, status: 'offline', enabled: true, badges: ['Vision'] },
                    { id: 'perplexity_web', name: 'Perplexity', icon: '🔍', isMain: false, status: 'offline', enabled: true, badges: ['Real-time'] },
                    { id: 'copilot_web', name: 'Copilot', icon: '🚀', isMain: false, status: 'offline', enabled: false, badges: ['Microsoft'] },
                    { id: 'grok_web', name: 'Grok', icon: '𝕏', isMain: false, status: 'offline', enabled: false, badges: ['Twitter'] }
                ],
                summary: { online: 1, total: 3, mainWorker: 'ChatGPT' }
            });
        }
        return true;
    }

    // 9. Toggle worker on/off
    else if (msg?.action === "toggle_worker" && msg.workerId) {
        const workerManager = self.ASKGPT_BG?.workerManager;
        if (workerManager) {
            workerManager.toggleWorker(msg.workerId, msg.enabled)
                .then(success => {
                    const worker = workerManager.getWorker(msg.workerId);
                    sendResponse({
                        success,
                        status: worker?.status || 'offline',
                        enabled: worker?.enabled || false
                    });
                })
                .catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
        } else {
            sendResponse({ success: false, error: 'Worker manager not available' });
        }
        return true;
    }

    // 10. Set active worker for routing
    else if (msg?.action === "set_active_worker" && msg.workerId) {
        // Store selected worker in sync storage
        chrome.storage.sync.set({ ai_provider: msg.workerId }, () => {
            console.log('[Sidepanel] Active worker set to:', msg.workerId);
            sendResponse({ success: true });
        });
        return true;
    }

    // 11. Get current active worker
    else if (msg?.action === "get_active_worker") {
        chrome.storage.sync.get(['ai_provider'], (result) => {
            sendResponse({ workerId: result.ai_provider || 'chatgpt_web' });
        });
        return true;
    }

    // ============================================
    // PHASE 4: STATUS CHECKER HANDLERS
    // ============================================

    // 12. Check single worker status (on-demand)
    else if (msg?.action === "check_worker_status" && msg.workerId) {
        const statusChecker = self.ASKGPT_BG?.statusChecker;
        if (statusChecker) {
            statusChecker.forceCheck(msg.workerId)
                .then(result => {
                    sendResponse(result);
                })
                .catch(err => {
                    sendResponse({ status: 'error', reason: err.message });
                });
        } else {
            sendResponse({ status: 'unknown', reason: 'Status checker not available' });
        }
        return true;
    }

    // 13. Refresh all worker statuses
    else if (msg?.action === "refresh_all_workers") {
        const statusChecker = self.ASKGPT_BG?.statusChecker;
        if (statusChecker) {
            statusChecker.checkAllWorkers()
                .then(results => {
                    // Also get fresh summary
                    const workerManager = self.ASKGPT_BG?.workerManager;
                    const summary = workerManager?.getWorkersSummary() || null;
                    sendResponse({ results, summary });
                })
                .catch(err => {
                    sendResponse({ error: err.message });
                });
        } else {
            sendResponse({ error: 'Status checker not available' });
        }
        return true;
    }

    // 14. Get worker error info
    else if (msg?.action === "get_worker_errors") {
        const errorRecovery = self.ASKGPT_BG?.errorRecovery;
        if (errorRecovery && msg.workerId) {
            const errorCount = errorRecovery.errorCounts.get(msg.workerId) || 0;
            const shouldDisable = errorRecovery.shouldDisableWorker(msg.workerId);
            const suggestion = errorRecovery.getRecoverySuggestion(msg.workerId, '');
            sendResponse({
                workerId: msg.workerId,
                errorCount,
                shouldDisable,
                suggestion
            });
        } else {
            sendResponse({ errorCount: 0, shouldDisable: false });
        }
        return true;
    }

    // ============================================
    // CLONE WORKER HANDLERS
    // ============================================

    // 15. Register a new clone worker
    else if (msg?.action === "register_clone" && msg.cloneData) {
        const workerManager = self.ASKGPT_BG?.workerManager;
        if (workerManager) {
            workerManager.registerClone(msg.cloneData)
                .then(success => {
                    sendResponse({ success });
                })
                .catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
        } else {
            sendResponse({ success: false, error: 'Worker manager not available' });
        }
        return true;
    }

    // 16. Unregister a clone worker
    else if (msg?.action === "unregister_clone" && msg.cloneId) {
        const workerManager = self.ASKGPT_BG?.workerManager;
        if (workerManager) {
            workerManager.unregisterClone(msg.cloneId)
                .then(success => {
                    sendResponse({ success });
                })
                .catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
        } else {
            sendResponse({ success: false, error: 'Worker manager not available' });
        }
        return true;
    }
});