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
            // Perplexity uses various input types - try multiple
            input: 'textarea, [contenteditable="true"], input[type="text"], [role="textbox"]',
            // Send button - multiple patterns
            sendButton: 'button[aria-label*="send" i], button[aria-label*="submit" i], button[aria-label*="ask" i], form button:last-of-type',
            // Stop button for streaming detection
            stopButton: 'button[aria-label*="stop" i], button[aria-label*="cancel" i]',
            // Response containers - Perplexity uses prose classes
            response: '[class*="prose"], .markdown-content, [class*="response"], article, .font-sans.text-base, [class*="answer"]'
        },
        checks: {
            isReady: (doc) => {
                // Try multiple input types
                const input = doc.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
                return !!input;
            },
            isStreaming: (doc) => {
                const spinners = doc.querySelectorAll('.animate-pulse, .animate-spin, [class*="loading"], [class*="streaming"]');
                if (spinners.length > 0) return true;
                const stopBtn = doc.querySelector('button[aria-label*="stop" i]');
                return !!stopBtn;
            },
            isComplete: (doc) => {
                const streaming = doc.querySelectorAll('.animate-pulse, .animate-spin, [class*="loading"]');
                if (streaming.length > 0) return false;
                const stopBtn = doc.querySelector('button[aria-label*="stop" i]');
                return !stopBtn;
            }
        },
        responseTimeout: 120000,
        stabilityThreshold: 4000,
        healthCheckTimeout: 20000,  // Longer timeout for Perplexity to load
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
    constructor(workerId, port = null) {
        // Support clone workers: chatgpt_web_2 -> baseProvider is chatgpt_web
        const isClone = /_\d+$/.test(workerId);
        this.workerId = workerId;  // Full worker ID (e.g., chatgpt_web_2)
        this.providerKey = isClone ? workerId.replace(/_\d+$/, '') : workerId;  // Base provider for config
        this.isClone = isClone;

        this.port = port;
        this.state = BridgeStates.IDLE;
        this.windowId = null;
        this.tabId = null;
        this.config = { ...DEFAULT_CONFIG, ...PROVIDER_CONFIGS[this.providerKey] };
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

    notifySuccess(answer, meta = {}) {
        if (this.port) {
            try {
                // Get worker config for identity info
                const workerConfig = PROVIDER_CONFIGS[this.providerKey] || {};

                this.port.postMessage({
                    status: 'success',
                    answer,
                    // Worker Identity - standardized response format
                    worker: {
                        id: this.providerKey,
                        name: workerConfig.name || this.providerKey,
                        shortName: workerConfig.shortName || '',
                        icon: workerConfig.icon || '🤖',
                        color: workerConfig.color || '#6b7280'
                    },
                    // Response metadata
                    meta: {
                        responseTime: this.metrics?.responseDuration || 0,
                        ...meta
                    }
                });
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

    // --- SMART ELEMENT DETECTION (Self-Healing) ---

    /**
     * Get selector for an element type, using ElementDetector as fallback
     * @param {string} elementType - 'input', 'submit', 'response', 'loading'
     * @returns {string|null} - The selector to use
     */
    async getSmartSelector(elementType) {
        // 1. Try hardcoded selector first (faster)
        const hardcodedMap = {
            'input': this.config.selectors?.input,
            'submit': this.config.selectors?.sendButton,
            'response': this.config.selectors?.response,
            'loading': this.config.selectors?.streamingIndicator || this.config.selectors?.stopButton
        };

        const hardcoded = hardcodedMap[elementType];

        // If we have tabId, try to verify the selector works
        if (this.tabId && hardcoded) {
            const works = await this._testSelector(hardcoded);
            if (works) {
                return hardcoded;
            }
            console.log(`[WindowBridge] Hardcoded selector failed for ${elementType}, trying smart detection...`);
        } else if (hardcoded) {
            // No tabId yet, trust hardcoded
            return hardcoded;
        }

        // 2. Fallback to ElementDetector
        const detector = self.ASKGPT_BG?.elementDetector;
        if (detector && this.tabId) {
            const result = await detector.detectElement(this.tabId, this.providerKey, elementType);
            if (result?.selector) {
                console.log(`[WindowBridge] Smart detection found ${elementType}: ${result.selector}`);
                return result.selector;
            }
        }

        // 3. Return hardcoded anyway as last resort
        return hardcoded || null;
    }

    /**
     * Test if a selector finds an element in the current tab
     */
    async _testSelector(selector) {
        if (!this.tabId || !selector) return false;

        try {
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: this.tabId },
                func: (sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                },
                args: [selector]
            });
            return result?.result || false;
        } catch (e) {
            return false;
        }
    }

    /**
     * Self-heal: Re-detect all elements when operations fail
     */
    async selfHeal() {
        const detector = self.ASKGPT_BG?.elementDetector;
        if (!detector || !this.tabId) return false;

        console.log(`[WindowBridge] Self-healing ${this.providerKey}...`);
        this.notifyProgress('🔧 Detecting UI elements...');

        const results = await detector.healWorker(this.tabId, this.providerKey);

        // Update config with new selectors
        if (results.input?.selector) {
            this.config.selectors = this.config.selectors || {};
            this.config.selectors.input = results.input.selector;
        }
        if (results.submit?.selector) {
            this.config.selectors.sendButton = results.submit.selector;
        }
        if (results.response?.selector) {
            this.config.selectors.response = results.response.selector;
        }

        const successCount = Object.values(results).filter(r => r?.selector).length;
        console.log(`[WindowBridge] Self-heal found ${successCount}/4 elements`);

        return successCount >= 2; // At least input and response
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

        console.log(`[WindowBridge] waitForWindowReady: using selector "${inputSelector}" for ${providerKey}`);

        const startTime = Date.now();
        const timeout = this.config.healthCheckTimeout || 10000;

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

            // Wait for input element to be ready (important for Perplexity after conversation transition)
            const selectors = this.config.selectors || {};
            let inputFound = false;
            let waitAttempts = 0;
            const maxWaitAttempts = 20; // 4 seconds max

            // For Perplexity: scroll to bottom first to ensure input is visible
            if (this.providerKey === 'perplexity_web') {
                await chrome.scripting.executeScript({
                    target: { tabId: this.tabId },
                    func: () => {
                        // Scroll the main container to bottom
                        window.scrollTo(0, document.body.scrollHeight);
                        const scrollContainers = document.querySelectorAll('[class*="overflow"], main, [class*="scroll"]');
                        scrollContainers.forEach(c => {
                            try { c.scrollTop = c.scrollHeight; } catch (e) { }
                        });
                        console.log('[Perplexity] Scrolled to bottom');
                    }
                });
                await this.sleep(500); // Wait for scroll to settle
            }

            while (!inputFound && waitAttempts < maxWaitAttempts) {
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: this.tabId },
                    func: (inputSel, pk) => {
                        // For Perplexity: look for the input at the bottom of the page
                        if (pk === 'perplexity_web') {
                            // Try multiple selectors for Perplexity conversation page
                            const selectors = [
                                'textarea[placeholder]', // Most common
                                'textarea',
                                '[contenteditable="true"]:not([aria-hidden])',
                                '[role="textbox"]',
                                '.ProseMirror'
                            ];

                            for (const sel of selectors) {
                                const elements = document.querySelectorAll(sel);
                                // Get the LAST one (most likely the input at bottom)
                                const el = elements[elements.length - 1];
                                if (el) {
                                    const rect = el.getBoundingClientRect();
                                    const isVisible = rect.width > 0 && rect.height > 0 && rect.bottom > 0;

                                    if (isVisible) {
                                        // DON'T scroll - just focus directly
                                        el.focus();

                                        // Clear content properly
                                        if (el.tagName === 'TEXTAREA') {
                                            el.value = '';
                                            el.dispatchEvent(new Event('input', { bubbles: true }));
                                        } else if (el.tagName === 'INPUT') {
                                            el.value = '';
                                        } else {
                                            // For contenteditable
                                            el.innerHTML = '';
                                        }

                                        console.log('[Perplexity] Input found and focused:', sel, 'at y:', rect.top);
                                        return { found: true, selector: sel };
                                    }
                                }
                            }
                            return { found: false };
                        }

                        // For other providers
                        const el = document.querySelector(inputSel);
                        if (el) {
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                el.scrollIntoView({ block: 'center' });
                                el.click();
                                el.focus();

                                if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                                    el.value = '';
                                } else {
                                    el.innerHTML = pk === 'chatgpt_web' ? '<p><br></p>' : '';
                                }

                                console.log('[WindowBridge] Input found:', inputSel);
                                return { found: true, selector: inputSel };
                            }
                        }
                        return { found: false };
                    },
                    args: [selectors.input || '#prompt-textarea', this.providerKey]
                });

                if (result?.result?.found) {
                    inputFound = true;
                    console.log('[WindowBridge] Input ready after', waitAttempts, 'attempts');
                } else {
                    waitAttempts++;
                    await this.sleep(200);
                }
            }

            if (!inputFound) {
                console.warn('[WindowBridge] Input not found after waiting');
                // Try one more time with smart detection fallback
                await chrome.scripting.executeScript({
                    target: { tabId: this.tabId },
                    func: () => {
                        // Last resort: find ANY visible input/textarea
                        const inputs = document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]');
                        for (const el of inputs) {
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 100 && rect.height > 20) {
                                el.scrollIntoView({ block: 'center' });
                                el.click();
                                el.focus();
                                console.log('[WindowBridge] Fallback input:', el.tagName, el.className);
                                return true;
                            }
                        }
                        return false;
                    }
                });
            }

            await this.sleep(200);

            // === RE-ATTACH DEBUGGER before inserting text ===
            // This is crucial for 2nd+ messages
            console.log('[WindowBridge] Re-attaching debugger for text insertion...');
            try {
                await self.ASKGPT_BG.attachDebugger(this.tabId);
                await this.sleep(100);
            } catch (e) {
                console.log('[WindowBridge] Debugger attach:', e.message);
            }

            // === INSERT TEXT VIA DEBUGGER (same method for all providers) ===
            console.log('[WindowBridge] Inserting text via debugger...');
            await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Input.insertText', { text });
            await this.sleep(300);

            // === PRESS ENTER TO SEND ===
            console.log('[WindowBridge] Pressing Enter to send...');
            await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Input.dispatchKeyEvent', {
                type: 'keyDown',
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13,
                key: 'Enter',
                code: 'Enter',
                text: '\r'
            });
            await chrome.debugger.sendCommand({ tabId: this.tabId }, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13,
                key: 'Enter',
                code: 'Enter'
            });

            // === FALLBACK: Click send button after delay ===
            await this.sleep(400);
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: this.tabId },
                    func: (pk) => {
                        const buttonSelectors = pk === 'perplexity_web'
                            ? ['button[aria-label*="submit" i]', 'button[aria-label*="send" i]', 'button[type="submit"]']
                            : ['[data-testid="send-button"]', '#composer-submit-button', 'button[aria-label*="Send"]'];

                        for (const sel of buttonSelectors) {
                            const btn = document.querySelector(sel);
                            if (btn && !btn.disabled) {
                                console.log('[WindowBridge] Clicking fallback button:', sel);
                                btn.click();
                                break;
                            }
                        }
                    },
                    args: [this.providerKey]
                });
            } catch (e) { }

            this.metrics.sendDuration = Date.now() - sendStart;
            return { success: true };

        } catch (e) {
            console.error('[WindowBridge] Send error:', e);
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
                        func: (startCount, selectors, providerKey) => {
                            // First, scroll to bottom to ensure we can see new content
                            window.scrollTo(0, document.body.scrollHeight);
                            const scrollContainer = document.querySelector('[class*="overflow"], main, article');
                            if (scrollContainer) {
                                scrollContainer.scrollTop = scrollContainer.scrollHeight;
                            }

                            // Get response elements using provider selectors
                            const markdowns = document.querySelectorAll(selectors.response);
                            const hasNewResponse = markdowns.length > startCount;

                            let fullHtml = '';
                            let fullText = '';

                            // ChatGPT specific: use conversation turns
                            if (providerKey === 'chatgpt_web') {
                                const turns = document.querySelectorAll('[data-testid^="conversation-turn"]');
                                if (hasNewResponse && turns.length > 0) {
                                    const lastTurn = turns[turns.length - 1];
                                    const isAssistant = lastTurn?.querySelector('[data-message-author-role="assistant"]');
                                    if (isAssistant) {
                                        const messageContent = lastTurn.querySelector('.markdown');
                                        if (messageContent) {
                                            fullHtml = messageContent.innerHTML;
                                            fullText = messageContent.innerText;
                                        }
                                    }
                                }
                            }

                            // Perplexity specific: find LARGEST prose, exclude "related" section
                            if (providerKey === 'perplexity_web') {
                                // Helper: Check if element is in "related" section
                                const isRelated = (el) => {
                                    const allClasses = [
                                        el.className,
                                        el.parentElement?.className,
                                        el.parentElement?.parentElement?.className,
                                        el.parentElement?.parentElement?.parentElement?.className
                                    ].join(' ').toLowerCase();

                                    if (allClasses.includes('related') || allClasses.includes('suggestion')) return true;

                                    const header = el.querySelector('h1, h2, h3, h4, h5, span');
                                    if (header?.innerText?.toLowerCase().includes('related')) return true;
                                    if (header?.innerText?.toLowerCase().includes('people also')) return true;

                                    return false;
                                };

                                // Find all prose elements
                                const proseElements = document.querySelectorAll('.prose, [class*="prose"], [class*="answer"], article, [class*="markdown"]');
                                let bestElement = null;
                                let maxLength = 0;

                                for (const el of proseElements) {
                                    // Skip related sections
                                    if (isRelated(el)) continue;

                                    const text = el.innerText || '';
                                    // Skip tiny elements
                                    if (text.length < 100) continue;

                                    // Get largest
                                    if (text.length > maxLength) {
                                        maxLength = text.length;
                                        bestElement = el;
                                    }
                                }

                                // If no single container, combine all valid prose
                                if (!bestElement) {
                                    const allProse = document.querySelectorAll('.prose');
                                    let combined = { html: '', text: '' };

                                    for (const el of allProse) {
                                        if (isRelated(el)) continue;
                                        const text = (el.innerText || '').trim();
                                        if (text.length > 30) {
                                            combined.html += el.innerHTML + '\n';
                                            combined.text += text + '\n';
                                        }
                                    }

                                    if (combined.text.length > 50) {
                                        fullHtml = combined.html;
                                        fullText = combined.text;
                                    }
                                } else {
                                    fullHtml = bestElement.innerHTML;
                                    fullText = bestElement.innerText;
                                }

                                console.log('[Perplexity Bridge] Found:', fullText.length, 'chars');
                            }

                            // Copilot specific: find actual message content, exclude toolbar
                            if (providerKey === 'copilot_web') {
                                // Helper: Check if element is toolbar/action buttons
                                const isToolbar = (el) => {
                                    const className = (el.className || '').toLowerCase();
                                    const parentClass = (el.parentElement?.className || '').toLowerCase();

                                    // Exclude toolbar, actions, buttons containers
                                    if (className.includes('toolbar') || className.includes('action')) return true;
                                    if (className.includes('button') || className.includes('btn')) return true;
                                    if (className.includes('feedback') || className.includes('copy')) return true;
                                    if (className.includes('suggestion') || className.includes('related')) return true;
                                    if (parentClass.includes('toolbar') || parentClass.includes('action')) return true;

                                    // Check if it's just icons/small elements
                                    const icons = el.querySelectorAll('svg, i, .icon');
                                    if (icons.length > 0 && el.innerText.length < 50) return true;

                                    return false;
                                };

                                // Copilot response selectors - try multiple patterns
                                const responseSelectors = [
                                    // Main content containers
                                    '[class*="message-content"]',
                                    '[class*="response-content"]',
                                    '[class*="chat-message"]',
                                    '.ac-container [class*="text"]',
                                    '[data-content="ai-message"]',
                                    // Markdown content
                                    '.prose:not([class*="toolbar"])',
                                    '.markdown-body',
                                    // Generic
                                    '[class*="message"]:not([class*="user"])'
                                ];

                                let bestContent = null;
                                let maxLength = 0;

                                for (const sel of responseSelectors) {
                                    try {
                                        const elements = document.querySelectorAll(sel);
                                        for (const el of elements) {
                                            if (isToolbar(el)) continue;

                                            const text = el.innerText || '';
                                            if (text.length < 20) continue; // Skip tiny elements

                                            // Prefer larger content
                                            if (text.length > maxLength) {
                                                maxLength = text.length;
                                                bestContent = el;
                                            }
                                        }
                                    } catch (e) { }
                                }

                                if (bestContent && maxLength > 50) {
                                    fullHtml = bestContent.innerHTML;
                                    fullText = bestContent.innerText;
                                    console.log('[Copilot Bridge] Found:', fullText.length, 'chars');
                                }
                            }

                            // Grok specific: find message content
                            if (providerKey === 'grok_web') {
                                const responseSelectors = [
                                    '[class*="message"]:not([class*="user"])',
                                    '[class*="response"]',
                                    '.prose',
                                    '[class*="content"]:not([class*="input"])'
                                ];

                                let bestContent = null;
                                let maxLength = 0;

                                for (const sel of responseSelectors) {
                                    try {
                                        const elements = document.querySelectorAll(sel);
                                        const lastEl = elements[elements.length - 1];
                                        if (lastEl) {
                                            const text = lastEl.innerText || '';
                                            if (text.length > maxLength && text.length > 20) {
                                                maxLength = text.length;
                                                bestContent = lastEl;
                                            }
                                        }
                                    } catch (e) { }
                                }

                                if (bestContent && maxLength > 50) {
                                    fullHtml = bestContent.innerHTML;
                                    fullText = bestContent.innerText;
                                    console.log('[Grok Bridge] Found:', fullText.length, 'chars');
                                }
                            }

                            // Fallback/Other providers: use last response element
                            if (!fullHtml && markdowns.length > 0) {
                                const lastMarkdown = markdowns[markdowns.length - 1];
                                fullHtml = lastMarkdown?.innerHTML || '';
                                fullText = lastMarkdown?.innerText || '';
                            }

                            // === CLEAN HTML: Remove buttons, toolbars, copy elements ===
                            if (fullHtml) {
                                // Create a temporary div to manipulate HTML
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = fullHtml;

                                // Remove unwanted elements
                                const unwantedSelectors = [
                                    'button',
                                    '[class*="copy"]',
                                    '[class*="Copy"]',
                                    '[class*="toolbar"]',
                                    '[class*="Toolbar"]',
                                    '[class*="action"]',
                                    '[class*="Action"]',
                                    '[class*="feedback"]',
                                    '[class*="Feedback"]',
                                    '[aria-label*="copy" i]',
                                    '[aria-label*="Copy" i]',
                                    '[title*="copy" i]',
                                    '[title*="Copy" i]',
                                    'svg',
                                    '.icon',
                                    '[class*="icon"]',
                                    '[class*="-btn"]',
                                    '[class*="btn-"]',
                                    '[role="button"]'
                                ];

                                for (const sel of unwantedSelectors) {
                                    try {
                                        const elements = tempDiv.querySelectorAll(sel);
                                        elements.forEach(el => {
                                            // Don't remove if it contains substantial text content
                                            const text = el.innerText || '';
                                            if (text.length < 30) {
                                                el.remove();
                                            }
                                        });
                                    } catch (e) { }
                                }

                                fullHtml = tempDiv.innerHTML;
                                fullText = tempDiv.innerText;

                                console.log('[WindowBridge] Cleaned HTML, final length:', fullText.length);
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
                        args: [initialCount, this.config.selectors || PROVIDER_CONFIGS[this.providerKey]?.selectors || PROVIDER_CONFIGS.chatgpt_web.selectors, this.providerKey]
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
            // 1. Ensure window exists and is ready (use workerId for separate clone windows)
            const winData = await self.ASKGPT_BG.ensureWindow(this.workerId, this.port);
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

            // 7. Cleanup metrics
            this.metrics.totalDuration = Date.now() - this.startTime;
            this.notifySuccess(response.html);

            // DISABLED: Don't auto-close window - keep worker alive for future messages
            // setTimeout(() => this._cleanup(), 1000);

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
