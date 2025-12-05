// === BACKGROUND.JS: FINAL HYBRID (MULTI-PROVIDER + STABLE V7 CORE) ===

console.log("AskGPT Background: Hybrid Core Active.");

// 1. QUẢN LÝ TRẠNG THÁI RIÊNG BIỆT CHO TỪNG LOẠI
const MANAGERS = {
    chatgpt_web: { 
        windowId: null, tabId: null, 
        url: "https://chatgpt.com", 
        matchUrl: "https://chatgpt.com/*" 
    },
    gemini_web: { 
        windowId: null, tabId: null, 
        url: "https://gemini.google.com/app", 
        matchUrl: "https://gemini.google.com/*" 
    }
};

let activeDebuggers = new Set(); 
const SILENT_AUDIO_URL = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIwLjEwMAAAAAAAAAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA';

// =================================================================
// === MODULE 1: UTILS & AUDIO (GIỮ NGUYÊN) ===
// =================================================================
async function injectKeepAliveAudio(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (src) => {
                if (document.getElementById('keep-alive-audio')) return;
                const audio = document.createElement('audio');
                audio.id = 'keep-alive-audio';
                audio.src = src;
                audio.loop = true;
                audio.volume = 0.01; 
                document.body.appendChild(audio);
            },
            args: [SILENT_AUDIO_URL]
        });
    } catch(e) {}
}

async function attachDebugger(tabId) {
    if (activeDebuggers.has(tabId)) return;
    try {
        await chrome.debugger.attach({ tabId }, "1.3");
        activeDebuggers.add(tabId);
        await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    } catch (e) { }
}

async function detachDebugger(tabId) {
    if (!activeDebuggers.has(tabId)) return;
    try {
        await chrome.debugger.detach({ tabId });
        activeDebuggers.delete(tabId);
    } catch (e) { }
}

async function getMessageCount(tabId, provider) {
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: (p) => {
                // Selector đếm số tin nhắn hiện tại để biết đâu là tin nhắn mới
                const sel = p === 'chatgpt_web' ? '.markdown' : '.model-response-text, .message-content';
                return document.querySelectorAll(sel).length;
            },
            args: [provider]
        });
        return result[0]?.result || 0;
    } catch(e) { return 0; }
}

// =================================================================
// === MODULE 2: WINDOW MANAGEMENT (SMART REUSE) ===
// =================================================================
async function ensureWindow(providerKey, port) {
    const mgr = MANAGERS[providerKey];
    if (!mgr) throw new Error("Unknown Provider");

    // 1. Check biến lưu trữ
    if (mgr.windowId) {
        try {
            await chrome.windows.get(mgr.windowId);
            // Quan trọng: Phải focus để đảm bảo trang sẵn sàng nhận lệnh
            await chrome.windows.update(mgr.windowId, { focused: true, state: 'normal' });
            return { windowId: mgr.windowId, tabId: mgr.tabId };
        } catch (e) { mgr.windowId = null; }
    }

    // 2. Scan tìm cửa sổ mồ côi
    try {
        const tabs = await chrome.tabs.query({ url: mgr.matchUrl });
        for (const tab of tabs) {
            const win = await chrome.windows.get(tab.windowId);
            if (win.type === 'popup') {
                mgr.windowId = win.id;
                mgr.tabId = tab.id;
                await chrome.windows.update(mgr.windowId, { focused: true, state: 'normal' });
                return { windowId: mgr.windowId, tabId: mgr.tabId };
            }
        }
    } catch (e) {}

    // 3. Tạo mới
    let leftPos = 0, topPos = 0;
    try {
        const currentWin = await chrome.windows.getLastFocused();
        leftPos = currentWin.left + currentWin.width; 
        topPos = currentWin.top + currentWin.height;
    } catch(e) {}

    const win = await chrome.windows.create({
        url: mgr.url,
        type: "popup",
        width: 150, height: 150, 
        left: leftPos - 150, top: topPos - 150,
        focused: true 
    });

    mgr.windowId = win.id;
    mgr.tabId = win.tabs[0].id;

    if (port) port.postMessage({ status: 'progress', message: `Khởi động ${providerKey}...` });

    // Wait load
    await new Promise(resolve => {
        const listener = (tid, info) => {
            if (tid === mgr.tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });

    // Chờ thêm 1 chút cho UI ổn định
    await new Promise(r => setTimeout(r, 1500));
    return { windowId: mgr.windowId, tabId: mgr.tabId };
}

// =================================================================
// === MODULE 3: INPUT & SEND (DEBUGGER) ===
// =================================================================
async function sendTextViaDebugger(windowId, tabId, text, providerKey) {
    try {
        await chrome.windows.update(windowId, { focused: true });
        await injectKeepAliveAudio(tabId);
        await attachDebugger(tabId);
        
        // 1. Focus Input Box
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (pk) => {
                let el;
                if (pk === 'chatgpt_web') {
                    el = document.querySelector('#prompt-textarea');
                } else {
                    // Gemini Selectors
                    el = document.querySelector('div[contenteditable="true"]') || 
                         document.querySelector('rich-textarea div[contenteditable="true"]');
                }

                if(el) { 
                    el.scrollIntoView({block: "center"}); 
                    el.click(); 
                    // Clean text cũ
                    el.innerHTML = pk === 'chatgpt_web' ? '<p><br></p>' : ''; 
                    el.focus(); 
                    const audio = document.getElementById('keep-alive-audio');
                    if(audio && audio.paused) audio.play().catch(()=>{});
                }
            },
            args: [providerKey]
        });
        
        await new Promise(r => setTimeout(r, 300)); 
        
        // 2. Typing
        await chrome.debugger.sendCommand({ tabId }, "Input.insertText", { text: text });
        await new Promise(r => setTimeout(r, 300)); 

        // 3. Press Enter
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
            type: 'keyDown', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, macCharCode: 13, text: "\r", unmodifiedText: "\r"
        });
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
            type: 'keyUp', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, macCharCode: 13
        });
        
        // 4. Fallback Click Send (Nếu Enter k chạy)
        setTimeout(() => {
            chrome.scripting.executeScript({
                target: { tabId },
                func: (pk) => {
                    let btn;
                    if (pk === 'chatgpt_web') btn = document.querySelector('[data-testid="send-button"]');
                    else btn = document.querySelector('.send-button') || document.querySelector('button[aria-label*="Send"]');
                    
                    if (btn && !btn.disabled) btn.click();
                },
                args: [providerKey]
            }).catch(()=>{});
        }, 500);

        return { success: true };
    } catch (e) { return { error: e.message }; }
}

