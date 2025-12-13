/**
 * Smart Response Detector
 * ========================
 * Intelligently detects AI chat responses without hardcoded selectors.
 * Uses heuristics: timing, size, content patterns, DOM structure.
 * 
 * Version: 1.0
 */

/**
 * Find the most likely AI response element in the page
 * Works by analyzing multiple signals:
 * 1. Recent text changes (streaming detection)
 * 2. Element size and position
 * 3. Content patterns (markdown, prose)
 * 4. Proximity to input area
 */
function detectResponseElement() {
    const candidates = [];

    // ========================================
    // STEP 1: Gather candidate elements
    // ========================================

    // Common response container patterns
    const selectors = [
        // Markdown/prose patterns
        '.markdown', '.prose', '[class*="prose"]',
        '.md', '[class*="markdown"]',
        // Message patterns
        '[class*="message"]', '[class*="response"]', '[class*="answer"]',
        '[class*="chat"]', '[class*="content"]',
        // Role patterns
        '[data-message-author-role="assistant"]',
        '[class*="assistant"]', '[class*="bot"]',
        // Container patterns
        'article', '[role="article"]',
        // Code containers (often part of responses)
        'pre', 'code'
    ];

    const seen = new Set();

    for (const selector of selectors) {
        try {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (seen.has(el)) continue;
                seen.add(el);

                const score = scoreCandidate(el);
                if (score > 0) {
                    candidates.push({ element: el, score });
                }
            }
        } catch (e) { }
    }

    // ========================================
    // STEP 2: Score and rank candidates
    // ========================================

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Return best candidate
    if (candidates.length > 0) {
        return candidates[0].element;
    }

    // ========================================
    // STEP 3: Fallback - find largest text block
    // ========================================
    return findLargestTextBlock();
}

/**
 * Score a candidate element as potential AI response
 */
function scoreCandidate(el) {
    let score = 0;

    // Skip hidden elements
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
        return 0;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return 0;
    }

    const text = el.innerText || '';
    const html = el.innerHTML || '';

    // Skip very short content
    if (text.length < 20) {
        return 0;
    }

    // ========================================
    // POSITIVE SIGNALS
    // ========================================

    // 1. Text length (longer = more likely response)
    score += Math.min(text.length / 100, 50); // Max 50 points

    // 2. Contains markdown-like content
    if (/<(p|ul|ol|h[1-6]|pre|code|blockquote)>/i.test(html)) {
        score += 20;
    }

    // 3. Has prose/markdown class
    const className = el.className?.toLowerCase() || '';
    if (className.includes('prose') || className.includes('markdown')) {
        score += 30;
    }

    // 4. Has assistant/bot role indicator
    if (className.includes('assistant') || className.includes('bot') || className.includes('ai')) {
        score += 25;
    }
    if (el.closest('[data-message-author-role="assistant"]')) {
        score += 40;
    }

    // 5. Contains code blocks
    if (el.querySelector('pre code') || el.querySelector('.hljs')) {
        score += 15;
    }

    // 6. Contains lists (common in AI responses)
    if (el.querySelector('ul, ol')) {
        score += 10;
    }

    // 7. Position on page (lower = more recent = more likely response)
    const pageHeight = document.body.scrollHeight;
    const positionRatio = rect.top / pageHeight;
    if (positionRatio > 0.5) {
        score += 15; // Bottom half of page
    }

    // 8. Width suggests main content (not sidebar)
    if (rect.width > 400) {
        score += 10;
    }

    // ========================================
    // NEGATIVE SIGNALS
    // ========================================

    // 1. Is input area
    if (el.matches('textarea, input, [contenteditable="true"]')) {
        score -= 100;
    }

    // 2. Is user message (look for user indicators)
    if (className.includes('user') || className.includes('human')) {
        score -= 50;
    }
    if (el.closest('[data-message-author-role="user"]')) {
        score -= 100;
    }

    // 3. Is navigation/header/footer
    if (el.matches('nav, header, footer, aside') || el.closest('nav, header, footer, aside')) {
        score -= 30;
    }

    // 4. Very small element
    if (rect.height < 50) {
        score -= 20;
    }

    // 5. Is a button or link
    if (el.matches('button, a')) {
        score -= 50;
    }

    return score;
}

/**
 * Find the largest text block on the page (fallback)
 */
function findLargestTextBlock() {
    const blocks = document.querySelectorAll('div, article, section, main');
    let best = null;
    let bestScore = 0;

    for (const block of blocks) {
        const text = block.innerText || '';
        const rect = block.getBoundingClientRect();

        // Skip hidden/tiny
        if (rect.width < 200 || rect.height < 100) continue;
        if (text.length < 50) continue;

        // Score = text length * visibility
        const score = text.length * (rect.width * rect.height / 100000);

        if (score > bestScore) {
            bestScore = score;
            best = block;
        }
    }

    return best;
}

/**
 * Watch for new response content (streaming detection)
 * Returns a promise that resolves when response is stable
 */
function watchForResponse(timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        let lastContent = '';
        let lastChangeTime = Date.now();
        let checkInterval;

        const startTime = Date.now();

        checkInterval = setInterval(() => {
            // Timeout check
            if (Date.now() - startTime > timeoutMs) {
                clearInterval(checkInterval);
                const response = detectResponseElement();
                resolve(response ? {
                    element: response,
                    html: response.innerHTML,
                    text: response.innerText,
                    timedOut: true
                } : null);
                return;
            }

            // Find current best response
            const response = detectResponseElement();
            if (!response) return;

            const currentContent = response.innerText || '';

            // Content changed?
            if (currentContent !== lastContent) {
                lastContent = currentContent;
                lastChangeTime = Date.now();
            }

            // Stable for 3 seconds?
            const stableTime = Date.now() - lastChangeTime;
            if (stableTime > 3000 && currentContent.length > 20) {
                // Check for streaming indicators
                const isStreaming = !!document.querySelector(
                    '[class*="streaming"], [class*="typing"], [class*="generating"], ' +
                    'button[aria-label*="Stop"], .animate-pulse'
                );

                if (!isStreaming) {
                    clearInterval(checkInterval);
                    resolve({
                        element: response,
                        html: response.innerHTML,
                        text: response.innerText,
                        stableTime
                    });
                }
            }
        }, 300);
    });
}

/**
 * Get the response with smart detection
 * Main entry point for extracting AI responses
 */
async function getSmartResponse() {
    // Try to find immediate response
    const immediate = detectResponseElement();

    if (immediate && immediate.innerText?.length > 50) {
        // Check if still streaming
        const isStreaming = !!document.querySelector(
            '[class*="streaming"], [class*="typing"], [class*="generating"], ' +
            'button[aria-label*="Stop"], .animate-pulse'
        );

        if (!isStreaming) {
            return {
                html: immediate.innerHTML,
                text: immediate.innerText,
                method: 'immediate'
            };
        }
    }

    // Wait for response to stabilize
    const watched = await watchForResponse(60000);

    if (watched) {
        return {
            html: watched.html,
            text: watched.text,
            method: 'watched',
            stableTime: watched.stableTime
        };
    }

    return { html: '', text: '', method: 'failed' };
}

// Export for use in polling
if (typeof window !== 'undefined') {
    window.ASKGPT_SMART_RESPONSE = {
        detectResponseElement,
        scoreCandidate,
        findLargestTextBlock,
        watchForResponse,
        getSmartResponse
    };
}
