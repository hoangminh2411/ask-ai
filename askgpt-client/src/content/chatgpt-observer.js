// ChatGPT stream observer: detect when assistant output stops changing (no more tokens)
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__observerLoaded) {
    if (!window.ASKGPT_CONTENT.__observerWarned) {
        window.ASKGPT_CONTENT.__observerWarned = true;
        console.debug("ASKGPT observer script already loaded; skipping.");
    }
} else {
const CTX_OBS = window.ASKGPT_CONTENT;

let lastHtml = "";
let lastCheck = 0;
let stableResolver = null;
let stableRejector = null;
let stableTimer = null;
let timeoutTimer = null;

function getAssistantContainer() {
    // ChatGPT DOM: conversation turn elements contain assistant text.
    const turns = Array.from(document.querySelectorAll('[data-testid="conversation-turn"]'));
    for (let i = turns.length - 1; i >= 0; i--) {
        const el = turns[i];
        const role = el.querySelector('[data-message-author-role="assistant"]');
        if (role) return el;
    }
    // Fallback generic selector for older layouts
    const fallback = Array.from(document.querySelectorAll('[data-message-author-role="assistant"], .markdown')).pop();
    return fallback || null;
}

function hasStopButton() {
    return !!document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop generating"], button:has(svg[data-testid="Stop"])');
}

function evaluateStability() {
    const container = getAssistantContainer();
    const html = container ? container.innerHTML : "";
    const now = Date.now();
    const unchanged = html === lastHtml;
    lastHtml = html;
    if (!unchanged) {
        lastCheck = now;
        return;
    }
    const quietFor = now - lastCheck;
    if (quietFor > 1200 && !hasStopButton() && stableResolver) {
        const text = container ? container.innerText : "";
        stableResolver({ html, text });
        cleanupWaiters();
    }
}

function cleanupWaiters() {
    if (stableTimer) { clearInterval(stableTimer); stableTimer = null; }
    if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    stableResolver = null;
    stableRejector = null;
}

function waitForChatGptStableAnswer(timeoutMs = 15000) {
    cleanupWaiters();
    return new Promise((resolve, reject) => {
        stableResolver = resolve;
        stableRejector = reject;
        lastHtml = "";
        lastCheck = Date.now();
        stableTimer = setInterval(evaluateStability, 250);
        timeoutTimer = setTimeout(() => {
            cleanupWaiters();
            reject(new Error("Timed out waiting for ChatGPT response to stabilize"));
        }, timeoutMs);
    });
}

// Attach a MutationObserver so we wake up immediately on DOM changes.
const observer = new MutationObserver(() => {
    if (!stableResolver) return;
    evaluateStability();
});
observer.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });

CTX_OBS.waitForChatGptStableAnswer = waitForChatGptStableAnswer;
window.ASKGPT_CONTENT.__observerLoaded = true;
window.ASKGPT_CONTENT.__observerWarned = true;
}
