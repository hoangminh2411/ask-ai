// Chat request handling: render user/bot, connect to background
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__chatLoaded) {
    if (!window.ASKGPT_CONTENT.__chatWarned) {
        window.ASKGPT_CONTENT.__chatWarned = true;
        console.debug("ASKGPT chat script already loaded; skipping.");
    }
} else {
const CTX_CHAT = window.ASKGPT_CONTENT;

function ensureModalDom(text) {
    if (CTX_CHAT.state.modalClosedManually) {
        console.debug("ASKGPT modal closed manually; skip ensureModalDom");
        return null;
    }
    let resultDiv = document.getElementById('askgpt-result');
    let statusContainer = document.getElementById('askgpt-status-container');
    let statusText = document.getElementById('askgpt-status-text');

    if (!resultDiv || !statusContainer || !statusText) {
        const cx = window.innerWidth / 2 - 225;
        const cy = window.innerHeight / 2 - 300;
        CTX_CHAT.showModal(text || "Preparing assistant...", cx, cy);
        resultDiv = document.getElementById('askgpt-result');
        statusContainer = document.getElementById('askgpt-status-container');
        statusText = document.getElementById('askgpt-status-text');
    }

    if (!resultDiv || !statusContainer || !statusText) {
        console.error("ASKGPT modal elements missing; cannot render chat UI");
        return null;
    }

    return { resultDiv, statusContainer, statusText };
}

function triggerAsk(promptPrefix, text) {
    // Redirect asks to the side panel instead of rendering an in-page modal.
    CTX_CHAT.state.modalClosedManually = false;
    let finalQuery = "";
    if (text && text.length > 0) {
        finalQuery = `${promptPrefix}\n\nContext:\n"${text}"`;
    } else {
        finalQuery = promptPrefix;
    }
    chrome.runtime.sendMessage({ action: "askgpt_open_sidepanel" });
    chrome.runtime.sendMessage({
        action: "askgpt_panel_handle",
        selection: text || "",
        finalQuery
    });
}

CTX_CHAT.triggerAsk = triggerAsk;
CTX_CHAT.waitForChatGptStableAnswer = window.ASKGPT_CONTENT.waitForChatGptStableAnswer;
window.ASKGPT_CONTENT.__chatLoaded = true;
window.ASKGPT_CONTENT.__chatWarned = true;

} // end guard
