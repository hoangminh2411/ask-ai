/**
 * Window Communication Bridge
 * Unified layer for stable window/tab automation communication
 * Version: 1.0
 * 
 * Features:
 * - Health check before operations
 * - Adaptive waiting with exponential backoff
 * - State machine for tracking automation states
 * - Event-driven response detection
 * - Retry mechanism with configurable attempts
 */

// ============================================
// STATE MACHINE DEFINITIONS
// ============================================
const BridgeStates = {
    IDLE: 'IDLE',
    PREPARING: 'PREPARING',
    WINDOW_READY: 'WINDOW_READY',
    SENDING: 'SENDING',
    WAITING_RESPONSE: 'WAITING_RESPONSE',
    RESPONSE_STREAMING: 'RESPONSE_STREAMING',
    RESPONSE_COMPLETE: 'RESPONSE_COMPLETE',
    ERROR: 'ERROR',
    TIMEOUT: 'TIMEOUT'
};

// Default configuration - can be overridden per provider
const DEFAULT_CONFIG = {
    maxRetries: 3,
    baseRetryDelay: 500,        // ms
    maxRetryDelay: 5000,        // ms
    healthCheckInterval: 200,   // ms
    healthCheckTimeout: 10000,  // ms
    responseTimeout: 60000,     // ms (1 min)
    stabilityCheckInterval: 250,// ms
    stabilityThreshold: 2000,   // ms - no change means stable
    pollInterval: 500           // ms
};

// Provider-specific configurations
const PROVIDER_CONFIGS = {
    chatgpt_web: {
        selectors: {
            input: '#prompt-textarea',
            // NEW: ChatGPT now uses a single button that changes aria-label
            sendButton: '#composer-submit-button, [data-testid="send-button"]',
            stopButton: 'button[aria-label="Stop streaming"], button[aria-label*="Stop"], [data-testid="stop-button"]',
            response: '.markdown',
            conversationTurn: '[data-testid^="conversation-turn"]',
            streamingIndicator: '.result-streaming, [class*="streaming"]',
            // Additional selectors for better detection
            composerButton: '#composer-submit-button'
        },
        checks: {
            isReady: (doc) => {
                const input = doc.querySelector('#prompt-textarea');
                const btn = doc.querySelector('#composer-submit-button');
                return input && btn;
            },
            isStreaming: (doc) => {
                // NEW: Check aria-label of composer button
                const btn = doc.querySelector('#composer-submit-button');
                if (btn) {
                    const label = btn.getAttribute('aria-label') || '';
                    if (label.toLowerCase().includes('stop')) return true;
                }
                // Fallback checks
                const streaming = doc.querySelector('.result-streaming');
                return !!streaming;
            },
            isComplete: (doc) => {
                // NEW: Complete when button has "Send message" label and is enabled
                const btn = doc.querySelector('#composer-submit-button');
                if (btn) {
                    const label = btn.getAttribute('aria-label') || '';
                    const isSendReady = label.toLowerCase().includes('send') && !btn.disabled;
                    return isSendReady;
                }
                return false;
            }
        },
        responseTimeout: 180000  // 3 mins for very long responses
    },
    gemini_web: {
        selectors: {
            input: 'div[contenteditable="true"], rich-textarea div[contenteditable="true"]',
            sendButton: '.send-button, button[aria-label*="Send"]',
            response: '.model-response-text, .message-content'
        },
        checks: {
            isReady: (doc) => {
                const input = doc.querySelector('div[contenteditable="true"]');
                return !!input;
            },
            isStreaming: (doc) => {
                const loading = doc.querySelector('.loading-indicator, .generating');
                return !!loading;
            },
            isComplete: (doc) => {
                const sendBtn = doc.querySelector('.send-button');
                return sendBtn && !sendBtn.disabled;
            }
        }
    },
    perplexity_web: {
        selectors: {
            // Perplexity uses textarea with specific classes
            input: 'textarea[placeholder], textarea.resize-none',
            // Send button is usually the last button near textarea or has specific SVG
            sendButton: 'button[aria-label*="send" i], button[aria-label*="submit" i], form button:last-of-type, button svg[class*="send"]',
            response: '[class*="prose"], [class*="markdown"], .font-sans.text-base'
        },
        checks: {
            isReady: (doc) => {
                const input = doc.querySelector('textarea');
                return !!input;
            },
            isStreaming: (doc) => {
                const indicators = doc.querySelectorAll('.animate-pulse, .animate-spin, [class*="cursor-"]');
                if (indicators.length > 0) return true;
                return false;
            },
            isComplete: (doc) => {
                const streaming = doc.querySelectorAll('.animate-pulse, .animate-spin');
                return streaming.length === 0;
            }
        },
        responseTimeout: 120000,
        stabilityThreshold: 3000,
        // Use Enter key to send instead of clicking button
        useEnterToSend: true
    },
    copilot_web: {
        selectors: {
            // Copilot (Microsoft) uses shadow DOM sometimes
            input: '#searchbox, textarea, [contenteditable="true"]',
            sendButton: 'button[type="submit"], button[aria-label*="Send" i], .submit-button',
            response: '.ac-container, .response-message, [class*="message"]'
        },
        checks: {
            isReady: (doc) => !!doc.querySelector('#searchbox, textarea, [contenteditable="true"]'),
            isStreaming: (doc) => !!doc.querySelector('.typing-indicator, [class*="loading"], [class*="typing"]'),
            isComplete: (doc) => !doc.querySelector('.typing-indicator, [class*="loading"]')
        },
        responseTimeout: 120000,
        useEnterToSend: true
    },
    grok_web: {
        selectors: {
            // Grok (X.AI)
            input: 'textarea, [contenteditable="true"]',
            sendButton: 'button[type="submit"], button[aria-label*="Send" i]',
            response: '[class*="message"], [class*="response"]'
        },
        checks: {
            isReady: (doc) => !!doc.querySelector('textarea'),
            isStreaming: (doc) => !!doc.querySelector('[class*="generating"], [class*="loading"]'),
            isComplete: (doc) => !doc.querySelector('[class*="generating"], [class*="loading"]')
        },
        responseTimeout: 120000,
        useEnterToSend: true
    }
};

