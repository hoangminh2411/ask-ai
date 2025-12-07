// Main port controller: route provider (API vs web) and orchestrate send/poll

chrome.runtime.onConnect.addListener(async (port) => {
    if (port.name !== "ask-gpt-port") return;

    let disconnected = false;
    port.onDisconnect.addListener(() => { disconnected = true; });
    const safePost = (payload) => { if (disconnected) return; try { port.postMessage(payload); } catch (_) {} };

    port.onMessage.addListener(async (request) => {
        const config = await chrome.storage.sync.get(['provider', 'geminiApiKey']);
        const provider = config.provider || 'chatgpt_web';

        try {
            if (provider === 'gemini_api') {
                await self.ASKGPT_BG.handleGeminiAPI(port, request.query, config.geminiApiKey);
                return;
            }

            const winData = await self.ASKGPT_BG.ensureWindow(provider, port);
            const initialCount = await self.ASKGPT_BG.getMessageCount(winData.tabId, provider);

            safePost({ status: 'progress', message: "Signing in..." });

            const sendRes = await self.ASKGPT_BG.sendTextViaDebugger(winData.windowId, winData.tabId, request.query, provider);
            if (sendRes.error) throw new Error(sendRes.error);

            safePost({ status: 'progress', message: "Waiting for reply..." });

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
                    safePost({ status: 'progress', message: "AI is writing..." });
                    break;
                }
                await new Promise(r => setTimeout(r, 200));
                waitAttempts++;
            }

            self.ASKGPT_BG.pollUntilDone(winData.windowId, winData.tabId, initialCount, provider, port);

        } catch (err) {
            console.error(err);
            safePost({ status: "error", error: err.message });
        }
    });
});
