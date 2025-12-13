/**
 * Worker Orchestrator
 * ====================
 * Handles AI-powered task routing and worker collaboration.
 * Main Worker (ChatGPT) acts as the brain that coordinates other workers.
 * 
 * Version: 1.0
 */

// ============================================
// ORCHESTRATION STATES
// ============================================
const OrchestrationState = {
    IDLE: 'idle',
    ANALYZING: 'analyzing',
    DELEGATING: 'delegating',
    WAITING_DELEGATE: 'waiting_delegate',
    SYNTHESIZING: 'synthesizing',
    COMPLETE: 'complete',
    ERROR: 'error'
};

// ============================================
// WORKER ORCHESTRATOR CLASS
// ============================================
class WorkerOrchestrator {
    constructor() {
        this.state = OrchestrationState.IDLE;
        this.currentTask = null;
        this.delegationChain = [];
        this.listeners = [];
    }

    /**
     * Main entry point: process a user query
     * Routes to Main Worker first, then handles delegation if needed
     */
    async processQuery(query, port) {
        this.state = OrchestrationState.ANALYZING;
        this.currentTask = {
            originalQuery: query,
            startTime: Date.now(),
            delegations: []
        };

        // First, check if we can pre-detect delegation needs
        const preAnalysis = this._preAnalyzeQuery(query);

        if (preAnalysis.shouldPrepareWorker) {
            // Warm up the target worker in background
            this._warmUpWorker(preAnalysis.targetWorker);
        }

        // Enhance query with system context for Main Worker
        const enhancedQuery = this._enhanceQueryForMainWorker(query, preAnalysis);

        return {
            enhancedQuery,
            preAnalysis,
            originalQuery: query
        };
    }

    /**
     * Pre-analyze query to detect if delegation might be needed
     * This helps prepare the target worker in advance
     */
    _preAnalyzeQuery(query) {
        const lowerQuery = query.toLowerCase();

        // Real-time data signals -> Perplexity
        const realTimeSignals = [
            'hôm nay', 'today', 'hiện tại', 'current', 'now', 'bây giờ',
            'giá cổ phiếu', 'stock price', 'giá vàng', 'gold price',
            'thời tiết', 'weather', 'tin tức', 'news', 'mới nhất', 'latest',
            'real-time', 'realtime', 'live', 'trực tiếp'
        ];

        // Twitter/social signals -> Grok
        const socialSignals = [
            'twitter', 'tweet', 'x.com', 'trending', 'viral',
            'hashtag', '#', 'elon musk', 'social media', 'mạng xã hội'
        ];

        // Vision/multimodal signals -> Gemini
        const visionSignals = [
            'hình ảnh', 'image', 'ảnh', 'photo', 'picture',
            'video', 'xem', 'nhìn', 'visual', 'analyze image',
            'phân tích ảnh', 'tạo video', 'create video'
        ];

        // Microsoft/Office signals -> Copilot
        const msSignals = [
            'microsoft', 'office', 'word', 'excel', 'powerpoint',
            'outlook', 'windows', 'teams', 'sharepoint'
        ];

        // Check each signal category
        for (const signal of realTimeSignals) {
            if (lowerQuery.includes(signal)) {
                return {
                    shouldPrepareWorker: true,
                    targetWorker: 'perplexity_web',
                    reason: `Detected real-time data need: "${signal}"`,
                    confidence: 0.8
                };
            }
        }

        for (const signal of socialSignals) {
            if (lowerQuery.includes(signal)) {
                return {
                    shouldPrepareWorker: true,
                    targetWorker: 'grok_web',
                    reason: `Detected social/Twitter data need: "${signal}"`,
                    confidence: 0.8
                };
            }
        }

        for (const signal of visionSignals) {
            if (lowerQuery.includes(signal)) {
                return {
                    shouldPrepareWorker: true,
                    targetWorker: 'gemini_web',
                    reason: `Detected vision/multimodal need: "${signal}"`,
                    confidence: 0.7
                };
            }
        }

        for (const signal of msSignals) {
            if (lowerQuery.includes(signal)) {
                return {
                    shouldPrepareWorker: true,
                    targetWorker: 'copilot_web',
                    reason: `Detected Microsoft/Office need: "${signal}"`,
                    confidence: 0.7
                };
            }
        }

        // No delegation needed - Main Worker will handle
        return {
            shouldPrepareWorker: false,
            targetWorker: null,
            reason: 'No specific capability needed, Main Worker will handle',
            confidence: 1.0
        };
    }

