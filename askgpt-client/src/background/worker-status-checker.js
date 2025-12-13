/**
 * Worker Status Checker
 * ======================
 * Real-time monitoring of worker tab status.
 * Checks if tabs are alive, responsive, and ready.
 * 
 * Version: 1.0
 */

// ============================================
// TAB STATUS CHECKER
// ============================================

class WorkerStatusChecker {
    constructor() {
        this.checkInterval = null;
        this.checkIntervalMs = 60000; // Check every 60 seconds (was 30)
        this.lastCheck = new Map(); // workerId -> timestamp
    }

    /**
     * Start periodic status checking
     */
    startPeriodicCheck() {
        if (this.checkInterval) return;

        this.checkInterval = setInterval(() => {
            this.checkAllWorkers();
        }, this.checkIntervalMs);

        console.log('[StatusChecker] Started periodic checking (every 60s)');
    }

    /**
     * Stop periodic checking
     */
    stopPeriodicCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Check status of all enabled workers
     */
    async checkAllWorkers() {
        const workerManager = self.ASKGPT_BG?.workerManager;
        if (!workerManager) return;

        const enabledWorkers = workerManager.getEnabledWorkers();
        const results = {};

        for (const worker of enabledWorkers) {
            const status = await this.checkWorker(worker.id);
            results[worker.id] = status;
        }

        console.log('[StatusChecker] Check complete:', results);
        return results;
    }

    /**
     * Check status of a single worker
     */
    async checkWorker(workerId) {
        const workerManager = self.ASKGPT_BG?.workerManager;
        const managers = self.ASKGPT_BG?.MANAGERS || {};
        const manager = managers[workerId];

        // If no manager entry, don't change status - worker might just not have a window yet
        if (!manager) {
            return { status: 'unknown', reason: 'No manager found' };
        }

        // If no tab ID, don't set offline - it might just be waiting
        if (!manager.tabId) {
            return { status: 'unknown', reason: 'No tab ID yet' };
        }

        try {
            // Try to get tab info
            const tab = await chrome.tabs.get(manager.tabId);

            if (!tab) {
                this._handleTabNotFound(workerId, manager);
                return { status: 'offline', reason: 'Tab not found' };
            }

            // Check if tab is discarded (sleeping)
            if (tab.discarded) {
                if (workerManager) {
                    workerManager.updateStatus(workerId, 'offline');
                }
                return { status: 'offline', reason: 'Tab discarded' };
            }

            // Check if tab is loading
            if (tab.status === 'loading') {
                if (workerManager) {
                    workerManager.updateStatus(workerId, 'connecting');
                }
                return { status: 'connecting', reason: 'Tab loading' };
            }

            // Tab exists and is complete - check if it's responsive
            const isResponsive = await this._checkTabResponsive(manager.tabId, workerId);

            if (isResponsive) {
                if (workerManager) {
                    workerManager.updateStatus(workerId, 'online');
                }
                return { status: 'online', reason: 'Tab responsive' };
            } else {
                if (workerManager) {
                    workerManager.updateStatus(workerId, 'error');
                }
                return { status: 'error', reason: 'Tab not responsive' };
            }

        } catch (e) {
            // Tab doesn't exist
            this._handleTabNotFound(workerId, manager);
            return { status: 'offline', reason: e.message };
        }
    }

    /**
     * Check if tab is responsive by executing a simple script
     */
    async _checkTabResponsive(tabId, workerId) {
        try {
            const [result] = await chrome.scripting.executeScript({
                target: { tabId },
                func: (wid) => {
                    // Simple check that page is loaded
                    const configs = {
                        chatgpt_web: 'body',
                        gemini_web: 'body',
                        perplexity_web: 'body',
                        copilot_web: 'body',
                        grok_web: 'body'
                    };
                    return !!document.querySelector(configs[wid] || 'body');
                },
                args: [workerId]
            });

            return result?.result === true;
        } catch (e) {
            console.warn(`[StatusChecker] Tab ${tabId} not responsive:`, e.message);
            return false;
        }
    }

    /**
     * Handle tab not found - clean up manager state
     */
    _handleTabNotFound(workerId, manager) {
        manager.tabId = null;
        manager.windowId = null;

        const workerManager = self.ASKGPT_BG?.workerManager;
        if (workerManager) {
            workerManager.updateStatus(workerId, 'offline');
        }
    }

    /**
     * Force check a specific worker (called on demand)
     */
    async forceCheck(workerId) {
        const result = await this.checkWorker(workerId);
        this.lastCheck.set(workerId, Date.now());
        return result;
    }

    /**
     * Check if worker was recently checked
     */
    wasRecentlyChecked(workerId, withinMs = 10000) {
        const lastTime = this.lastCheck.get(workerId);
        if (!lastTime) return false;
        return Date.now() - lastTime < withinMs;
    }
}

// ============================================
// SYSTEM PROMPT INJECTOR
// ============================================

