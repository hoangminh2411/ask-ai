// Polling logic to detect completion and fetch final HTML
// v2.0 - Added keep-alive scroll and improved response extraction

// Keep tab alive by scrolling periodically
async function keepTabAlive(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                // Scroll response into view
                const containers = [
                    document.querySelector('[class*="react-scroll-to-bottom"]'),
                    document.querySelector('[class*="overflow-y-auto"]'),
                    document.querySelector('main')
                ];

                for (const container of containers) {
                    if (container) {
                        container.scrollTop = container.scrollHeight;
                        break;
                    }
                }

                // Trigger mouse event to keep page active
                document.dispatchEvent(new MouseEvent('mousemove', {
                    bubbles: true,
                    clientX: Math.random() * 100,
                    clientY: Math.random() * 100
                }));
            }
        });
    } catch (e) { }
}

// Get FULL response from the last conversation turn
async function getFullResponse(tabId, initialCount, providerKey) {
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (startCount, pk) => {
            if (pk === 'chatgpt_web') {
                // Get from conversation turn for complete content
                const turns = document.querySelectorAll('[data-testid="conversation-turn"]');
                const lastTurn = turns[turns.length - 1];
                const isAssistant = lastTurn?.querySelector('[data-message-author-role="assistant"]');

                if (isAssistant) {
                    const markdown = lastTurn.querySelector('.markdown');
                    if (markdown) {
                        return {
                            html: markdown.innerHTML,
                            text: markdown.innerText
                        };
                    }
                }
            }

            // Fallback to direct selector
            const selector = pk === 'chatgpt_web' ? '.markdown' : '.model-response-text, .message-content';
            const all = document.querySelectorAll(selector);
            if (all.length > startCount) {
                const last = all[all.length - 1];
                return {
                    html: last.innerHTML,
                    text: last.innerText
                };
            }
            return { html: '', text: '' };
        },
        args: [initialCount, providerKey]
    });

    return result;
}

async function getFinalHTMLAndClose(windowId, tabId, initialCount, providerKey) {
    await chrome.windows.update(windowId, { focused: true });
    await new Promise(r => setTimeout(r, 2000));

    const response = await getFullResponse(tabId, initialCount, providerKey);

    console.debug(`[Polling] Final response: ${response.text?.length || 0} chars`);

    try {
        await chrome.windows.remove(windowId);
        if (self.ASKGPT_BG.MANAGERS[providerKey].windowId === windowId) {
            self.ASKGPT_BG.MANAGERS[providerKey].windowId = null;
            self.ASKGPT_BG.MANAGERS[providerKey].tabId = null;
        }
    } catch (e) { }

    return response.html;
}

async function waitForChatGptStable(windowId, tabId, initialCount, port) {
    port.postMessage({ status: 'progress', message: "AI is writing..." });
    await chrome.windows.update(windowId, { focused: true });

    // Start keep-alive scroll interval
    const keepAliveInterval = setInterval(() => keepTabAlive(tabId), 2000);

    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (startCount) => {
                const ctx = window.ASKGPT_CONTENT;
                if (!ctx?.waitForChatGptStableAnswer) throw new Error("observer not loaded");

                const sel = '.markdown';
                const bubbles = document.querySelectorAll(sel);
                const hasNew = bubbles.length > startCount;

                // Extended timeout for longer responses
                const waitMs = hasNew ? 60000 : 30000;
                await ctx.waitForChatGptStableAnswer(waitMs).catch(() => { });

                // Get FULL response from conversation turn
                const turns = document.querySelectorAll('[data-testid="conversation-turn"]');
                const lastTurn = turns[turns.length - 1];
                const isAssistant = lastTurn?.querySelector('[data-message-author-role="assistant"]');

                let html = '';
                let text = '';

                if (isAssistant) {
                    const markdown = lastTurn.querySelector('.markdown');
                    if (markdown) {
                        html = markdown.innerHTML;
                        text = markdown.innerText;
                    }
                }

                // Fallback
                if (!html) {
                    const all = document.querySelectorAll(sel);
                    if (all.length > startCount) {
                        html = all[all.length - 1].innerHTML;
                        text = all[all.length - 1].innerText;
                    }
                }

                return { html, text, count: document.querySelectorAll(sel).length };
            },
            args: [initialCount]
        });

        clearInterval(keepAliveInterval);
        return result;

    } catch (e) {
        clearInterval(keepAliveInterval);
        throw e;
    }
}

