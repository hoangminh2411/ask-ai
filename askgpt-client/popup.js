const port = chrome.runtime.connect({ name: "ask-gpt-port" });
let currentSelection = "";
const statusDiv = document.getElementById('status');
const answerDiv = document.getElementById('answer');
const quoteDiv = document.getElementById('selected-text');

// 1. Open options when clicking the gear button
document.getElementById('open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// 2. Get selected text from the active tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => window.getSelection().toString()
    }, (results) => {
        if (results && results[0] && results[0].result && results[0].result.trim().length > 0) {
            currentSelection = results[0].result.trim();
            quoteDiv.innerText = currentSelection;
        } else {
            quoteDiv.innerText = "Please select some text on the page before opening the popup.";
            quoteDiv.style.color = "#dc2626";
            quoteDiv.style.fontStyle = "normal";
        }
    });
});

// 3. Handle quick action buttons
document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!currentSelection) return;
        document.querySelectorAll('.btn-action').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        statusDiv.classList.add('show');
        statusDiv.innerText = "Processing...";
        statusDiv.classList.remove('error');
        answerDiv.innerHTML = "";

        const promptPrefix = btn.getAttribute('data-prompt');
        const finalQuery = `${promptPrefix}\n\nRunning Context:\n"${currentSelection}"`;
        port.postMessage({ query: finalQuery });
    });
});

// 4. Receive results
port.onMessage.addListener((msg) => {
    if (msg.status === 'progress') {
        statusDiv.innerText = "Progress: " + msg.message;
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
        statusDiv.innerText = "Error: " + msg.error;
        statusDiv.classList.add('error');
    }
});