// =================================================================
// === MODULE 4: POLLING & WAKE UP (CORE LOGIC) ===
// =================================================================

// Hàm check trạng thái (Chạy trong content script)
function checkStatusInPage(initialCount, providerKey) {
    let selector = '.markdown';
    let stopBtnSel = '[data-testid="stop-button"]';
    
    // Config selector cho Gemini
    if (providerKey === 'gemini_web') {
        selector = '.model-response-text, .message-content';
        stopBtnSel = null; // Gemini khó check stop button hơn
    }

    const allBubbles = document.querySelectorAll(selector);
    const currentCount = allBubbles.length;
    let rawLength = 0;
    
    if (currentCount > initialCount) {
        const lastBubble = allBubbles[currentCount - 1];
        // Dùng innerText để lấy độ dài thực tế
        rawLength = (lastBubble.innerText || "").length;
    }

    // Logic ChatGPT
    if (providerKey === 'chatgpt_web') {
        const stopBtn = document.querySelector(stopBtnSel);
        const sendBtn = document.querySelector('[data-testid="send-button"]');
        return { 
            isGenerating: !!stopBtn, 
            isSendReady: !!sendBtn && !sendBtn.disabled, 
            rawLength: rawLength,
            hasText: rawLength > 0
        };
    } 
    // Logic Gemini (Dựa hoàn toàn vào độ ổn định text)
    else {
        return {
            isGenerating: false, // Gemini bỏ qua check nút stop
            isSendReady: true,   // Giả định luôn true
            rawLength: rawLength,
            hasText: rawLength > 0
        }
    }
}

// Logic Poll chính
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
                // 1. Check độ ổn định Text (Quan trọng nhất cho chế độ Minimized)
                if (result.rawLength === lastRawLength) {
                    stableCount++;
                } else {
                    stableCount = 0;
                    lastRawLength = result.rawLength;
                    consecutiveDoneChecks = 0;
                    port.postMessage({ status: 'progress', message: "AI đang viết..." });
                }

                // 2. Điều kiện hoàn thành
                if (providerKey === 'chatgpt_web') {
                    if (!result.isGenerating && result.isSendReady) consecutiveDoneChecks++;
                    else consecutiveDoneChecks = 0;
                    
                    // ChatGPT: Xong khi nút Stop mất VÀ text đứng im
                    if (consecutiveDoneChecks >= 3 || stableCount >= 25) {
                        finish("", true);
                    }
                } else {
                    // Gemini: Xong khi Text đứng im lâu hơn (vì nó hay load từng cục)
                    if (stableCount >= 10) { // ~5 giây không đổi text
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
                // === MAGIC FUNCTION CỦA CODE CŨ ===
                // Lấy HTML -> Tự động Wake Up -> Đọc -> Minimize bên trong hàm này
                const finalHTML = await getFinalHTMLAndClose(windowId, tabId, initialCount, providerKey);
                
                if (finalHTML && finalHTML.length > 0) {
                    port.postMessage({ status: 'success', answer: finalHTML });
                } else {
                    port.postMessage({ status: 'error', error: "Nội dung rỗng." });
                }
            } catch(e) {
                port.postMessage({ status: 'error', error: e.message });
            }
        } else {
            port.postMessage({ status: 'error', error: errorMsg });
        }
        setTimeout(() => detachDebugger(tabId), 1000);
    }
}

