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
        // Nếu có nút Stop -> Đang chạy
        const stopBtn = document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop generating"]');
        if (stopBtn) return true;

        // Nếu nút Send bị disabled -> Đang chạy (hoặc chưa nhập gì, nhưng trong ngữ cảnh này là đang chạy)
        const sendBtn = document.querySelector('[data-testid="send-button"]');
        if (sendBtn && sendBtn.disabled && !sendBtn.hasAttribute('disabled')) {
            // ChatGPT web đôi khi dùng class disabled thay vì attribute
            // Nhưng thường nút stop button là chỉ báo tốt nhất
        }

        // Check thêm class streaming
        const streaming = document.querySelector('.result-streaming');
        if (streaming) return true;

        return false;
    }

    function evaluateStability() {
        const container = getAssistantContainer();
        const html = container ? container.innerHTML : "";
        const now = Date.now();

        // 1. Dấu hiệu "Đang suy nghĩ" Global (Stop btn)
        if (hasStopButton()) {
            lastHtml = html;
            lastCheck = now;
            return;
        }

        // 1b. Dấu hiệu "Streaming" Local (Class .result-streaming trong message cuối)
        // Đây là dấu hiệu chính xác nhất để biết text có đang chạy hay không
        if (container && (container.classList.contains('result-streaming') || container.querySelector('.result-streaming'))) {
            lastHtml = html;
            lastCheck = now;
            return;
        }

        // 2. Nếu nội dung thay đổi -> Reset timer
        if (html !== lastHtml) {
            lastHtml = html;
            lastCheck = now;
            return;
        }

        // 3. Nếu mọi thứ ĐỨNG YÊN (Quiet)
        const quietFor = now - lastCheck;

        // Tăng độ trễ an toàn lên 2000ms (2 giây) để tránh mạng lag
        if (quietFor > 2000 && stableResolver) {
            const text = container ? container.innerText : "";

            // Double check: Nút send đã hiện và enable chưa?
            const sendBtn = document.querySelector('[data-testid="send-button"]');

            // CHÍNH XÁC TUYỆT ĐỐI: Chỉ resolve khi nút Send SẴN SÀNG
            if (sendBtn && !sendBtn.disabled) {
                stableResolver({ html, text });
                cleanupWaiters();
                return;
            }

            // Fallback: Nếu quá lâu (4s) mà vẫn im lặng -> Coi như xong (phòng trường hợp nút Send không tìm thấy)
            if (quietFor > 4000) {
                stableResolver({ html, text });
                cleanupWaiters();
            }
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
