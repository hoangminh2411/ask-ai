/**
 * Self-Learning Element Detector
 * ================================
 * Automatically detects and adapts to UI changes in AI chat interfaces.
 * Uses heuristics, learning, and self-healing to find elements.
 * 
 * Features:
 * - Auto-detect input fields, submit buttons, response areas
 * - Learn from successful interactions
 * - Self-heal when selectors break
 * - Cache working selectors with confidence scores
 * 
 * Version: 1.0
 */

class ElementDetector {
    constructor() {
        // Cached selectors per worker with confidence
        this.selectorCache = new Map();

        // Detection strategies ordered by priority
        this.strategies = {
            input: [
                // Strategy 1: Specific AI platform patterns
                { name: 'chatgpt_specific', selector: '#prompt-textarea, [data-testid="composer-background"] textarea' },
                { name: 'gemini_specific', selector: '.ql-editor, [contenteditable="true"][data-placeholder]' },
                { name: 'perplexity_specific', selector: 'textarea[placeholder*="Ask"]' },
                { name: 'copilot_specific', selector: '#searchbox, textarea[name="q"]' },
                { name: 'grok_specific', selector: 'textarea[data-testid], [role="textbox"]' },

                // Strategy 2: Common patterns
                { name: 'contenteditable', selector: '[contenteditable="true"]:not([aria-hidden="true"])' },
                { name: 'textarea_visible', selector: 'textarea:not([hidden]):not([disabled])' },
                { name: 'role_textbox', selector: '[role="textbox"]:not([aria-hidden="true"])' },

                // Strategy 3: Heuristic - find largest visible textarea
                { name: 'heuristic_largest', type: 'heuristic', detect: this._findLargestInput.bind(this) },
            ],

            submit: [
                // Strategy 1: Specific patterns
                { name: 'chatgpt_send', selector: '[data-testid="send-button"], button[aria-label*="Send"]' },
                { name: 'gemini_send', selector: 'button[aria-label*="Send"], .send-button' },
                { name: 'perplexity_send', selector: 'button[aria-label*="Submit"], button[type="submit"]' },

                // Strategy 2: Common patterns
                { name: 'aria_send', selector: 'button[aria-label*="send" i], button[aria-label*="submit" i]' },
                { name: 'svg_send_icon', selector: 'button:has(svg[data-icon="paper-plane"]), button:has(svg[class*="send"])' },
                { name: 'submit_button', selector: 'button[type="submit"]' },

                // Strategy 3: Heuristic - button near input
                { name: 'heuristic_near_input', type: 'heuristic', detect: this._findSubmitNearInput.bind(this) },
            ],

            response: [
                // Strategy 1: Specific patterns
                { name: 'chatgpt_response', selector: '[data-message-author-role="assistant"], .markdown.prose' },
                { name: 'gemini_response', selector: '.model-response-text, .response-content' },
                { name: 'perplexity_response', selector: '.prose, .answer-content' },

                // Strategy 2: Common patterns
                { name: 'markdown_container', selector: '.markdown, .prose, [class*="markdown"]' },
                { name: 'message_container', selector: '[class*="message"]:not([class*="input"]), [class*="response"]' },
                { name: 'chat_bubble', selector: '[class*="bubble"], [class*="chat-message"]' },

                // Strategy 3: Heuristic - find response container
                { name: 'heuristic_response', type: 'heuristic', detect: this._findResponseContainer.bind(this) },
            ],

            loading: [
                // Indicators that AI is still generating
                { name: 'stop_button', selector: 'button[aria-label*="Stop"], button:has(svg[class*="stop"])' },
                { name: 'loading_indicator', selector: '[class*="loading"], [class*="typing"], [class*="generating"]' },
                { name: 'cursor_blink', selector: '.cursor-blink, [class*="cursor"]' },
            ]
        };

        // Load cached selectors from storage
        this._loadCache();
    }

