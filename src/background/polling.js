// Polling logic to detect completion and fetch final HTML
const { checkStatusInPage } = self.ASKGPT_BG;
const { detachDebugger } = self.ASKGPT_BG;

async function getFinalHTMLAndClose(windowId, tabId, initialCount, providerKey) {
    await chrome.windows.update(windowId, { focused: true, state: 'normal' });
    await new Promise(r => setTimeout(r, 2000));

    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (startCount, pk) => {
            const selector = pk === 'chatgpt_web' ? '.markdown' : '.model-response-text, .message-content';
            const all = document.querySelectorAll(selector);
            if (all.length > startCount) {
                return all[all.length - 1].innerHTML;
            }
            return "";
        },
        args: [initialCount, providerKey]
    });

    try {
        await chrome.windows.update(windowId, { state: 'minimized' });
    } catch (e) { }

    return result;
}

async function pollUntilDone(windowId, tabId, initialCount, providerKey, port) {
    let lastRawLength = 0;
    let stableCount = 0;
    let consecutiveDoneChecks = 0;
    let attempts = 0;

    const interval = setInterval(async () => {
        attempts++;
        if (attempts > 300) { finish("Timeout.", false); return; }

        try {
            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId },
                func: checkStatusInPage,
                args: [initialCount, providerKey]
            });

            if (result.hasText) {
                if (result.rawLength === lastRawLength) {
                    stableCount++;
                } else {
                    stableCount = 0;
                    lastRawLength = result.rawLength;
                    consecutiveDoneChecks = 0;
                    port.postMessage({ status: 'progress', message: "AI đang viết..." });
                }

                if (providerKey === 'chatgpt_web') {
                    if (!result.isGenerating && result.isSendReady) consecutiveDoneChecks++;
                    else consecutiveDoneChecks = 0;

                    if (consecutiveDoneChecks >= 3 || stableCount >= 25) {
                        finish("", true);
                    }
                } else {
                    if (stableCount >= 10) {
                        finish("", true);
                    }
                }
            }
        } catch (e) { }
    }, 500);

    async function finish(errorMsg, success) {
        clearInterval(interval);

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
        setTimeout(() => detachDebugger(tabId), 1000);
    }
}

self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    pollUntilDone,
    getFinalHTMLAndClose
});
