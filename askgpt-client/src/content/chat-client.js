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
    CTX_CHAT.state.modalClosedManually = false;
    const dom = ensureModalDom(text);
    if (!dom) return;
    const { resultDiv, statusContainer, statusText } = dom;

    const userMsg = document.createElement('div');
    userMsg.className = 'askgpt-msg-user';
    userMsg.innerText = promptPrefix.endsWith(':') ? promptPrefix.replace(':', '') : promptPrefix;
    resultDiv.appendChild(userMsg);

    CTX_CHAT.state.currentBotMsgDiv = document.createElement('div');
    CTX_CHAT.state.currentBotMsgDiv.className = 'askgpt-msg-bot';
    CTX_CHAT.state.currentBotMsgDiv.innerHTML = '<span class="askgpt-typing">AI is thinking...</span>';
    resultDiv.appendChild(CTX_CHAT.state.currentBotMsgDiv);

    resultDiv.scrollTop = resultDiv.scrollHeight;

    statusContainer.style.display = 'flex';
    statusText.innerText = "Processing...";

    const port = chrome.runtime.connect({ name: "ask-gpt-port" });

    let finalQuery = "";
    if (text && text.length > 0) {
        finalQuery = `${promptPrefix}\n\nContext:\n"${text}"`;
    } else {
        finalQuery = promptPrefix;
    }

    port.postMessage({ query: finalQuery });

    port.onMessage.addListener((msg) => {
        if (CTX_CHAT.state.modalClosedManually) {
            console.debug("ASKGPT modal closed; ignoring message", msg.status);
            return;
        }
        // Re-hydrate modal DOM if it was removed while the request was in flight.
        let liveResult = document.getElementById('askgpt-result');
        let liveStatusContainer = document.getElementById('askgpt-status-container');
        let liveStatusText = document.getElementById('askgpt-status-text');
        if (!liveResult || !liveStatusContainer || !liveStatusText || !CTX_CHAT.state.currentBotMsgDiv) {
            const domNow = ensureModalDom(text);
            if (!domNow) {
                console.warn("ASKGPT UI missing; ignoring chat message", msg);
                return;
            }
            liveResult = domNow.resultDiv;
            liveStatusContainer = domNow.statusContainer;
            liveStatusText = domNow.statusText;
            // Create a fresh bot message container if the old one is gone.
            if (!CTX_CHAT.state.currentBotMsgDiv) {
                CTX_CHAT.state.currentBotMsgDiv = document.createElement('div');
                CTX_CHAT.state.currentBotMsgDiv.className = 'askgpt-msg-bot';
                liveResult.appendChild(CTX_CHAT.state.currentBotMsgDiv);
            }
        }

        if (msg.status === 'progress') {
            liveStatusText.innerText = "Progress: " + msg.message;
        }
        else if (msg.status === 'success') {
            liveStatusContainer.style.display = 'none';
            if (typeof marked !== 'undefined') {
                CTX_CHAT.state.currentBotMsgDiv.innerHTML = marked.parse(msg.answer);
            } else {
                CTX_CHAT.state.currentBotMsgDiv.innerText = msg.answer;
            }
            liveResult.scrollTop = liveResult.scrollHeight;
        }
        else if (msg.status === 'error') {
            liveStatusContainer.style.display = 'none';
            if (CTX_CHAT.state.currentBotMsgDiv) {
                CTX_CHAT.state.currentBotMsgDiv.innerHTML = `<span style="color:red">Error: ${msg.error}</span>`;
            }
        }
    });
}

CTX_CHAT.triggerAsk = triggerAsk;
CTX_CHAT.waitForChatGptStableAnswer = window.ASKGPT_CONTENT.waitForChatGptStableAnswer;
window.ASKGPT_CONTENT.__chatLoaded = true;
window.ASKGPT_CONTENT.__chatWarned = true;

} // end guard