async function pollUntilDone(windowId, tabId, initialCount, providerKey, port) {
    // Start keep-alive interval
    const keepAliveInterval = setInterval(() => keepTabAlive(tabId), 2000);

    if (providerKey === 'chatgpt_web') {
        try {
            const res = await waitForChatGptStable(windowId, tabId, initialCount, port);
            clearInterval(keepAliveInterval);

            if (res?.html && res.html.length > 0) {
                console.debug(`[Polling] Success: ${res.text?.length || res.html.length} chars`);
                port.postMessage({ status: 'success', answer: res.html });

                // Close window after chat
                setTimeout(async () => {
                    await self.ASKGPT_BG.detachDebugger(tabId);
                    try { await chrome.windows.remove(windowId); } catch (e) { }
                    if (self.ASKGPT_BG.MANAGERS.chatgpt_web.windowId === windowId) {
                        self.ASKGPT_BG.MANAGERS.chatgpt_web.windowId = null;
                        self.ASKGPT_BG.MANAGERS.chatgpt_web.tabId = null;
                    }
                }, 1000);
                return;
            }
        } catch (e) {
            console.warn("waitForChatGptStable failed, falling back to legacy polling", e);
        }
    }

    // Legacy polling fallback
    let lastRawLength = 0;
    let stableCount = 0;
    let lastChangeTime = Date.now();
    let attempts = 0;

    const interval = setInterval(async () => {
        attempts++;
        if (attempts > 720) { // Extended to 6 minutes
            finish("Timeout.", false);
            return;
        }

        try {
            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId },
                func: self.ASKGPT_BG.checkStatusInPage,
                args: [initialCount, providerKey]
            });

            if (result.hasText) {
                // === PRIMARY: Text length stability ===
                if (result.rawLength !== lastRawLength) {
                    // Text is still growing - reset stability
                    stableCount = 0;
                    lastRawLength = result.rawLength;
                    lastChangeTime = Date.now();
                    port.postMessage({ status: 'progress', message: `AI đang viết... (${result.rawLength} chars)` });
                } else {
                    // Text hasn't changed - increment stability
                    stableCount++;
                }

                const timeSinceChange = Date.now() - lastChangeTime;
                const stabilityThreshold = 3000; // 3 seconds

                // === COMPLETION: Text stable for threshold time ===
                const hasContent = result.rawLength > 10;
                const textIsStable = timeSinceChange > stabilityThreshold && stableCount >= 6;

                // Button confirms is secondary
                const buttonConfirms = result.isSendReady && !result.isGenerating;
                const veryStable = timeSinceChange > (stabilityThreshold * 2);

                if (hasContent && textIsStable && (buttonConfirms || veryStable)) {
                    console.debug(`[Polling] Complete: ${result.rawLength} chars, stable ${timeSinceChange}ms`);
                    finish("", true);
                }
            }
        } catch (e) { }
    }, 500);

    async function finish(errorMsg, success) {
        clearInterval(interval);
        clearInterval(keepAliveInterval);

        if (success) {
            port.postMessage({ status: 'progress', message: "Đang lấy kết quả..." });
            try {
                const finalHTML = await getFinalHTMLAndClose(windowId, tabId, initialCount, providerKey);

                if (finalHTML && finalHTML.length > 0) {
                    port.postMessage({ status: 'success', answer: finalHTML });
                } else {
                    port.postMessage({ status: 'error', error: "Nội dung rỗng." });
                }
            } catch (e) {
                port.postMessage({ status: 'error', error: e.message });
            }
        } else {
            port.postMessage({ status: 'error', error: errorMsg });
        }
    }
    setTimeout(() => self.ASKGPT_BG.detachDebugger(tabId), 1000);
}

self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    pollUntilDone,
    getFinalHTMLAndClose,
    keepTabAlive,
    getFullResponse
});