    /**
     * Detect an element type for a specific worker
     * Returns the best matching element or null
     */
    async detectElement(tabId, workerId, elementType) {
        const cacheKey = `${workerId}_${elementType}`;

        // 1. Try cached selector first
        const cached = this.selectorCache.get(cacheKey);
        if (cached && cached.confidence > 0.7) {
            const element = await this._queryElement(tabId, cached.selector);
            if (element) {
                // Increase confidence on success
                cached.confidence = Math.min(1, cached.confidence + 0.05);
                cached.lastSuccess = Date.now();
                this._saveCache();
                return { selector: cached.selector, element, fromCache: true };
            } else {
                // Decrease confidence on failure
                cached.confidence -= 0.2;
                console.log(`[ElementDetector] Cached selector failed for ${cacheKey}, confidence now ${cached.confidence}`);
            }
        }

        // 2. Try all strategies in order
        const strategies = this.strategies[elementType] || [];

        for (const strategy of strategies) {
            try {
                let result;

                if (strategy.type === 'heuristic') {
                    // Run heuristic function
                    result = await this._runInTab(tabId, strategy.detect);
                } else {
                    // Try selector
                    result = await this._queryElement(tabId, strategy.selector);
                }

                if (result) {
                    console.log(`[ElementDetector] Found ${elementType} using strategy: ${strategy.name}`);

                    // Cache the successful selector
                    this.selectorCache.set(cacheKey, {
                        selector: strategy.selector || strategy.name,
                        strategy: strategy.name,
                        confidence: 0.8,
                        lastSuccess: Date.now(),
                        usageCount: 1
                    });
                    this._saveCache();

                    return {
                        selector: strategy.selector,
                        element: result,
                        strategy: strategy.name,
                        fromCache: false
                    };
                }
            } catch (e) {
                // Continue to next strategy
            }
        }

        // 3. No element found
        console.warn(`[ElementDetector] Could not find ${elementType} for ${workerId}`);
        return null;
    }

    /**
     * Self-healing: Re-detect all elements when UI changes detected
     */
    async healWorker(tabId, workerId) {
        console.log(`[ElementDetector] Healing worker: ${workerId}`);

        // Clear cached selectors for this worker
        for (const key of this.selectorCache.keys()) {
            if (key.startsWith(workerId)) {
                this.selectorCache.delete(key);
            }
        }

        // Re-detect all element types
        const results = {};
        for (const elementType of ['input', 'submit', 'response', 'loading']) {
            results[elementType] = await this.detectElement(tabId, workerId, elementType);
        }

        this._saveCache();
        return results;
    }

    /**
     * Learn from user interaction - when user manually provides selector
     */
    learnSelector(workerId, elementType, selector, confidence = 1.0) {
        const cacheKey = `${workerId}_${elementType}`;
        this.selectorCache.set(cacheKey, {
            selector,
            strategy: 'user_provided',
            confidence,
            lastSuccess: Date.now(),
            usageCount: 0
        });
        this._saveCache();
        console.log(`[ElementDetector] Learned selector for ${cacheKey}: ${selector}`);
    }

    /**
     * Get current detection status for diagnostics
     */
    getStatus() {
        const status = {};
        for (const [key, value] of this.selectorCache) {
            status[key] = {
                selector: value.selector,
                confidence: value.confidence,
                lastSuccess: value.lastSuccess,
                strategy: value.strategy
            };
        }
        return status;
    }

    // =========================================
    // PRIVATE: Query helpers
    // =========================================

    async _queryElement(tabId, selector) {
        try {
            const [result] = await chrome.scripting.executeScript({
                target: { tabId },
                func: (sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;

                    // Check visibility
                    const rect = el.getBoundingClientRect();
                    const style = getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') return null;
                    if (rect.width === 0 || rect.height === 0) return null;

                    return {
                        exists: true,
                        tagName: el.tagName,
                        id: el.id,
                        className: el.className,
                        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                    };
                },
                args: [selector]
            });

            return result?.result || null;
        } catch (e) {
            return null;
        }
    }

    async _runInTab(tabId, detectFn) {
        try {
            const [result] = await chrome.scripting.executeScript({
                target: { tabId },
                func: detectFn
            });
            return result?.result || null;
        } catch (e) {
            return null;
        }
    }

    // =========================================
    // PRIVATE: Heuristic detection functions
    // =========================================

