// Main port controller: route provider (API vs web) and orchestrate send/poll
const { MANAGERS } = self.ASKGPT_BG;
const { ensureWindow } = self.ASKGPT_BG;
const { getMessageCount } = self.ASKGPT_BG;
const { sendTextViaDebugger } = self.ASKGPT_BG;
const { pollUntilDone } = self.ASKGPT_BG;
const { handleGeminiAPI } = self.ASKGPT_BG;

chrome.runtime.onConnect.addListener(async (port) => {
    if (port.name !== "ask-gpt-port") return;

    port.onMessage.addListener(async (request) => {
        const config = await chrome.storage.sync.get(['provider', 'geminiApiKey']);
        const provider = config.provider || 'chatgpt_web';

        try {
            if (provider === 'gemini_api') {
                await handleGeminiAPI(port, request.query, config.geminiApiKey);
                return;
            }

            const winData = await ensureWindow(provider, port);
            const initialCount = await getMessageCount(winData.tabId, provider);

            port.postMessage({ status: 'progress', message: "Đang nhập..." });

            const sendRes = await sendTextViaDebugger(winData.windowId, winData.tabId, request.query, provider);
            if (sendRes.error) throw new Error(sendRes.error);

            port.postMessage({ status: 'progress', message: "Đợi phản hồi..." });

            let waitAttempts = 0;
            while (waitAttempts < 50) {
                const [{ result }] = await chrome.scripting.executeScript({
                    target: { tabId: winData.tabId },
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
                    await chrome.windows.update(winData.windowId, { state: 'minimized' });
                    port.postMessage({ status: 'progress', message: "AI đang viết..." });
                    break;
                }
                await new Promise(r => setTimeout(r, 200));
                waitAttempts++;
            }

            pollUntilDone(winData.windowId, winData.tabId, initialCount, provider, port);

        } catch (err) {
            console.error(err);
            port.postMessage({ status: 'error', error: err.message });
        }
    });
});