// === HÀM WAKE UP (QUAN TRỌNG NHẤT) ===
async function getFinalHTMLAndClose(windowId, tabId, initialCount, providerKey) {
    // 1. WAKE UP: Mở cửa sổ lên để Chrome vẽ lại DOM
    await chrome.windows.update(windowId, { focused: true, state: 'normal' });
    
    // 2. WAIT: Chờ 2s (Code cũ dùng 2s, giữ nguyên cho chắc)
    await new Promise(r => setTimeout(r, 2000)); 

    // 3. READ: Lấy HTML
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

    // 4. HIDE: Ẩn ngay lập tức
    try {
        await chrome.windows.update(windowId, { state: 'minimized' });
    } catch(e) {}

    return result;
}


// =================================================================
// === MODULE 5: API HANDLER ===
// =================================================================
async function handleGeminiAPI(port, query, apiKey) {
    if (!apiKey) throw new Error("Chưa nhập API Key.");
    port.postMessage({ status: 'progress', message: "Đang gửi API..." });
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: query }] }] })
        });
        if (!response.ok) throw new Error("API Error: " + response.statusText);
        const data = await response.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (answer) port.postMessage({ status: 'success', answer: answer });
        else throw new Error("No response");
    } catch (e) { throw e; }
}


// =================================================================
// === MAIN CONTROLLER ===
// =================================================================
chrome.runtime.onConnect.addListener(async (port) => {
    if (port.name !== "ask-gpt-port") return;

    port.onMessage.addListener(async (request) => {
        // Lấy config
        const config = await chrome.storage.sync.get(['provider', 'geminiApiKey']);
        const provider = config.provider || 'chatgpt_web'; // Default

        try {
            // A. XỬ LÝ API
            if (provider === 'gemini_api') {
                await handleGeminiAPI(port, request.query, config.geminiApiKey);
                return;
            }

            // B. XỬ LÝ WEB AUTOMATION (GPT & GEMINI WEB)
            const winData = await ensureWindow(provider, port);
            const initialCount = await getMessageCount(winData.tabId, provider);
            
            port.postMessage({ status: 'progress', message: "Đang nhập..." });
            
            const sendRes = await sendTextViaDebugger(winData.windowId, winData.tabId, request.query, provider);
            if (sendRes.error) throw new Error(sendRes.error);

            port.postMessage({ status: 'progress', message: "Đợi phản hồi..." });
            
            // Wait for start generation
            let waitAttempts = 0;
            while (waitAttempts < 50) { 
                const [{result}] = await chrome.scripting.executeScript({
                    target: {tabId: winData.tabId},
                    func: (startCount, pk) => {
                        const sel = pk === 'chatgpt_web' ? '.markdown' : '.model-response-text, .message-content';
                        const all = document.querySelectorAll(sel);
                        if (all.length > startCount) {
                            return (all[all.length - 1].innerText || "").length >= 1;
                        }
                        return false;
                    },
                    args: [initialCount, provider]
                });
                
                if (result === true) {
                    // Start generating -> MINIMIZE
                    await chrome.windows.update(winData.windowId, { state: 'minimized' });
                    port.postMessage({ status: 'progress', message: "AI đang viết..." });
                    break; 
                }
                await new Promise(r => setTimeout(r, 200));
                waitAttempts++;
            }
            
            // Poll
            pollUntilDone(winData.windowId, winData.tabId, initialCount, provider, port);

        } catch (err) {
            console.error(err);
            port.postMessage({ status: 'error', error: err.message });
        }
    });
});

// Reset kết nối khi user đổi config
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "config_updated") {
        activeDebuggers.clear();
        MANAGERS.chatgpt_web.windowId = null;
        MANAGERS.gemini_web.windowId = null;
    }
});