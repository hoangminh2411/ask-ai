// Message counting and in-page status helpers
// v2.0 - Updated for new ChatGPT DOM structure

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

    if (providerKey === 'gemini_web') {
        selector = '.model-response-text, .message-content';
    }

    const allBubbles = document.querySelectorAll(selector);
    const currentCount = allBubbles.length;
    let rawLength = 0;

    if (currentCount > initialCount) {
        const lastBubble = allBubbles[currentCount - 1];
        rawLength = (lastBubble.innerText || "").length;
    }

    if (providerKey === 'chatgpt_web') {
        // === NEW DETECTION: Use #composer-submit-button aria-label ===
        const composerBtn = document.querySelector('#composer-submit-button');
        let isGenerating = false;
        let isSendReady = false;
        let buttonLabel = '';

        if (composerBtn) {
            buttonLabel = composerBtn.getAttribute('aria-label') || '';
            const label = buttonLabel.toLowerCase();
            // "Stop streaming" = generating
            isGenerating = label.includes('stop');
            // "Send message" = ready
            isSendReady = label.includes('send') && !composerBtn.disabled;
        } else {
            // Fallback for older ChatGPT versions
            const stopBtn = document.querySelector('[data-testid="stop-button"]');
            const sendBtn = document.querySelector('[data-testid="send-button"]');
            isGenerating = !!stopBtn;
            isSendReady = !!sendBtn && !sendBtn.disabled && !stopBtn;
        }

        return {
            isGenerating,
            isSendReady,
            rawLength,
            hasText: rawLength > 0,
            buttonLabel  // Include for debugging
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
