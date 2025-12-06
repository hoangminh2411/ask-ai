// Chat request handling: render user/bot, connect to background
const CTX_CHAT = window.ASKGPT_CONTENT;

function triggerAsk(promptPrefix, text) {
    const resultDiv = document.getElementById('askgpt-result');
    const statusContainer = document.getElementById('askgpt-status-container');
    const statusText = document.getElementById('askgpt-status-text');

    const userMsg = document.createElement('div');
    userMsg.className = 'askgpt-msg-user';
    userMsg.innerText = promptPrefix.endsWith(':') ? promptPrefix.replace(':', '') : promptPrefix;
    resultDiv.appendChild(userMsg);

    CTX_CHAT.state.currentBotMsgDiv = document.createElement('div');
    CTX_CHAT.state.currentBotMsgDiv.className = 'askgpt-msg-bot';
    CTX_CHAT.state.currentBotMsgDiv.innerHTML = '<span class="askgpt-typing">AI đang suy nghĩ...</span>';
    resultDiv.appendChild(CTX_CHAT.state.currentBotMsgDiv);

    resultDiv.scrollTop = resultDiv.scrollHeight;

    statusContainer.style.display = 'flex';
    statusText.innerText = "Đang xử lý...";

    const port = chrome.runtime.connect({ name: "ask-gpt-port" });

    let finalQuery = "";
    if (text && text.length > 0) {
        finalQuery = `${promptPrefix}\n\nContext:\n"${text}"`;
    } else {
        finalQuery = promptPrefix;
    }

    port.postMessage({ query: finalQuery });

    port.onMessage.addListener((msg) => {
        if (msg.status === 'progress') {
            statusText.innerText = "▸ " + msg.message;
        }
        else if (msg.status === 'success') {
            statusContainer.style.display = 'none';

            if (typeof marked !== 'undefined') {
                CTX_CHAT.state.currentBotMsgDiv.innerHTML = marked.parse(msg.answer);
            } else {
                CTX_CHAT.state.currentBotMsgDiv.innerText = msg.answer;
            }

            resultDiv.scrollTop = resultDiv.scrollHeight;
        }
        else if (msg.status === 'error') {
            statusContainer.style.display = 'none';
            CTX_CHAT.state.currentBotMsgDiv.innerHTML = `<span style="color:red">⚠️ ${msg.error}</span>`;
        }
    });
}

CTX_CHAT.triggerAsk = triggerAsk;