    /**
     * Enhance query with system context for Main Worker
     */
    _enhanceQueryForMainWorker(query, preAnalysis) {
        // If pre-analysis suggests delegation, add hint to Main Worker
        if (preAnalysis.shouldPrepareWorker) {
            const workerConfigs = self.ASKGPT_WORKERS?.WORKER_CONFIGS || {};
            const targetConfig = workerConfigs[preAnalysis.targetWorker];

            if (targetConfig) {
                // Add subtle hint without forcing delegation
                return query + `\n\n[System note: ${targetConfig.name} worker is available if you need ${targetConfig.strengths?.slice(0, 2).join(' or ')} capabilities]`;
            }
        }

        return query;
    }

    /**
     * Warm up a worker by ensuring its window is ready
     */
    async _warmUpWorker(workerId) {
        const workerManager = self.ASKGPT_BG?.workerManager;
        if (!workerManager) return;

        const worker = workerManager.getWorker(workerId);
        if (!worker || !worker.enabled) return;

        // Set status to connecting
        workerManager.updateStatus(workerId, 'connecting');

        // Try to prepare the window (but don't wait for it)
        try {
            // This would trigger window creation in the background
            console.log(`[Orchestrator] Warming up worker: ${workerId}`);
        } catch (e) {
            console.warn(`[Orchestrator] Failed to warm up ${workerId}:`, e);
        }
    }

    /**
     * Parse Main Worker response for delegation commands
     */
    parseDelegationCommand(responseText) {
        if (!responseText) return null;

        // Look for delegation JSON blocks
        const delegateMatch = responseText.match(/```delegate\s*([\s\S]*?)```/i);
        if (delegateMatch) {
            try {
                const command = JSON.parse(delegateMatch[1].trim());
                // Accept both "target" and "target_worker" for flexibility
                const targetWorker = command.target_worker || command.target;
                if (command.action === 'delegate' && targetWorker) {
                    console.log('[Orchestrator] Parsed delegation command:', command);
                    return {
                        type: 'delegate',
                        targetWorker: targetWorker,
                        query: command.query || this.currentTask?.originalQuery,
                        reason: command.reason || 'Delegation requested',
                        context: command.context || '',
                        returnToUser: command.return_to_user !== false
                    };
                }
            } catch (e) {
                console.warn('[Orchestrator] Failed to parse delegate command:', e);
            }
        }

        // Look for pipeline commands
        const pipelineMatch = responseText.match(/```pipeline\s*([\s\S]*?)```/i);
        if (pipelineMatch) {
            try {
                const command = JSON.parse(pipelineMatch[1].trim());
                if (command.action === 'pipeline' && Array.isArray(command.steps)) {
                    return {
                        type: 'pipeline',
                        steps: command.steps,
                        reason: command.reason || 'Multi-step task'
                    };
                }
            } catch (e) {
                console.warn('[Orchestrator] Failed to parse pipeline command:', e);
            }
        }

        // Check for simple delegation phrases
        const simplePatterns = [
            /đang (hỏi|chuyển cho|nhờ)\s+(\w+)/i,
            /asking\s+(\w+)\s+for/i,
            /delegating to\s+(\w+)/i,
            /let me ask\s+(\w+)/i
        ];

        for (const pattern of simplePatterns) {
            const match = responseText.match(pattern);
            if (match) {
                const workerName = match[1] || match[2];
                const workerId = this._resolveWorkerName(workerName);
                if (workerId) {
                    return {
                        type: 'delegate',
                        targetWorker: workerId,
                        query: this.currentTask?.originalQuery,
                        reason: `Implicit delegation to ${workerName}`,
                        implicit: true
                    };
                }
            }
        }

        return null;
    }

    /**
     * Resolve worker name to worker ID
     */
    _resolveWorkerName(name) {
        const nameLower = name.toLowerCase();

        const nameMap = {
            'perplexity': 'perplexity_web',
            'gemini': 'gemini_web',
            'grok': 'grok_web',
            'copilot': 'copilot_web',
            'chatgpt': 'chatgpt_web',
            'gpt': 'chatgpt_web'
        };

        return nameMap[nameLower] || null;
    }

