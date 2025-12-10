// ChatGPT stream observer: detect when assistant output stops changing (no more tokens)
// v2.0 - Enhanced stability detection with multiple signals

window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__observerLoaded) {
    if (!window.ASKGPT_CONTENT.__observerWarned) {
        window.ASKGPT_CONTENT.__observerWarned = true;
        console.debug("ASKGPT observer script already loaded; skipping.");
    }
} else {
    const CTX_OBS = window.ASKGPT_CONTENT;

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        STABILITY_THRESHOLD: 3000,      // ms without change = stable (increased for reliability)
        POLL_INTERVAL: 250,             // ms between checks
        DEFAULT_TIMEOUT: 120000,        // ms max wait time (2 minutes)
        QUICK_TIMEOUT: 30000,           // ms for short responses
        MIN_RESPONSE_LENGTH: 10,        // chars before considering valid
        DEBOUNCE_CHECKS: 4,             // consecutive stable checks needed (increased for reliability)
        DEBUG: false                    // set to true for debugging
    };

    // ============================================
    // STATE MANAGEMENT
    // ============================================
    let observerState = {
        lastHtml: "",
        lastTextLength: 0,
        lastCheck: 0,
        stableCheckCount: 0,
        resolver: null,
        rejector: null,
        pollTimer: null,
        timeoutTimer: null,
        mutationObserver: null,
        isActive: false
    };

    function debug(...args) {
        if (CONFIG.DEBUG) {
            console.debug('[ASKGPT Observer]', ...args);
        }
    }

    // ============================================
    // DOM SELECTORS & HELPERS
    // ============================================
    function getAssistantContainer() {
        // Strategy 1: Find by conversation turn with assistant role
        const turns = Array.from(document.querySelectorAll('[data-testid="conversation-turn"]'));
        for (let i = turns.length - 1; i >= 0; i--) {
            const el = turns[i];
            const role = el.querySelector('[data-message-author-role="assistant"]');
            if (role) return el;
        }

        // Strategy 2: Find last markdown element (common in ChatGPT)
        const markdowns = document.querySelectorAll('.markdown');
        if (markdowns.length > 0) {
            return markdowns[markdowns.length - 1];
        }

        // Strategy 3: Generic fallback
        const fallback = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]')).pop();
        return fallback || null;
    }

    function getStreamingSignals() {
        // Collect multiple signals that indicate ongoing generation
        const signals = {
            hasStopButton: false,
            hasStreamingClass: false,
            hasLoadingIndicator: false,
            isSendReady: false,
            composerLabel: '',
            isComposerStop: false,
            isComposerSend: false
        };

        // === PRIMARY DETECTION: #composer-submit-button aria-label ===
        // ChatGPT now uses a SINGLE button that changes aria-label
        const composerBtn = document.querySelector('#composer-submit-button');
        if (composerBtn) {
            signals.composerLabel = composerBtn.getAttribute('aria-label') || '';
            const label = signals.composerLabel.toLowerCase();

            // "Stop streaming" = generating
            signals.isComposerStop = label.includes('stop');
            // "Send message" = ready for input
            signals.isComposerSend = label.includes('send') && !composerBtn.disabled;

            signals.hasStopButton = signals.isComposerStop;
            signals.isSendReady = signals.isComposerSend;
        }

        // Signal 2: Streaming class on response (fallback)
        const container = getAssistantContainer();
        if (container) {
            signals.hasStreamingClass = container.classList.contains('result-streaming') ||
                !!container.querySelector('.result-streaming');
        }

        // Signal 3: Loading indicator (fallback)
        const loadingEl = document.querySelector(
            '.loading-indicator, ' +
            '[class*=\"generating\"], ' +
            '.animate-pulse'
        );
        signals.hasLoadingIndicator = !!loadingEl;

        // Fallback for older ChatGPT versions
        if (!composerBtn) {
            const oldStopBtn = document.querySelector(
                '[data-testid="stop-button"], ' +
                'button[aria-label*="Stop generating"]'
            );
            signals.hasStopButton = !!oldStopBtn;

            const oldSendBtn = document.querySelector('[data-testid="send-button"]');
            signals.isSendReady = oldSendBtn && !oldSendBtn.disabled && !oldStopBtn;
        }

        return signals;
    }

    function isGenerating() {
        const signals = getStreamingSignals();
        // PRIMARY: Check if composer button says "Stop"
        if (signals.isComposerStop) return true;
        // FALLBACK: Check other signals
        return signals.hasStopButton || signals.hasStreamingClass;
    }

    function isReadyForNewMessage() {
        const signals = getStreamingSignals();
        // PRIMARY: Check if composer button says "Send" and is enabled
        if (signals.isComposerSend) return true;
        // FALLBACK: No generating signals and send ready
        return !signals.hasStopButton &&
            !signals.hasStreamingClass &&
            signals.isSendReady;
    }

    // ============================================
    // STABILITY EVALUATION
    // ============================================
    function evaluateStability() {
        if (!observerState.isActive) return;

        const container = getAssistantContainer();
        const html = container ? container.innerHTML : "";
        const text = container ? container.innerText : "";
        const textLength = text.length;
        const now = Date.now();

        // === PRIMARY DETECTION: Text length changes ===
        // If text is still growing, we're still receiving
        const textChanged = textLength !== observerState.lastTextLength;

        if (textChanged) {
            // Text is still changing - reset stability and update tracking
            observerState.lastHtml = html;
            observerState.lastTextLength = textLength;
            observerState.lastCheck = now;
            observerState.stableCheckCount = 0;
            debug(`Text growing: ${textLength} chars`);
            return;
        }

        // Text hasn't changed - increment stability counter
        const quietFor = now - observerState.lastCheck;
        observerState.stableCheckCount++;

        debug(`Stable for ${quietFor}ms (check #${observerState.stableCheckCount})`);

        // === COMPLETION CONDITIONS ===
        // PRIMARY: Text has stopped growing for STABILITY_THRESHOLD time AND we have content
        const hasContent = textLength >= CONFIG.MIN_RESPONSE_LENGTH;
        const textIsStable = quietFor > CONFIG.STABILITY_THRESHOLD &&
            observerState.stableCheckCount >= CONFIG.DEBOUNCE_CHECKS;

        // SECONDARY: Button confirms completion (optional, for extra confidence)
        const buttonConfirms = isReadyForNewMessage();

        // Very stable = 2x threshold (fallback if button detection fails)
        const veryStable = quietFor > (CONFIG.STABILITY_THRESHOLD * 2);

        // Complete if: has content AND text is stable AND (button confirms OR very stable)
        if (hasContent && textIsStable && (buttonConfirms || veryStable)) {
            debug('Response complete!', {
                length: textLength,
                quietFor,
                buttonConfirms,
                veryStable
            });
            resolveResponse({ html, text });
            return;
        }

        // Log waiting status occasionally
        if (observerState.stableCheckCount % 5 === 0) {
            debug(`Waiting... ${textLength} chars, stable ${quietFor}ms, button: ${buttonConfirms}`);
        }
    }

    function resolveResponse(data) {
        if (observerState.resolver) {
            observerState.resolver(data);
            cleanup();
        }
    }

    function cleanup() {
        observerState.isActive = false;

        if (observerState.pollTimer) {
            clearInterval(observerState.pollTimer);
            observerState.pollTimer = null;
        }

        if (observerState.timeoutTimer) {
            clearTimeout(observerState.timeoutTimer);
            observerState.timeoutTimer = null;
        }

        observerState.resolver = null;
        observerState.rejector = null;
    }

    // ============================================
    // MAIN API
    // ============================================
    function waitForChatGptStableAnswer(timeoutMs = CONFIG.DEFAULT_TIMEOUT) {
        cleanup(); // Clean any previous session

        return new Promise((resolve, reject) => {
            observerState.resolver = resolve;
            observerState.rejector = reject;
            observerState.lastHtml = "";
            observerState.lastTextLength = 0;
            observerState.lastCheck = Date.now();
            observerState.stableCheckCount = 0;
            observerState.isActive = true;

            debug(`Starting observation, timeout: ${timeoutMs}ms`);

            // Start polling
            observerState.pollTimer = setInterval(evaluateStability, CONFIG.POLL_INTERVAL);

            // Set timeout
            observerState.timeoutTimer = setTimeout(() => {
                if (observerState.isActive) {
                    debug('Timeout reached');

                    // Try to return what we have
                    const container = getAssistantContainer();
                    if (container && container.innerText.length > CONFIG.MIN_RESPONSE_LENGTH) {
                        debug('Returning partial response on timeout');
                        resolve({
                            html: container.innerHTML,
                            text: container.innerText,
                            partial: true
                        });
                    } else {
                        reject(new Error(`Timed out after ${timeoutMs}ms waiting for ChatGPT response`));
                    }
                    cleanup();
                }
            }, timeoutMs);
        });
    }

    // Quick check function for external use
    function getResponseStatus() {
        const container = getAssistantContainer();
        const signals = getStreamingSignals();

        return {
            hasResponse: !!container,
            textLength: container ? container.innerText.length : 0,
            isGenerating: isGenerating(),
            isReady: isReadyForNewMessage(),
            signals
        };
    }

    // ============================================
    // MUTATION OBSERVER FOR IMMEDIATE UPDATES
    // ============================================
    const mutationCallback = () => {
        if (observerState.isActive) {
            evaluateStability();
        }
    };

    // Setup mutation observer
    const mo = new MutationObserver(mutationCallback);
    const target = document.documentElement || document.body;
    if (target) {
        mo.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled', 'class']
        });
    }

    // ============================================
    // EXPORTS
    // ============================================
    CTX_OBS.waitForChatGptStableAnswer = waitForChatGptStableAnswer;
    CTX_OBS.getResponseStatus = getResponseStatus;
    CTX_OBS.isGenerating = isGenerating;
    CTX_OBS.isReadyForNewMessage = isReadyForNewMessage;

    window.ASKGPT_CONTENT.__observerLoaded = true;
    window.ASKGPT_CONTENT.__observerWarned = true;

    debug('Observer v2.0 loaded');
}