// ============================================
// BRIDGE SESSION CLASS
// ============================================
class WindowBridgeSession {
    constructor(providerKey, port = null) {
        this.providerKey = providerKey;
        this.port = port;
        this.state = BridgeStates.IDLE;
        this.windowId = null;
        this.tabId = null;
        this.config = { ...DEFAULT_CONFIG, ...PROVIDER_CONFIGS[providerKey] };
        this.retryCount = 0;
        this.lastError = null;
        this.startTime = null;
        this.metrics = {
            healthCheckDuration: 0,
            sendDuration: 0,
            responseDuration: 0,
            totalDuration: 0
        };
        this._abortController = null;
    }

    // --- State Management ---
    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        console.debug(`[WindowBridge] ${this.providerKey}: ${oldState} -> ${newState}`);
        this.notifyProgress(`State: ${newState}`);
    }

    notifyProgress(message) {
        if (this.port) {
            try {
                this.port.postMessage({ status: 'progress', message });
            } catch (e) { }
        }
    }

    notifyError(error) {
        if (this.port) {
            try {
                this.port.postMessage({ status: 'error', error });
            } catch (e) { }
        }
    }

    notifySuccess(answer) {
        if (this.port) {
            try {
                this.port.postMessage({ status: 'success', answer });
            } catch (e) { }
        }
    }

    // --- Utility: Exponential Backoff ---
    getRetryDelay() {
        const delay = Math.min(
            this.config.baseRetryDelay * Math.pow(2, this.retryCount),
            this.config.maxRetryDelay
        );
        return delay + Math.random() * 200; // Add jitter
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- Health Check: Verify Window is Ready ---
    async healthCheck(tabId) {
        const startTime = Date.now();
        const timeout = this.config.healthCheckTimeout;
        const interval = this.config.healthCheckInterval;

        return new Promise(async (resolve, reject) => {
            let elapsed = 0;

            while (elapsed < timeout) {
                try {
                    const [{ result }] = await chrome.scripting.executeScript({
                        target: { tabId },
                        func: (checkFnStr) => {
                            // Evaluate the check function in page context
                            const doc = document;
                            // Basic readiness: DOM loaded
                            if (document.readyState !== 'complete') return { ready: false, reason: 'dom_loading' };

                            // Check for common error states
                            const errorEl = doc.querySelector('[class*="error"], [class*="Error"]');
                            if (errorEl && errorEl.innerText.toLowerCase().includes('error')) {
                                return { ready: false, reason: 'page_error', error: errorEl.innerText };
                            }

                            // Provider-specific readiness
                            return { ready: true };
                        },
                        args: []
                    });

                    if (result.ready) {
                        this.metrics.healthCheckDuration = Date.now() - startTime;
                        resolve(true);
                        return;
                    }

                    if (result.error) {
                        reject(new Error(`Page error: ${result.error}`));
                        return;
                    }
                } catch (e) {
                    // Tab might not be ready yet, continue waiting
                }

                await this.sleep(interval);
                elapsed = Date.now() - startTime;
            }

            reject(new Error(`Health check timeout after ${timeout}ms`));
        });
    }

    // --- Enhanced Window Ready Check ---
    async waitForWindowReady(tabId, providerKey) {
        const selectors = this.config.selectors || PROVIDER_CONFIGS[providerKey]?.selectors || {};
        const inputSelector = selectors.input || '#prompt-textarea';

        const startTime = Date.now();
        const timeout = this.config.healthCheckTimeout;

        return new Promise(async (resolve, reject) => {
            let elapsed = 0;

            while (elapsed < timeout) {
                try {
                    const [{ result }] = await chrome.scripting.executeScript({
                        target: { tabId },
                        func: (inputSel) => {
                            const input = document.querySelector(inputSel);
                            if (!input) return { ready: false, reason: 'input_not_found' };

                            // Check if input is visible and interactable
                            const rect = input.getBoundingClientRect();
                            const isVisible = rect.width > 0 && rect.height > 0;
                            const style = window.getComputedStyle(input);
                            const isInteractable = style.display !== 'none' &&
                                style.visibility !== 'hidden' &&
                                !input.disabled;

                            if (!isVisible || !isInteractable) {
                                return { ready: false, reason: 'input_not_interactable' };
                            }

                            return { ready: true, inputFound: true };
                        },
                        args: [inputSelector]
                    });

                    if (result.ready) {
                        resolve(true);
                        return;
                    }

                    this.notifyProgress(`Waiting for window: ${result.reason}`);
                } catch (e) {
                    // Continue waiting
                }

                await this.sleep(this.config.healthCheckInterval);
                elapsed = Date.now() - startTime;
            }

            reject(new Error('Window ready timeout'));
        });
    }

    // --- Send Message with Retries ---
    async sendMessage(text, options = {}) {
        const maxRetries = options.maxRetries || this.config.maxRetries;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            this.retryCount = attempt;

            if (attempt > 0) {
                const delay = this.getRetryDelay();
                this.notifyProgress(`Retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms...`);
                await this.sleep(delay);
            }

            try {
                const result = await this._attemptSend(text);
                if (result.success) {
                    return result;
                }
                lastError = result.error;
            } catch (e) {
                lastError = e.message;
            }
        }

        throw new Error(`Failed after ${maxRetries + 1} attempts: ${lastError}`);
    }

    async _attemptSend(text) {
        this.setState(BridgeStates.SENDING);
        const sendStart = Date.now();

        try {
            // Focus window
            await chrome.windows.update(this.windowId, { focused: true });

            // Inject keep-alive if available
            if (self.ASKGPT_BG?.injectKeepAliveAudio) {
                await self.ASKGPT_BG.injectKeepAliveAudio(this.tabId);
            }

            // Attach debugger
            if (self.ASKGPT_BG?.attachDebugger) {
                await self.ASKGPT_BG.attachDebugger(this.tabId);
            }

            // Clear input and focus
            const selectors = this.config.selectors || {};
            await chrome.scripting.executeScript({
                target: { tabId: this.tabId },
                func: (inputSel, pk) => {
                    const el = document.querySelector(inputSel);
                    if (el) {
                        el.scrollIntoView({ block: 'center' });
                        el.click();
                        el.innerHTML = pk === 'chatgpt_web' ? '<p><br></p>' : '';
                        el.focus();
                    }
                },
                args: [selectors.input || '#prompt-textarea', this.providerKey]
            });

            await this.sleep(200);

            // Insert text via debugger
            await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Input.insertText', { text });
            await this.sleep(200);

            // Press Enter
            await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Input.dispatchKeyEvent', {
                type: 'keyDown',
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13,
                text: '\r'
            });
            await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13
            });

            // Fallback: click send button after a short delay
            setTimeout(async () => {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: this.tabId },
                        func: (btnSel) => {
                            const btn = document.querySelector(btnSel);
                            if (btn && !btn.disabled) btn.click();
                        },
                        args: [selectors.sendButton || '[data-testid="send-button"]']
                    });
                } catch (e) { }
            }, 400);

            this.metrics.sendDuration = Date.now() - sendStart;
            return { success: true };

        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // --- Keep Tab Alive: Periodic scroll to prevent hibernation ---
    async _keepTabAlive() {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: this.tabId },
                func: () => {
                    // Scroll to bottom of conversation to keep tab active
                    const scrollContainers = [
                        document.querySelector('[class*="react-scroll-to-bottom"]'),
                        document.querySelector('[class*="overflow-y-auto"]'),
                        document.querySelector('main'),
                        document.documentElement
                    ];

                    for (const container of scrollContainers) {
                        if (container) {
                            container.scrollTop = container.scrollHeight;
                            break;
                        }
                    }

                    // Also trigger a small mouse movement event to keep page active
                    document.dispatchEvent(new MouseEvent('mousemove', {
                        bubbles: true,
                        clientX: Math.random() * 100,
                        clientY: Math.random() * 100
                    }));
                }
            });
        } catch (e) {
            // Ignore scroll errors
        }
    }

    // --- Wait for Response with Stability Detection ---
    async waitForResponse(initialCount, options = {}) {
        this.setState(BridgeStates.WAITING_RESPONSE);
        const timeout = options.timeout || this.config.responseTimeout;
        const stabilityThreshold = options.stabilityThreshold || this.config.stabilityThreshold;
        const responseStart = Date.now();

        // Start keep-alive interval (scroll every 2 seconds)
        const keepAliveInterval = setInterval(() => this._keepTabAlive(), 2000);

        return new Promise(async (resolve, reject) => {
            let lastHtml = '';
            let lastTextLength = 0;
            let lastChangeTime = Date.now();
            let hasStartedStreaming = false;
            let stabilityCheckCount = 0;

            const checkInterval = setInterval(async () => {
                const elapsed = Date.now() - responseStart;

                if (elapsed > timeout) {
                    clearInterval(checkInterval);
                    clearInterval(keepAliveInterval);

                    // On timeout, try to return what we have instead of failing
                    try {
                        const [{ result: finalResult }] = await chrome.scripting.executeScript({
                            target: { tabId: this.tabId },
                            func: (startCount) => {
                                // Get the FULL response from conversation turn
                                const turns = document.querySelectorAll('[data-testid="conversation-turn"]');
                                const lastTurn = turns[turns.length - 1];
                                const assistantRole = lastTurn?.querySelector('[data-message-author-role="assistant"]');

                                if (assistantRole) {
                                    // Get the entire message content, not just markdown
                                    const messageContent = lastTurn.querySelector('.markdown') ||
                                        lastTurn.querySelector('[class*="message"]') ||
                                        assistantRole;
                                    return {
                                        html: messageContent?.innerHTML || '',
                                        text: messageContent?.innerText || ''
                                    };
                                }

                                // Fallback to markdown
                                const markdowns = document.querySelectorAll('.markdown');
                                const last = markdowns[markdowns.length - 1];
                                return {
                                    html: last?.innerHTML || '',
                                    text: last?.innerText || ''
                                };
                            },
                            args: [initialCount]
                        });

                        if (finalResult.text && finalResult.text.length > 10) {
                            console.debug('[WindowBridge] Timeout but returning partial response');
                            resolve({
                                html: finalResult.html,
                                text: finalResult.text,
                                partial: true,
                                metrics: { ...this.metrics }
                            });
                            return;
                        }
                    } catch (e) { }

                    reject(new Error(`Response timeout after ${timeout}ms`));
                    return;
                }

                try {
                    const [{ result }] = await chrome.scripting.executeScript({
                        target: { tabId: this.tabId },
                        func: (startCount, selectors) => {
                            // Get conversation turns - use prefix selector for dynamic IDs
                            const turns = document.querySelectorAll('[data-testid^="conversation-turn"]');
                            const markdowns = document.querySelectorAll(selectors.response);
                            const hasNewResponse = markdowns.length > startCount;

                            let fullHtml = '';
                            let fullText = '';

                            if (hasNewResponse && turns.length > 0) {
                                // Get the last assistant turn
                                const lastTurn = turns[turns.length - 1];
                                const isAssistant = lastTurn?.querySelector('[data-message-author-role="assistant"]');

                                if (isAssistant) {
                                    // Get ALL content from this turn (handles code blocks, lists, etc.)
                                    const messageContent = lastTurn.querySelector('.markdown');
                                    if (messageContent) {
                                        fullHtml = messageContent.innerHTML;
                                        fullText = messageContent.innerText;
                                    }
                                }
                            }

                            // Fallback to direct markdown if turn-based didn't work
                            if (!fullHtml && hasNewResponse) {
                                const lastMarkdown = markdowns[markdowns.length - 1];
                                fullHtml = lastMarkdown?.innerHTML || '';
                                fullText = lastMarkdown?.innerText || '';
                            }

                            // === NEW DETECTION LOGIC ===
                            // ChatGPT uses a SINGLE button #composer-submit-button that changes aria-label
                            const composerBtn = document.querySelector('#composer-submit-button');
                            let isStreaming = false;
                            let isSendReady = false;
                            let buttonLabel = '';

                            if (composerBtn) {
                                buttonLabel = composerBtn.getAttribute('aria-label') || '';
                                // Streaming if button says "Stop streaming" or similar
                                isStreaming = buttonLabel.toLowerCase().includes('stop');
                                // Ready if button says "Send message" and is enabled
                                isSendReady = buttonLabel.toLowerCase().includes('send') && !composerBtn.disabled;
                            }

                            // Fallback: check old selectors
                            if (!composerBtn) {
                                const stopBtn = document.querySelector(selectors.stopButton);
                                const streamingEl = document.querySelector(selectors.streamingIndicator);
                                isStreaming = !!stopBtn || !!streamingEl;

                                const sendBtn = document.querySelector(selectors.sendButton);
                                isSendReady = sendBtn && !sendBtn.disabled && !stopBtn;
                            }

                            return {
                                hasNewResponse,
                                html: fullHtml,
                                text: fullText,
                                textLength: fullText.length,
                                isStreaming,
                                isSendReady,
                                buttonLabel,
                                responseCount: markdowns.length
                            };
                        },
                        args: [initialCount, this.config.selectors || PROVIDER_CONFIGS.chatgpt_web.selectors]
                    });

                    // Update state based on result
                    if (result.textLength > 0 && !hasStartedStreaming) {
                        hasStartedStreaming = true;
                        this.setState(BridgeStates.RESPONSE_STREAMING);
                        this.notifyProgress('AI is generating response...');
                    }

                    // === PRIMARY DETECTION: Text length stability ===
                    // If text length hasn't changed for X seconds, AI has finished
                    const textChanged = result.textLength !== lastTextLength;

                    if (textChanged) {
                        // Text is still growing - reset stability counter
                        lastHtml = result.html;
                        lastTextLength = result.textLength;
                        lastChangeTime = Date.now();
                        stabilityCheckCount = 0;

                        // Show progress with text growth
                        this.notifyProgress(`Receiving... ${result.textLength} chars (${Math.round(elapsed / 1000)}s)`);
                    } else {
                        // Text hasn't changed - increment stability counter
                        stabilityCheckCount++;
                    }

                    // Calculate time since last text change
                    const timeSinceChange = Date.now() - lastChangeTime;

                    // === COMPLETION CONDITIONS ===
                    // PRIMARY: Text has stopped growing for stabilityThreshold time AND we have content
                    const hasContent = result.textLength > 10 && hasStartedStreaming;
                    const textIsStable = timeSinceChange > stabilityThreshold && stabilityCheckCount >= 4;

                    // SECONDARY: Button confirms completion (optional, for extra confidence)
                    const buttonConfirms = result.isSendReady && !result.isStreaming;

                    // Complete if:
                    // 1. Text is stable AND has content AND (button confirms OR very stable)
                    const veryStable = timeSinceChange > (stabilityThreshold * 2);
                    const isComplete = hasContent && textIsStable && (buttonConfirms || veryStable);

                    if (isComplete) {
                        clearInterval(checkInterval);
                        clearInterval(keepAliveInterval);
                        this.setState(BridgeStates.RESPONSE_COMPLETE);
                        this.metrics.responseDuration = Date.now() - responseStart;

                        console.debug(`[WindowBridge] Response complete: ${result.textLength} chars, stable for ${timeSinceChange}ms`);
                        console.debug(`[WindowBridge] Button: "${result.buttonLabel}", isSendReady: ${result.isSendReady}`);

                        resolve({
                            html: result.html,
                            text: result.text,
                            metrics: { ...this.metrics }
                        });
                        return;
                    }

                    // Debug log every 10 checks
                    if (stabilityCheckCount > 0 && stabilityCheckCount % 10 === 0) {
                        console.debug(`[WindowBridge] Waiting... stable for ${timeSinceChange}ms, checks: ${stabilityCheckCount}, button: "${result.buttonLabel}"`);
                    }

                } catch (e) {
                    // Tab might be busy, continue waiting
                    console.debug('[WindowBridge] Check error:', e.message);
                }
            }, this.config.stabilityCheckInterval);

            // Set absolute timeout with cleanup
            setTimeout(() => {
                clearInterval(checkInterval);
                clearInterval(keepAliveInterval);
                if (this.state !== BridgeStates.RESPONSE_COMPLETE) {
                    reject(new Error(`Absolute timeout after ${timeout}ms`));
                }
            }, timeout);
        });
    }

    // --- Full Automation Flow ---
    async execute(text, options = {}) {
        this.startTime = Date.now();
        this.setState(BridgeStates.PREPARING);

        try {
            // 1. Ensure window exists and is ready
            const winData = await self.ASKGPT_BG.ensureWindow(this.providerKey, this.port);
            this.windowId = winData.windowId;
            this.tabId = winData.tabId;

            // 2. Health check
            await this.healthCheck(this.tabId);
            await this.waitForWindowReady(this.tabId, this.providerKey);
            this.setState(BridgeStates.WINDOW_READY);

            // 3. Get initial message count
            const initialCount = await self.ASKGPT_BG.getMessageCount(this.tabId, this.providerKey);

            // 4. Send message with retries
            await this.sendMessage(text, options);

            // 5. Wait for response start (new bubble appears)
            await this._waitForResponseStart(initialCount);

            // 6. Wait for response completion
            const response = await this.waitForResponse(initialCount, options);

            // 7. Cleanup
            this.metrics.totalDuration = Date.now() - this.startTime;
            this.notifySuccess(response.html);

            // Close window after success
            setTimeout(() => this._cleanup(), 1000);

            return response;

        } catch (error) {
            this.setState(BridgeStates.ERROR);
            this.lastError = error.message;
            this.notifyError(error.message);
            throw error;
        }
    }

    async _waitForResponseStart(initialCount, timeout = 20000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const [{ result }] = await chrome.scripting.executeScript({
                    target: { tabId: this.tabId },
                    func: (startCount, sel) => {
                        const els = document.querySelectorAll(sel);
                        if (els.length > startCount) {
                            const last = els[els.length - 1];
                            // Scroll to see the response
                            last.scrollIntoView({ behavior: 'smooth', block: 'end' });
                            return (last.innerText || '').length > 0;
                        }
                        return false;
                    },
                    args: [initialCount, this.config.selectors?.response || '.markdown']
                });

                if (result === true) {
                    // DO NOT minimize - keep window visible and active
                    // Just ensure it's focused for proper rendering
                    try {
                        await chrome.windows.update(this.windowId, { focused: true });
                    } catch (e) { }

                    this.notifyProgress('AI started responding...');
                    return true;
                }
            } catch (e) { }

            await this.sleep(200);
        }

        throw new Error('Timeout waiting for response to start');
    }

    async _cleanup() {
        try {
            if (self.ASKGPT_BG?.detachDebugger) {
                await self.ASKGPT_BG.detachDebugger(this.tabId);
            }
            await chrome.windows.remove(this.windowId);

            // Clear manager state
            const manager = self.ASKGPT_BG?.MANAGERS?.[this.providerKey];
            if (manager && manager.windowId === this.windowId) {
                manager.windowId = null;
                manager.tabId = null;
            }
        } catch (e) {
            console.debug('[WindowBridge] Cleanup error:', e);
        }
    }

    // --- Abort current operation ---
    abort() {
        this.setState(BridgeStates.IDLE);
        if (this._abortController) {
            this._abortController.abort();
        }
    }
}

// ============================================
// FACTORY FUNCTION
// ============================================
function createBridgeSession(providerKey, port = null) {
    return new WindowBridgeSession(providerKey, port);
}

// ============================================
// QUICK API FOR COMMON OPERATIONS
// ============================================
async function sendAndWait(providerKey, text, port = null, options = {}) {
    const session = createBridgeSession(providerKey, port);
    return session.execute(text, options);
}

// ============================================
// EXPORT TO GLOBAL SCOPE
// ============================================
self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    WindowBridgeSession,
    createBridgeSession,
    sendAndWait,
    BridgeStates,
    PROVIDER_CONFIGS
});
