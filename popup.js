const port = chrome.runtime.connect({ name: "ask-gpt-port" });
let currentSelection = "";
const statusDiv = document.getElementById('status');
const answerDiv = document.getElementById('answer');
const quoteDiv = document.getElementById('selected-text');

// 1. Mở trang Options khi bấm nút Gear
document.getElementById('open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// 2. Lấy text bôi đen
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => window.getSelection().toString()
    }, (results) => {
        if (results && results[0] && results[0].result && results[0].result.trim().length > 0) {
            currentSelection = results[0].result.trim();
            quoteDiv.innerText = currentSelection;
        } else {
            quoteDiv.innerText = "(Hãy bôi đen văn bản trên trang web trước khi mở Popup)";
            quoteDiv.style.color = "#dc2626";
            quoteDiv.style.fontStyle = "normal";
        }
    });
});

// 3. Bắt sự kiện click nút action
document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!currentSelection) return;
        document.querySelectorAll('.btn-action').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        statusDiv.classList.add('show');
        statusDiv.innerText = "⏳ Đang xử lý...";
        statusDiv.classList.remove('error');
        answerDiv.innerHTML = "";

        const promptPrefix = btn.getAttribute('data-prompt');
        const finalQuery = `${promptPrefix}\n\nRunning Context:\n"${currentSelection}"`;
        port.postMessage({ query: finalQuery });
    });
});

// 4. Nhận kết quả
port.onMessage.addListener((msg) => {
    if (msg.status === 'progress') {
        statusDiv.innerText = "🤖 " + msg.message;
    } 
    else if (msg.status === 'success') {
        statusDiv.classList.remove('show');
        if (typeof marked !== 'undefined') {
            answerDiv.innerHTML = marked.parse(msg.answer);
        } else {
            answerDiv.style.whiteSpace = "pre-wrap";
            answerDiv.innerText = msg.answer; 
        }
    } 
    else if (msg.status === 'error') {
        statusDiv.innerText = "❌ " + msg.error;
        statusDiv.classList.add('error');
    }
});