    /**
     * Execute delegation to another worker
     */
    async executeDelegation(delegation, port) {
        this.state = OrchestrationState.DELEGATING;

        const workerManager = self.ASKGPT_BG?.workerManager;
        if (!workerManager) {
            throw new Error('Worker manager not available');
        }

        const targetWorker = workerManager.getWorker(delegation.targetWorker);
        if (!targetWorker) {
            throw new Error(`Unknown worker: ${delegation.targetWorker}`);
        }

        if (!targetWorker.enabled) {
            throw new Error(`Worker ${targetWorker.name} is not enabled`);
        }

        // Update worker status
        workerManager.setWorkerBusy(delegation.targetWorker, 'Processing delegated task');

        // Record delegation
        this.currentTask.delegations.push({
            worker: delegation.targetWorker,
            query: delegation.query,
            startTime: Date.now()
        });

        // Notify UI about delegation
        this._notifyDelegation(delegation, port);

        this.state = OrchestrationState.WAITING_DELEGATE;

        // Execute the delegated task using WindowBridge
        try {
            if (self.ASKGPT_BG?.createBridgeSession) {
                const session = self.ASKGPT_BG.createBridgeSession(delegation.targetWorker, port);
                const response = await session.execute(delegation.query, {
                    maxRetries: 2,
                    responseTimeout: 120000
                });

                workerManager.setWorkerReady(delegation.targetWorker);

                return {
                    success: true,
                    response: response.html || response.text,
                    worker: targetWorker.name
                };
            }
        } catch (e) {
            workerManager.updateStatus(delegation.targetWorker, 'error', e.message);
            throw e;
        }

        return { success: false, error: 'Bridge system not available' };
    }

    /**
     * Notify UI about delegation happening
     */
    _notifyDelegation(delegation, port) {
        const workerConfigs = self.ASKGPT_WORKERS?.WORKER_CONFIGS || {};
        const mainWorker = workerConfigs['chatgpt_web'];
        const targetWorker = workerConfigs[delegation.targetWorker];

        if (port) {
            try {
                port.postMessage({
                    status: 'delegation',
                    from: {
                        id: 'chatgpt_web',
                        name: mainWorker?.name || 'ChatGPT',
                        icon: mainWorker?.icon || '🤖'
                    },
                    to: {
                        id: delegation.targetWorker,
                        name: targetWorker?.name || delegation.targetWorker,
                        icon: targetWorker?.icon || '🔄'
                    },
                    reason: delegation.reason,
                    query: delegation.query
                });
            } catch (e) {
                console.warn('[Orchestrator] Failed to notify delegation:', e);
            }
        }

        // Also broadcast to sidepanel
        chrome.runtime.sendMessage({
            action: 'worker_delegation',
            from: 'chatgpt_web',
            to: delegation.targetWorker,
            reason: delegation.reason
        }).catch(() => { });
    }

    /**
     * Clean response text by removing delegation blocks
     */
    cleanResponseText(text) {
        if (!text) return text;

        // Remove delegation blocks
        return text
            .replace(/```delegate[\s\S]*?```/gi, '')
            .replace(/```pipeline[\s\S]*?```/gi, '')
            .replace(/\[System note:[\s\S]*?\]/gi, '')
            .trim();
    }

    /**
     * Add event listener
     */
    addListener(callback) {
        this.listeners.push(callback);
        return () => {
            const idx = this.listeners.indexOf(callback);
            if (idx > -1) this.listeners.splice(idx, 1);
        };
    }

    /**
     * Notify listeners
     */
    _notify(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (e) {
                console.error('[Orchestrator] Listener error:', e);
            }
        }
    }

    /**
     * Reset state
     */
    reset() {
        this.state = OrchestrationState.IDLE;
        this.currentTask = null;
        this.delegationChain = [];
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================
const workerOrchestrator = new WorkerOrchestrator();

// ============================================
// EXPORT TO GLOBAL
// ============================================
self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    workerOrchestrator,
    WorkerOrchestrator,
    OrchestrationState
});

console.log('[WorkerOrchestrator] Module loaded');