    _findLargestInput() {
        // Find the largest visible textarea or contenteditable
        const candidates = [
            ...document.querySelectorAll('textarea:not([hidden])'),
            ...document.querySelectorAll('[contenteditable="true"]'),
            ...document.querySelectorAll('[role="textbox"]')
        ];

        let largest = null;
        let maxArea = 0;

        for (const el of candidates) {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);

            if (style.display === 'none' || style.visibility === 'hidden') continue;

            const area = rect.width * rect.height;
            if (area > maxArea && rect.width > 100 && rect.height > 30) {
                maxArea = area;
                largest = el;
            }
        }

        if (largest) {
            // Return a unique selector for this element
            return {
                exists: true,
                tagName: largest.tagName,
                generatedSelector: largest.id
                    ? `#${largest.id}`
                    : largest.className
                        ? `.${largest.className.split(' ')[0]}`
                        : largest.tagName.toLowerCase()
            };
        }
        return null;
    }

    _findSubmitNearInput() {
        // Find button closest to the main input
        const inputs = [
            ...document.querySelectorAll('textarea:not([hidden])'),
            ...document.querySelectorAll('[contenteditable="true"]')
        ];

        if (inputs.length === 0) return null;

        const mainInput = inputs[0];
        const inputRect = mainInput.getBoundingClientRect();

        // Find all buttons
        const buttons = document.querySelectorAll('button:not([disabled])');
        let closest = null;
        let minDistance = Infinity;

        for (const btn of buttons) {
            const btnRect = btn.getBoundingClientRect();

            // Skip invisible buttons
            if (btnRect.width === 0 || btnRect.height === 0) continue;

            // Calculate distance from input
            const distance = Math.sqrt(
                Math.pow(btnRect.left - inputRect.right, 2) +
                Math.pow(btnRect.top - inputRect.top, 2)
            );

            // Check for send-like attributes
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            const hasSendHint = ariaLabel.includes('send') || ariaLabel.includes('submit');

            if (distance < minDistance && (distance < 200 || hasSendHint)) {
                minDistance = distance;
                closest = btn;
            }
        }

        if (closest) {
            return {
                exists: true,
                tagName: closest.tagName,
                ariaLabel: closest.getAttribute('aria-label')
            };
        }
        return null;
    }

    _findResponseContainer() {
        // Find the main response/chat container
        const candidates = [
            // Look for common patterns
            ...document.querySelectorAll('[class*="response"], [class*="message"], [class*="chat"]'),
            ...document.querySelectorAll('.markdown, .prose'),
            ...document.querySelectorAll('[role="article"], [role="main"]')
        ];

        // Find the largest container with significant text
        let best = null;
        let maxScore = 0;

        for (const el of candidates) {
            const rect = el.getBoundingClientRect();
            const text = el.innerText || '';

            // Skip tiny or empty elements
            if (rect.width < 200 || text.length < 50) continue;

            // Score based on size and text content
            const score = rect.width * rect.height * 0.001 + text.length * 0.1;

            if (score > maxScore) {
                maxScore = score;
                best = el;
            }
        }

        if (best) {
            return {
                exists: true,
                tagName: best.tagName,
                className: best.className
            };
        }
        return null;
    }

    // =========================================
    // PRIVATE: Cache persistence
    // =========================================

    async _loadCache() {
        try {
            const result = await chrome.storage.local.get(['elementDetectorCache']);
            if (result.elementDetectorCache) {
                const parsed = JSON.parse(result.elementDetectorCache);
                for (const [key, value] of Object.entries(parsed)) {
                    this.selectorCache.set(key, value);
                }
                console.log('[ElementDetector] Loaded cache with', this.selectorCache.size, 'entries');
            }
        } catch (e) {
            console.warn('[ElementDetector] Failed to load cache:', e);
        }
    }

    async _saveCache() {
        try {
            const obj = {};
            for (const [key, value] of this.selectorCache) {
                obj[key] = value;
            }
            await chrome.storage.local.set({
                elementDetectorCache: JSON.stringify(obj)
            });
        } catch (e) {
            console.warn('[ElementDetector] Failed to save cache:', e);
        }
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================
const elementDetector = new ElementDetector();

// ============================================
// EXPORT TO GLOBAL
// ============================================
self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    elementDetector,
    ElementDetector
});

console.log('[ElementDetector] Self-learning element detector loaded');
