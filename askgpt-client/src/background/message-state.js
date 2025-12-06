// Message counting and in-page status helpers
async function getMessageCount(tabId, provider) {
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: (p) => {
                const sel = p === 'chatgpt_web' ? '.markdown' : '.model-response-text, .message-content';
                return document.querySelectorAll(sel).length;
            },
            args: [provider]
        });
        return result[0]?.result || 0;
    } catch (e) { return 0; }
}

function checkStatusInPage(initialCount, providerKey) {
    let selector = '.markdown';
    let stopBtnSel = '[data-testid="stop-button"]';

    if (providerKey === 'gemini_web') {
        selector = '.model-response-text, .message-content';
        stopBtnSel = null;
    }

    const allBubbles = document.querySelectorAll(selector);
    const currentCount = allBubbles.length;
    let rawLength = 0;

    if (currentCount > initialCount) {
        const lastBubble = allBubbles[currentCount - 1];
        rawLength = (lastBubble.innerText || "").length;
    }

    if (providerKey === 'chatgpt_web') {
        const stopBtn = document.querySelector(stopBtnSel);
        const sendBtn = document.querySelector('[data-testid="send-button"]');
        return {
            isGenerating: !!stopBtn,
            isSendReady: !!sendBtn && !sendBtn.disabled,
            rawLength: rawLength,
            hasText: rawLength > 0
        };
    } else {
        return {
            isGenerating: false,
            isSendReady: true,
            rawLength: rawLength,
            hasText: rawLength > 0
        };
    }
}

self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    getMessageCount,
    checkStatusInPage
});