class SystemPromptInjector {
    constructor() {
        this.injected = new Map(); // workerId -> boolean
    }

    /**
     * Get the system prompt for Main Worker
     */
    getMainWorkerPrompt() {
        return self.ASKGPT_WORKERS?.MAIN_WORKER_SYSTEM_PROMPT || '';
    }

    /**
     * Inject system prompt into a query for Main Worker
     * DISABLED: Don't inject system prompts - send user query as-is
     */
    enhanceQueryForMainWorker(query, context = {}) {
        // Return query unchanged - no system prompt injection
        return query;
    }

    /**
     * Create a first-time instruction message
     * This should be sent once per session to "prime" the Main Worker
     */
    getSessionPrimer() {
        return `You are part of an AI team. If a user's request requires capabilities you don't have (like real-time data, Twitter trends, or video creation), you can delegate to specialist workers by including a special JSON block in your response.

Available specialists:
- perplexity_web: Real-time search, news, prices
- gemini_web: Image/video analysis, multimodal
- grok_web: Twitter/X data, trends
- copilot_web: Microsoft Office, DALL-E

Delegation format:
\`\`\`delegate
{"action":"delegate","target_worker":"perplexity_web","query":"your query here","reason":"why delegating"}
\`\`\`

Only delegate when truly necessary. For most requests, answer directly.`;
    }
}

// ============================================
// ERROR RECOVERY HANDLER
// ============================================

class ErrorRecoveryHandler {
    constructor() {
        this.errorCounts = new Map(); // workerId -> error count
        this.maxErrors = 3;
        this.resetAfterMs = 300000; // 5 minutes
        this.lastError = new Map(); // workerId -> timestamp
    }

    /**
     * Record an error for a worker
     */
    recordError(workerId, error) {
        const count = (this.errorCounts.get(workerId) || 0) + 1;
        this.errorCounts.set(workerId, count);
        this.lastError.set(workerId, Date.now());

        console.warn(`[ErrorRecovery] Worker ${workerId} error #${count}:`, error);

        // Auto-reset old errors
        this._scheduleReset(workerId);

        return count;
    }

    /**
     * Check if worker should be temporarily disabled due to errors
     */
    shouldDisableWorker(workerId) {
        const count = this.errorCounts.get(workerId) || 0;
        return count >= this.maxErrors;
    }

    /**
     * Get fallback worker when primary fails
     */
    getFallbackWorker(failedWorkerId, taskType) {
        const workerConfigs = self.ASKGPT_WORKERS?.WORKER_CONFIGS || {};

        // Fallback mapping based on capabilities
        const fallbacks = {
            perplexity_web: 'gemini_web',  // Both can search
            gemini_web: 'chatgpt_web',      // Fallback to main
            grok_web: 'perplexity_web',     // Both handle trends
            copilot_web: 'chatgpt_web'      // Fallback to main
        };

        const fallbackId = fallbacks[failedWorkerId];
        if (fallbackId && workerConfigs[fallbackId]?.enabled) {
            return fallbackId;
        }

        // Ultimate fallback: main worker
        return 'chatgpt_web';
    }

    /**
     * Clear errors for a worker (on success)
     */
    clearErrors(workerId) {
        this.errorCounts.delete(workerId);
        this.lastError.delete(workerId);
    }

    /**
     * Schedule auto-reset of error count
     */
    _scheduleReset(workerId) {
        setTimeout(() => {
            const lastTime = this.lastError.get(workerId);
            if (lastTime && Date.now() - lastTime >= this.resetAfterMs) {
                this.clearErrors(workerId);
                console.log(`[ErrorRecovery] Auto-reset errors for ${workerId}`);
            }
        }, this.resetAfterMs);
    }

    /**
     * Get recovery suggestion for user
     */
    getRecoverySuggestion(workerId, error) {
        const suggestions = {
            'Tab not found': 'Worker tab was closed. Try your request again to reopen.',
            'Tab not responsive': 'Worker seems frozen. We\'ll try to refresh it.',
            'timeout': 'Request timed out. The worker might be busy. Try again.',
            'default': 'Something went wrong. We\'ll try an alternative approach.'
        };

        for (const [key, suggestion] of Object.entries(suggestions)) {
            if (error?.toLowerCase().includes(key.toLowerCase())) {
                return suggestion;
            }
        }

        return suggestions.default;
    }
}

// ============================================
// SINGLETON INSTANCES
// ============================================
const statusChecker = new WorkerStatusChecker();
const promptInjector = new SystemPromptInjector();
const errorRecovery = new ErrorRecoveryHandler();

// ============================================
// EXPORT TO GLOBAL
// ============================================
self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    statusChecker,
    promptInjector,
    errorRecovery,
    WorkerStatusChecker,
    SystemPromptInjector,
    ErrorRecoveryHandler
});

// Start periodic checking when extension loads
statusChecker.startPeriodicCheck();

console.log('[WorkerStatusChecker] Module loaded');
