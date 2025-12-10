// Main port controller: route provider (API vs web) and orchestrate send/poll
// v2.0 - Now uses WindowBridge for stable communication

// Feature flag: Use new Bridge system (can be toggled via storage)
const USE_BRIDGE_SYSTEM = true;

chrome.runtime.onConnect.addListener(async (port) => {
    if (port.name !== "ask-gpt-port") return;

    let disconnected = false;
    port.onDisconnect.addListener(() => { disconnected = true; });
    const safePost = (payload) => { if (disconnected) return; try { port.postMessage(payload); } catch (_) { } };

    port.onMessage.addListener(async (request) => {
        const config = await chrome.storage.sync.get(['provider', 'ai_provider', 'geminiApiKey', 'useBridge']);
        // Support both old 'provider' key and new 'ai_provider' key from Model Selector
        const provider = config.ai_provider || config.provider || 'chatgpt_web';
        const useBridge = config.useBridge !== false && USE_BRIDGE_SYSTEM;

        try {
            // Handle Gemini API separately (no window needed)
            if (provider === 'gemini_api') {
                await self.ASKGPT_BG.handleGeminiAPI(port, request.query, config.geminiApiKey);
                return;
            }

            // ========================================
            // NEW: Use WindowBridge for stable communication
            // ========================================
            if (useBridge && self.ASKGPT_BG.createBridgeSession) {
                console.log('[Controller] Using WindowBridge system');

                try {
                    const session = self.ASKGPT_BG.createBridgeSession(provider, port);
                    const response = await session.execute(request.query, {
                        maxRetries: 2,
                        responseTimeout: 120000  // 2 minutes for long responses
                    });

                    // Success is handled inside session.execute() via notifySuccess
                    console.log('[Controller] Bridge completed successfully', session.metrics);
                    return;

                } catch (bridgeError) {
                    console.warn('[Controller] Bridge failed, falling back to legacy:', bridgeError);
                    safePost({ status: 'progress', message: 'Retrying with alternative method...' });
                    // Fall through to legacy method
                }
            }

            // ========================================
            // LEGACY: Original implementation (fallback)
            // ========================================
            console.log('[Controller] Using legacy system');

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
                            const last = all[all.length - 1];
                            // Scroll to keep tab active
                            last.scrollIntoView({ behavior: 'smooth', block: 'end' });
                            return (last.innerText || "").length >= 1;
                        }
                        return false;
                    },
                    args: [initialCount, provider]
                });

                if (result === true) {
                    // DO NOT minimize - keep window active to prevent hibernation
                    await chrome.windows.update(winData.windowId, { focused: true });
                    safePost({ status: 'progress', message: "AI is writing..." });
                    break;
                }
                await new Promise(r => setTimeout(r, 200));
                waitAttempts++;
            }

            self.ASKGPT_BG.pollUntilDone(winData.windowId, winData.tabId, initialCount, provider, port);

        } catch (err) {
            console.error('[Controller] Error:', err);
            safePost({ status: "error", error: err.message });
        }
    });
});
