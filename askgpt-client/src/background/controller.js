// Main port controller: route worker requests and orchestrate collaboration
// v3.0 - Now with Worker Orchestrator for delegation & collaboration

// Feature flag: Use new Bridge system (can be toggled via storage)
const USE_BRIDGE_SYSTEM = true;
const USE_ORCHESTRATOR = true;

chrome.runtime.onConnect.addListener(async (port) => {
    if (port.name !== "ask-gpt-port") return;

    let disconnected = false;
    port.onDisconnect.addListener(() => { disconnected = true; });
    const safePost = (payload) => { if (disconnected) return; try { port.postMessage(payload); } catch (_) { } };

    port.onMessage.addListener(async (request) => {
        const config = await chrome.storage.sync.get(['geminiApiKey', 'useBridge']);
        const useBridge = config.useBridge !== false && USE_BRIDGE_SYSTEM;

        // Always clear old provider settings
        await chrome.storage.sync.remove(['provider', 'ai_provider']);

        // === Get active worker from enabled workers ===
        let workerId = 'chatgpt_web'; // Default fallback

        // Try to get first enabled worker from WorkerManager
        const workerManager = self.ASKGPT_BG?.workerManager;

        console.log('[Controller] WorkerManager exists:', !!workerManager);

        if (workerManager) {
            await workerManager.init(); // Ensure initialized
            const enabledWorkers = workerManager.getEnabledWorkers();

            console.log('[Controller] Enabled workers:', enabledWorkers.map(w => w.id));

            if (enabledWorkers.length > 0) {
                // Prefer Main Worker if enabled
                const mainWorker = enabledWorkers.find(w => w.role === 'main');
                if (mainWorker) {
                    workerId = mainWorker.id;
                } else {
                    // Use first enabled specialist
                    workerId = enabledWorkers[0].id;
                }
            } else {
                // No workers enabled - show error
                safePost({
                    status: 'error',
                    error: '⚠️ No workers enabled. Click an avatar (🤖✨🔍) below to enable a worker first.'
                });
                return;
            }
        } else {
            console.warn('[Controller] WorkerManager not available, using default ChatGPT');
        }

        console.log('[Controller] Selected worker:', workerId);

        try {
            // Handle Gemini API separately (no window needed)
            if (workerId === 'gemini_api') {
                await self.ASKGPT_BG.handleGeminiAPI(port, request.query, config.geminiApiKey);
                return;
            }

            // ========================================
            // 1. PARSE TOOL AND SEQUENCE FROM ORIGINAL QUERY
            // ========================================
            const toolParsed = parseToolCommands(request.query);
            const sequenceParsed = parseSequence(request.query); // Parse from ORIGINAL query
            let queryToProcess = request.query;
            let pageContent = null;

            // Get page content if tool needs it
            if (toolParsed.hasTools) {
                console.log('[Controller] Tool commands detected:', toolParsed.toolNames);

                safePost({
                    status: 'progress',
                    message: `${toolParsed.tools[0].icon} Extracting page content...`
                });

                if (toolParsed.tools.some(t => t.requiresPageContent)) {
                    pageContent = await getCurrentPageContent();

                    if (!pageContent) {
                        safePost({
                            status: 'error',
                            error: '⚠️ Could not extract page content. Make sure you are on a webpage.'
                        });
                        return;
                    }
                    console.log('[Controller] Page content extracted, length:', pageContent.length);
                }
            }

            // ========================================
            // 2. SEQUENCE + TOOL (e.g., /summary @chatgpt > @gemini)
            // ========================================
            if (sequenceParsed.isSequence) {
                console.log('[Controller] Sequence detected:', sequenceParsed.steps.map(s => s.workerId));

                // Build initial input - combine tool prompt if present
                let initialInput = sequenceParsed.finalQuery || '';

                if (toolParsed.hasTools && pageContent) {
                    // Tool + Sequence: ChatGPT gets page + tool prompt, Gemini gets ChatGPT's output
                    initialInput = await executeToolCommand(
                        toolParsed.tools[0],
                        pageContent,
                        initialInput || toolParsed.cleanQuery
                    );
                    console.log('[Controller] Tool+Sequence: built initial input, length:', initialInput.length);
                } else if (!initialInput && toolParsed.cleanQuery) {
                    initialInput = toolParsed.cleanQuery;
                }

                safePost({
                    status: 'progress',
                    message: `🔗 Starting pipeline with ${sequenceParsed.steps.length} steps...`
                });

                const sequenceResult = await executeSequence(
                    sequenceParsed,
                    initialInput,
                    safePost,
                    workerManager
                );

                if (sequenceResult.success) {
                    const resultHtml = buildSequenceResultHtml(sequenceResult);
                    safePost({
                        status: 'success',
                        answer: resultHtml,
                        worker: { id: 'sequence', name: 'Pipeline', icon: '🔗' },
                        meta: { sequence: true, steps: sequenceResult.results.length }
                    });
                } else {
                    safePost({
                        status: 'error',
                        error: `Pipeline failed: ${sequenceResult.error}`
                    });
                }
                return;
            }

            // ========================================
            // 3. TOOL ONLY (no sequence)
            // ========================================
            if (toolParsed.hasTools && pageContent) {
                queryToProcess = await executeToolCommand(
                    toolParsed.tools[0],
                    pageContent,
                    toolParsed.cleanQuery
                );
                console.log('[Controller] Tool query built, length:', queryToProcess.length);
            }

            // ========================================
            // 4. SMART @MENTIONS PARSING (Parallel/Independent)
            // ========================================
            const smartParsed = parseSmartMentions(queryToProcess);

            if (smartParsed.tasks.length > 1 || (smartParsed.type === 'independent' && smartParsed.tasks.length > 0)) {
                // PARALLEL MODE: Send to multiple workers
                console.log('[Controller] Smart parsing result:', smartParsed);

                // Filter to only enabled workers and track skipped ones
                const enabledTasks = [];
                const skippedWorkers = [];

                for (const taskInfo of smartParsed.tasks) {
                    const targetWorker = workerManager?.getWorker(taskInfo.workerId);

                    if (!targetWorker?.enabled) {
                        const workerName = targetWorker?.name || taskInfo.workerId.replace('_web', '');
                        skippedWorkers.push(workerName);
                        continue;
                    }

                    enabledTasks.push({
                        ...taskInfo,
                        worker: targetWorker
                    });
                }

                // Show warning if some workers are OFF
                if (skippedWorkers.length > 0) {
                    safePost({
                        status: 'progress',
                        message: `⚠️ ${skippedWorkers.join(', ')} is OFF. Proceeding with enabled workers only.`
                    });
                }

                // If no enabled workers, fallback to default
                if (enabledTasks.length === 0) {
                    const availableWorker = workerManager?.getAvailableWorker([]);
                    if (availableWorker) {
                        safePost({
                            status: 'progress',
                            message: `⚠️ All mentioned workers are OFF. Using ${availableWorker.name} instead.`
                        });
                        // Continue with single worker mode below
                    } else {
                        safePost({
                            status: 'error',
                            error: '❌ All mentioned workers are OFF and no alternatives available.'
                        });
                        return;
                    }
                }

                // If only 1 enabled worker, treat as single worker mode (not parallel)
                if (enabledTasks.length === 1) {
                    workerId = enabledTasks[0].workerId;
                    queryToProcess = enabledTasks[0].task;
                    // Fall through to single worker execution below
                } else if (enabledTasks.length > 1) {
                    // Proceed with parallel execution
                    const workerPromises = [];

                    for (const taskInfo of enabledTasks) {
                        const targetWorkerId = taskInfo.workerId;
                        const taskQuery = taskInfo.task;
                        const targetWorker = taskInfo.worker;

                        // Check if worker is busy, try to find alternative
                        let actualWorkerId = targetWorkerId;
                        if (workerManager.isWorkerBusy(targetWorkerId)) {
                            safePost({
                                status: 'progress',
                                message: `${targetWorker.name} is busy, looking for alternative...`
                            });

                            const available = workerManager.getAvailableWorker([targetWorkerId]);
                            if (available) {
                                actualWorkerId = available.id;
                                console.log(`[Controller] ${targetWorkerId} busy, using ${actualWorkerId} instead`);
                            } else {
                                console.log(`[Controller] All workers busy, queuing ${targetWorkerId}`);
                            }
                        }

                        // Create parallel execution promise
                        const workerPromise = (async () => {
                            const worker = workerManager.getWorker(actualWorkerId);
                            const taskPreview = taskQuery.slice(0, 30) + (taskQuery.length > 30 ? '...' : '');

                            safePost({
                                status: 'progress',
                                message: `${worker.icon} ${worker.name}: "${taskPreview}"`,
                                worker: { id: actualWorkerId, name: worker.name, icon: worker.icon }
                            });

                            try {
                                workerManager.setWorkerBusy(actualWorkerId, taskPreview);

                                const session = self.ASKGPT_BG.createBridgeSession(actualWorkerId, port);
                                const response = await session.execute(taskQuery, {
                                    maxRetries: 2,
                                    responseTimeout: 120000
                                });

                                workerManager.setWorkerReady(actualWorkerId);

                                return {
                                    workerId: actualWorkerId,
                                    success: true,
                                    response: response.html || response.text,
                                    taskQuery: taskQuery, // Include original task
                                    taskType: taskInfo.type,
                                    worker: {
                                        id: actualWorkerId,
                                        name: worker.name,
                                        icon: worker.icon,
                                        color: worker.color
                                    }
                                };
                            } catch (e) {
                                workerManager.updateStatus(actualWorkerId, 'error', e.message);
                                return {
                                    workerId: actualWorkerId,
                                    success: false,
                                    error: e.message
                                };
                            }
                        })();

                        workerPromises.push(workerPromise);
                    }

                    // Wait for all parallel executions
                    const results = await Promise.all(workerPromises);

                    // Build combined response with all worker outputs
                    let combinedHtml = '<div class="sp-parallel-responses">';
                    for (const result of results) {
                        if (result.success && result.worker) {
                            // Show task preview for independent tasks
                            const taskHint = result.taskType === 'independent' && result.taskQuery
                                ? `<div class="sp-task-preview">"${result.taskQuery.slice(0, 50)}${result.taskQuery.length > 50 ? '...' : ''}"</div>`
                                : '';

                            combinedHtml += `
                            <div class="sp-parallel-response" data-worker="${result.workerId}">
                                <div class="sp-worker-header">
                                    <span class="sp-worker-badge" style="--worker-color: ${result.worker.color || '#6b7280'}">
                                        <span class="sp-worker-badge-icon">${result.worker.icon}</span>
                                        <span class="sp-worker-badge-name">${result.worker.name}</span>
                                    </span>
                                    ${taskHint}
                                </div>
                                <div class="sp-bubble-content">${result.response}</div>
                            </div>
                        `;
                        } else if (result.error) {
                            combinedHtml += `
                            <div class="sp-parallel-response error">
                                <em>Error from ${result.workerId}: ${result.error}</em>
                            </div>
                        `;
                        }
                    }
                    combinedHtml += '</div>';

                    safePost({
                        status: 'success',
                        answer: combinedHtml,
                        worker: { id: 'parallel', name: 'Multiple Workers', icon: '👥' },
                        meta: { parallel: true, workerCount: results.filter(r => r.success).length }
                    });
                    return;
                }
            }

            // ========================================
            // 5. SINGLE @MENTION or DEFAULT ROUTING
            // ========================================
            const mentionedWorkers = detectAllWorkerMentions(queryToProcess);
            const directWorker = mentionedWorkers.length === 1 ? mentionedWorkers[0] : null;

            if (directWorker && directWorker !== workerId) {
                const targetWorker = workerManager?.getWorker(directWorker);

                if (targetWorker?.enabled) {
                    // Check if busy, try fallback
                    if (workerManager.isWorkerBusy(directWorker)) {
                        const available = workerManager.getAvailableWorker([directWorker]);
                        if (available && available.id !== directWorker) {
                            safePost({
                                status: 'progress',
                                message: `${targetWorker.name} is busy, using ${available.name} instead...`
                            });
                            workerId = available.id;
                        } else {
                            // Use the busy worker anyway (will queue)
                            workerId = directWorker;
                            safePost({
                                status: 'progress',
                                message: `${targetWorker.name} is busy, queuing request...`
                            });
                        }
                    } else {
                        workerId = directWorker;
                        safePost({
                            status: 'progress',
                            message: `Routing to ${targetWorker.name}...`
                        });
                    }
                } else {
                    // WORKER IS OFF - Try to find alternative or show clear error
                    const workerName = targetWorker?.name || directWorker.replace('_web', '');

                    // Find an available alternative worker
                    const availableWorker = workerManager?.getAvailableWorker([]);

                    if (availableWorker) {
                        // Use available worker as fallback
                        safePost({
                            status: 'progress',
                            message: `⚠️ ${workerName} is OFF. Using ${availableWorker.name} instead. Enable ${workerName} by clicking its avatar.`
                        });
                        workerId = availableWorker.id;

                        // Clean the query - remove the @mention since we're using different worker
                        queryToProcess = removeWorkerMentions(queryToProcess);
                    } else {
                        // No workers available at all
                        safePost({
                            status: 'error',
                            error: `❌ ${workerName} is OFF and no other workers are available. Click an avatar below to enable a worker first.`
                        });
                        return;
                    }
                }
            }

            // ========================================
            // SMART AUTO-ROUTING (Based on query keywords)
            // ========================================
            // Use queryToProcess (may have been cleaned of @mentions)
            let queryToSend = queryToProcess;

            // Analyze query for auto-routing (only if Main Worker is selected)
            if (workerId === 'chatgpt_web' && workerManager) {
                const routingResult = analyzeQueryForRouting(queryToProcess);

                if (routingResult.shouldRoute && routingResult.targetWorker !== 'chatgpt_web') {
                    const targetWorker = workerManager.getWorker(routingResult.targetWorker);

                    if (targetWorker?.enabled) {
                        console.log('[Controller] Auto-routing to:', routingResult.targetWorker, 'Reason:', routingResult.reason);
                        workerId = routingResult.targetWorker;

                        safePost({
                            status: 'progress',
                            message: `🔄 Routing to ${targetWorker.name} (${routingResult.reason})`
                        });
                    }
                }
            }

            // ========================================
            // DELEGATION INSTRUCTION (Main Worker only, skip if already routed)
            // ========================================
            // Only add delegation hints if:
            // 1. Using ChatGPT as main worker
            // 2. Not a fallback from explicit @mention
            // 3. Query doesn't already have instructions
            // Check if user explicitly mentioned ANY worker (including clones like @chatgpt2)
            const hasExplicitMention = /@(chatgpt|gpt|gemini|gem|perplexity|pplx|search|copilot|bing|grok|x)\d*/i.test(request.query);

            if (workerId === 'chatgpt_web' && USE_ORCHESTRATOR && !hasExplicitMention) {
                // Get list of enabled specialists (exclude main worker)
                const allEnabled = workerManager?.getEnabledWorkers() || [];
                console.log('[Controller] All enabled workers:', allEnabled.map(w => `${w.id}(${w.role})`));

                const specialists = allEnabled.filter(w => w.id !== 'chatgpt_web');
                const enabledSpecialists = specialists
                    .map(w => `${w.name}(${w.id})`)
                    .join(', ') || '';

                console.log('[Controller] Specialists for delegation:', enabledSpecialists);

                if (specialists.length > 0) {
                    const delegationHint = `[System: You have AI helpers. If user needs real-time data/prices/news, output:
\`\`\`delegate
{"action":"delegate","target":"perplexity_web","query":"search query"}
\`\`\`
Helpers: ${enabledSpecialists}]

`;
                    queryToSend = delegationHint + queryToSend;
                    console.log('[Controller] Added delegation instruction');
                }
            }

            // Log final worker selection
            console.log('[Controller] Final worker:', workerId);
            console.log('[Controller] Query length:', queryToSend.length);


            // ========================================
            // Send to Main Worker (or selected worker)
            // ========================================
            if (useBridge && self.ASKGPT_BG.createBridgeSession) {
                console.log('[Controller] Using WindowBridge with worker:', workerId);

                try {
                    // Update worker status
                    if (self.ASKGPT_BG?.workerManager) {
                        self.ASKGPT_BG.workerManager.setWorkerBusy(workerId, 'Processing...');
                    }

                    const session = self.ASKGPT_BG.createBridgeSession(workerId, port);
                    const response = await session.execute(queryToSend, {
                        maxRetries: 2,
                        responseTimeout: 120000  // 2 minutes for long responses
                    });

                    // Update worker status
                    if (self.ASKGPT_BG?.workerManager) {
                        self.ASKGPT_BG.workerManager.setWorkerReady(workerId);
                    }

                    // Clear any previous errors on success
                    if (self.ASKGPT_BG?.errorRecovery) {
                        self.ASKGPT_BG.errorRecovery.clearErrors(workerId);
                    }

                    // ========================================
                    // PHASE 3: Check for delegation in response
                    // ========================================
                    if (USE_ORCHESTRATOR && self.ASKGPT_BG?.workerOrchestrator) {
                        const orchestrator = self.ASKGPT_BG.workerOrchestrator;
                        const responseText = response.html || response.text || '';
                        const delegation = orchestrator.parseDelegationCommand(responseText);

                        if (delegation) {
                            console.log('[Controller] Delegation detected:', delegation);

                            // Execute delegation with error recovery
                            try {
                                safePost({
                                    status: 'progress',
                                    message: `Delegating to ${delegation.targetWorker}...`
                                });

                                const delegationResult = await orchestrator.executeDelegation(delegation, port);

                                if (delegationResult.success) {
                                    // Combine original response (cleaned) with delegation result
                                    const cleanedOriginal = orchestrator.cleanResponseText(responseText);
                                    const combinedResponse = buildCombinedResponse(
                                        cleanedOriginal,
                                        delegationResult,
                                        delegation
                                    );

                                    safePost({ status: 'success', answer: combinedResponse });

                                    // Clear errors on delegation success
                                    if (self.ASKGPT_BG?.errorRecovery) {
                                        self.ASKGPT_BG.errorRecovery.clearErrors(delegation.targetWorker);
                                    }
                                } else {
                                    // Delegation failed, return original response
                                    safePost({
                                        status: 'success',
                                        answer: orchestrator.cleanResponseText(responseText)
                                    });
                                }
                                return;
                            } catch (delegationError) {
                                console.warn('[Controller] Delegation failed:', delegationError);

                                // Record error and try fallback
                                if (self.ASKGPT_BG?.errorRecovery) {
                                    const errorRecovery = self.ASKGPT_BG.errorRecovery;
                                    errorRecovery.recordError(delegation.targetWorker, delegationError.message);

                                    // Try fallback worker
                                    const fallbackId = errorRecovery.getFallbackWorker(delegation.targetWorker);
                                    if (fallbackId && fallbackId !== delegation.targetWorker) {
                                        safePost({
                                            status: 'progress',
                                            message: `Trying fallback: ${self.ASKGPT_WORKERS?.WORKER_CONFIGS?.[fallbackId]?.name || fallbackId}...`
                                        });

                                        // Attempt fallback delegation
                                        try {
                                            delegation.targetWorker = fallbackId;
                                            const fallbackResult = await orchestrator.executeDelegation(delegation, port);
                                            if (fallbackResult.success) {
                                                const cleanedOriginal = orchestrator.cleanResponseText(responseText);
                                                const combinedResponse = buildCombinedResponse(
                                                    cleanedOriginal,
                                                    fallbackResult,
                                                    delegation
                                                );
                                                safePost({ status: 'success', answer: combinedResponse });
                                                return;
                                            }
                                        } catch (fallbackError) {
                                            console.warn('[Controller] Fallback also failed:', fallbackError);
                                        }
                                    }
                                }

                                // Continue with original response
                                safePost({
                                    status: 'success',
                                    answer: orchestrator.cleanResponseText(responseText)
                                });
                                return;
                            }
                        }
                    }

                    // No delegation - success handled inside session.execute() via notifySuccess
                    console.log('[Controller] Bridge completed successfully', session.metrics);
                    return;

                } catch (bridgeError) {
                    console.warn('[Controller] Bridge failed:', bridgeError);

                    // Record error for recovery tracking
                    if (self.ASKGPT_BG?.errorRecovery) {
                        const errorRecovery = self.ASKGPT_BG.errorRecovery;
                        const errorCount = errorRecovery.recordError(workerId, bridgeError.message);

                        // Check if worker should be temporarily disabled
                        if (errorRecovery.shouldDisableWorker(workerId)) {
                            const suggestion = errorRecovery.getRecoverySuggestion(workerId, bridgeError.message);
                            safePost({
                                status: 'progress',
                                message: `Worker experiencing issues. ${suggestion}`
                            });
                        }
                    }

                    // Update worker status
                    if (self.ASKGPT_BG?.workerManager) {
                        self.ASKGPT_BG.workerManager.updateStatus(workerId, 'error', bridgeError.message);
                    }

                    safePost({ status: 'progress', message: 'Retrying with alternative method...' });
                    // Fall through to legacy method
                }
            }

            // ========================================
            // LEGACY: Original implementation (fallback)
            // ========================================
            console.log('[Controller] Using legacy system');

            const winData = await self.ASKGPT_BG.ensureWindow(workerId, port);
            const initialCount = await self.ASKGPT_BG.getMessageCount(winData.tabId, workerId);

            safePost({ status: 'progress', message: "Connecting to AI..." });

            // Use the cleaned query (without @mentions), not original request.query
            const sendRes = await self.ASKGPT_BG.sendTextViaDebugger(winData.windowId, winData.tabId, queryToSend, workerId);
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
                    args: [initialCount, workerId]
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

            self.ASKGPT_BG.pollUntilDone(winData.windowId, winData.tabId, initialCount, workerId, port);

        } catch (err) {
            console.error('[Controller] Error:', err);
            safePost({ status: "error", error: err.message });

            // Reset worker status on error
            if (self.ASKGPT_BG?.workerManager) {
                self.ASKGPT_BG.workerManager.updateStatus(workerId, 'error', err.message);
            }
        }
    });
});

/**
 * Build combined response with delegation result
 */
function buildCombinedResponse(originalResponse, delegationResult, delegation) {
    const workerConfigs = self.ASKGPT_WORKERS?.WORKER_CONFIGS || {};
    const mainWorker = workerConfigs['chatgpt_web'];
    const targetWorker = workerConfigs[delegation.targetWorker];

    // Create collaboration header
    const collabHeader = `
        <div class="sp-collab-indicator">
            <span>${mainWorker?.icon || '🤖'} ${mainWorker?.name || 'ChatGPT'}</span>
            <span class="sp-collab-arrow">→</span>
            <span>${targetWorker?.icon || '🔄'} ${targetWorker?.name || delegation.targetWorker}</span>
        </div>
    `;

    // Combine responses
    let combined = '';

    if (originalResponse && originalResponse.trim()) {
        combined += `<div class="sp-original-response">${originalResponse}</div>`;
    }

    combined += collabHeader;
    combined += `<div class="sp-delegated-response">${delegationResult.response}</div>`;

    return combined;
}

/**
 * Detect if user directly mentioned a worker in their query
 * Examples: "@gemini", "ask perplexity", "use grok for..."
 * Returns the first matching worker ID
 */
function detectDirectWorkerMention(query) {
    const mentions = detectAllWorkerMentions(query);
    return mentions.length > 0 ? mentions[0] : null;
}

/**
 * Worker mention patterns
 */
const WORKER_PATTERNS = {
    'chatgpt_web': ['@chatgpt', '@gpt'],
    'gemini_web': ['@gemini', '@gem'],
    'perplexity_web': ['@perplexity', '@pplx', '@search'],
    'copilot_web': ['@copilot', '@bing'],
    'grok_web': ['@grok', '@x']
};

/**
 * Detect ALL worker mentions in query (for parallel execution)
 * Examples: "@gemini @perplexity what is..." -> ['gemini_web', 'perplexity_web']
 * Also supports clones: "@chatgpt2" -> ['chatgpt_web_2']
 */
function detectAllWorkerMentions(query) {
    const lowerQuery = query.toLowerCase();
    const foundWorkers = [];

    console.log('[detectAllWorkerMentions] Query:', query);

    // Check default worker patterns
    for (const [workerId, mentions] of Object.entries(WORKER_PATTERNS)) {
        for (const mention of mentions) {
            // Use word boundary check to avoid @chatgpt matching in @chatgpt2
            const regex = new RegExp(mention + '(?!\\d)', 'i');
            if (regex.test(lowerQuery)) {
                if (!foundWorkers.includes(workerId)) {
                    foundWorkers.push(workerId);
                    console.log('[detectAllWorkerMentions] Found default:', workerId, 'via', mention);
                }
                break;
            }
        }
    }

    // Check for clone mentions (e.g., @chatgpt2, @gemini3)
    // Pattern: @workerNameN where N is a number
    const clonePattern = /@(chatgpt|gemini|perplexity|copilot|grok)(\d+)/gi;
    let match;
    while ((match = clonePattern.exec(query)) !== null) {
        const baseName = match[1].toLowerCase();
        const cloneNum = match[2];

        // Map base name to worker ID
        const baseIdMap = {
            'chatgpt': 'chatgpt_web',
            'gemini': 'gemini_web',
            'perplexity': 'perplexity_web',
            'copilot': 'copilot_web',
            'grok': 'grok_web'
        };

        const baseId = baseIdMap[baseName];
        if (baseId) {
            const cloneId = `${baseId}_${cloneNum}`;
            // Check if this clone exists in WorkerManager
            const workerManager = self.ASKGPT_BG?.workerManager;
            if (workerManager?.getWorker(cloneId)) {
                if (!foundWorkers.includes(cloneId)) {
                    foundWorkers.push(cloneId);
                    console.log('[detectAllWorkerMentions] Found clone:', cloneId);
                }
            } else {
                console.log('[detectAllWorkerMentions] Clone not registered:', cloneId);
            }
        }
    }

    console.log('[detectAllWorkerMentions] Result:', foundWorkers);
    return foundWorkers;
}

/**
 * SMART PARSING: Parse query to detect independent vs shared tasks
 * 
 * Independent tasks (each worker gets different task):
 *   "@gemini: analyze this @chatgpt: summarize that"
 *   -> [{ workerId: 'gemini_web', task: 'analyze this' }, { workerId: 'chatgpt_web', task: 'summarize that' }]
 * 
 * Shared task (all workers get same task):
 *   "@gemini @chatgpt what is AI?"
 *   -> [{ workerId: 'gemini_web', task: 'what is AI?' }, { workerId: 'chatgpt_web', task: 'what is AI?' }]
 */
function parseSmartMentions(query) {
    // Pattern for @worker: task (independent tasks)
    // Match: @worker followed by : and then content until next @worker or end
    // Now includes clone support: @chatgpt2:, @gemini3:, etc.
    const independentPattern = /@(chatgpt\d*|gpt\d*|gemini\d*|gem\d*|perplexity\d*|pplx\d*|search|copilot\d*|bing|grok\d*|x)\s*:\s*([^@]+)/gi;

    const independentMatches = [];
    let match;

    while ((match = independentPattern.exec(query)) !== null) {
        const mentionName = match[1].toLowerCase();
        const task = match[2].trim();
        const workerId = resolveWorkerName(mentionName);

        if (workerId && task) {
            independentMatches.push({
                workerId,
                task,
                type: 'independent'
            });
        }
    }

    // If we found independent tasks, return them
    if (independentMatches.length > 0) {
        return {
            type: 'independent',
            tasks: independentMatches
        };
    }

    // Otherwise, check for shared task pattern: @worker1 @worker2 task
    // or @worker1, @worker2: task
    const sharedWorkers = detectAllWorkerMentions(query);

    if (sharedWorkers.length > 0) {
        const cleanTask = removeWorkerMentions(query);

        return {
            type: 'shared',
            tasks: sharedWorkers.map(workerId => ({
                workerId,
                task: cleanTask,
                type: 'shared'
            }))
        };
    }

    // No @mentions found
    return {
        type: 'none',
        tasks: []
    };
}

/**
 * Resolve mention name to worker ID
 * Supports clones: chatgpt2 -> chatgpt_web_2
 */
function resolveWorkerName(name) {
    const lowerName = name.toLowerCase();

    // Check for clone pattern first (e.g., chatgpt2, gemini3)
    const cloneMatch = lowerName.match(/^(chatgpt|gpt|gemini|gem|perplexity|pplx|copilot|grok)(\d+)$/);
    if (cloneMatch) {
        const baseName = cloneMatch[1];
        const cloneNum = cloneMatch[2];

        const baseIdMap = {
            'chatgpt': 'chatgpt_web',
            'gpt': 'chatgpt_web',
            'gemini': 'gemini_web',
            'gem': 'gemini_web',
            'perplexity': 'perplexity_web',
            'pplx': 'perplexity_web',
            'copilot': 'copilot_web',
            'grok': 'grok_web'
        };

        const baseId = baseIdMap[baseName];
        if (baseId) {
            const cloneId = `${baseId}_${cloneNum}`;
            // Verify clone exists
            const workerManager = self.ASKGPT_BG?.workerManager;
            if (workerManager?.getWorker(cloneId)) {
                return cloneId;
            }
        }
    }

    // Default worker mapping
    const nameMap = {
        'chatgpt': 'chatgpt_web',
        'gpt': 'chatgpt_web',
        'gemini': 'gemini_web',
        'gem': 'gemini_web',
        'perplexity': 'perplexity_web',
        'pplx': 'perplexity_web',
        'search': 'perplexity_web',
        'copilot': 'copilot_web',
        'bing': 'copilot_web',
        'grok': 'grok_web',
        'x': 'grok_web'
    };
    return nameMap[lowerName] || null;
}

/**
 * Remove @mentions from query to get clean text
 * Supports clones: @chatgpt2, @gemini3
 */
function removeWorkerMentions(query) {
    return query
        // Remove clone mentions (@chatgpt2, @gemini3, etc.)
        .replace(/@(chatgpt|gpt|gemini|gem|perplexity|pplx|copilot|grok)\d*\s*[,:]?\s*/gi, '')
        // Remove default mentions (@search, @bing, @x)
        .replace(/@(search|bing|x)\s*[,:]?\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Analyze query to determine which worker is best suited
 * Returns routing decision with reason
 */
function analyzeQueryForRouting(query) {
    const lowerQuery = query.toLowerCase();

    // Keywords that indicate specific worker strengths
    const routingRules = [
        // Perplexity - Real-time data, search, news
        {
            worker: 'perplexity_web',
            keywords: [
                'giá cổ phiếu', 'stock price', 'giá vàng', 'gold price',
                'thời tiết', 'weather', 'tin tức', 'news',
                'hôm nay', 'today', 'bây giờ', 'now', 'hiện tại', 'current',
                'mới nhất', 'latest', 'tỷ giá', 'exchange rate',
                'search for', 'tìm kiếm', 'tra cứu', 'look up'
            ],
            reason: 'Real-time data'
        },
        // Gemini - Images, video, multimodal
        {
            worker: 'gemini_web',
            keywords: [
                'analyze image', 'phân tích ảnh', 'hình ảnh', 'image',
                'create video', 'tạo video', 'video',
                'nhìn', 'look at', 'see this', 'xem',
                'describe picture', 'mô tả hình'
            ],
            reason: 'Multimodal/Vision'
        },
        // Grok - Twitter, social media
        {
            worker: 'grok_web',
            keywords: [
                'twitter', 'tweet', 'x.com', 'trending on twitter',
                'viral', 'meme', 'social media', 'mạng xã hội',
                'elon musk', 'trending topic', 'hashtag'
            ],
            reason: 'Twitter/Social'
        },
        // Copilot - Microsoft, Office
        {
            worker: 'copilot_web',
            keywords: [
                'microsoft', 'office', 'word', 'excel', 'powerpoint',
                'windows', 'outlook', 'teams', 'onedrive'
            ],
            reason: 'Microsoft/Office'
        }
    ];

    // Check each rule
    for (const rule of routingRules) {
        for (const keyword of rule.keywords) {
            if (lowerQuery.includes(keyword)) {
                return {
                    shouldRoute: true,
                    targetWorker: rule.worker,
                    reason: rule.reason,
                    matchedKeyword: keyword
                };
            }
        }
    }

    // No specific routing needed, use default (ChatGPT)
    return {
        shouldRoute: false,
        targetWorker: 'chatgpt_web',
        reason: 'General query'
    };
}

// ============================================
// /TOOL COMMANDS
// ============================================

/**
 * Available tools that can be invoked with /tool syntax
 */
const TOOL_COMMANDS = {
    'summary': {
        name: 'Summary',
        icon: '📝',
        description: 'Summarize current page content',
        requiresPageContent: true,
        prompt: 'Please summarize the following webpage content:\n\n'
    },
    'analyze': {
        name: 'Analyze',
        icon: '🔬',
        description: 'Analyze current page in detail',
        requiresPageContent: true,
        prompt: 'Please analyze the following webpage content in detail:\n\n'
    },
    'extract': {
        name: 'Extract',
        icon: '📋',
        description: 'Extract key information from page',
        requiresPageContent: true,
        prompt: 'Please extract key information (dates, names, numbers, facts) from:\n\n'
    },
    'translate': {
        name: 'Translate',
        icon: '🌐',
        description: 'Translate page content',
        requiresPageContent: true,
        prompt: 'Please translate the following content:\n\n'
    },
    'explain': {
        name: 'Explain',
        icon: '💡',
        description: 'Explain page content simply',
        requiresPageContent: true,
        prompt: 'Please explain the following content in simple terms:\n\n'
    },
    'code': {
        name: 'Code Review',
        icon: '👨‍💻',
        description: 'Review code on the page',
        requiresPageContent: true,
        prompt: 'Please review the following code and suggest improvements:\n\n'
    }
};

/**
 * Parse /tool commands from query
 * Example: "/summary @gemini" -> { tool: 'summary', workers: ['gemini_web'], query: '' }
 */
function parseToolCommands(query) {
    const toolPattern = /\/(summary|analyze|extract|translate|explain|code)\b/gi;
    const matches = [];
    let match;

    while ((match = toolPattern.exec(query)) !== null) {
        const toolName = match[1].toLowerCase();
        if (TOOL_COMMANDS[toolName]) {
            matches.push({
                tool: toolName,
                config: TOOL_COMMANDS[toolName],
                position: match.index
            });
        }
    }

    if (matches.length === 0) {
        return { hasTools: false, tools: [], cleanQuery: query };
    }

    // Remove tool commands from query
    const cleanQuery = query
        .replace(/\/(summary|analyze|extract|translate|explain|code)\b\s*/gi, '')
        .trim();

    return {
        hasTools: true,
        tools: matches.map(m => m.config),
        toolNames: matches.map(m => m.tool),
        cleanQuery
    };
}

/**
 * Execute a tool by getting page content and building the prompt
 */
async function executeToolCommand(toolConfig, pageContent, additionalQuery = '') {
    let fullPrompt = toolConfig.prompt;

    if (toolConfig.requiresPageContent && pageContent) {
        // Truncate if too long
        const maxLength = 15000;
        const truncatedContent = pageContent.length > maxLength
            ? pageContent.slice(0, maxLength) + '\n\n[Content truncated...]'
            : pageContent;

        fullPrompt += truncatedContent;
    }

    if (additionalQuery) {
        fullPrompt += '\n\n' + additionalQuery;
    }

    return fullPrompt;
}

/**
 * Get current page content for tool commands
 * Uses message passing to content script for better reliability
 */
async function getCurrentPageContent() {
    try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
            console.warn('[Controller] No active tab found');
            return null;
        }

        // Skip chrome:// and extension pages
        if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
            console.warn('[Controller] Cannot extract from chrome:// pages');
            return null;
        }

        // Try message passing first (more reliable)
        try {
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'extractPageContent'
            });

            if (response?.content) {
                console.log('[Controller] Got page content via message, length:', response.content.length);
                return `Title: ${response.title || tab.title}\nURL: ${response.url || tab.url}\n\n${response.content}`;
            }
        } catch (msgError) {
            console.log('[Controller] Message failed, trying executeScript:', msgError.message);
        }

        // Fallback: Execute script directly
        try {
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const selectors = ['article', 'main', '[role="main"]', '.content', '#content', 'body'];
                    let content = '';
                    for (const selector of selectors) {
                        const el = document.querySelector(selector);
                        if (el) {
                            content = el.innerText || el.textContent || '';
                            if (content.length > 100) break;
                        }
                    }
                    return {
                        title: document.title,
                        url: window.location.href,
                        content: content.trim().slice(0, 20000) // Limit size
                    };
                }
            });

            if (result?.result?.content) {
                console.log('[Controller] Got page content via executeScript');
                const { title, url, content } = result.result;
                return `Title: ${title}\nURL: ${url}\n\n${content}`;
            }
        } catch (execError) {
            console.warn('[Controller] executeScript failed:', execError.message);
        }

        // Last resort: use tab info only
        return `Title: ${tab.title}\nURL: ${tab.url}\n\n[Could not extract page content. Please copy and paste the content you want to analyze.]`;

    } catch (e) {
        console.error('[Controller] getCurrentPageContent error:', e);
        return null;
    }
}

// ============================================
// SEQUENCE EXECUTION (Pipeline)
// ============================================

/**
 * Parse sequence syntax: @worker1 > @worker2 > @worker3: task
 * The output of each worker becomes input for the next
 */
function parseSequence(query) {
    // Pattern: @worker1 > @worker2 or @worker1 >> @worker2
    const sequencePattern = /@(chatgpt|gpt|gemini|gem|perplexity|pplx|copilot|bing|grok|x)\s*(>|>>)\s*/gi;

    // Check if there's a sequence operator
    if (!query.includes('>')) {
        return { isSequence: false, steps: [], finalQuery: query };
    }

    // Split by > to get sequence steps
    const parts = query.split(/\s*>\s*/);

    if (parts.length < 2) {
        return { isSequence: false, steps: [], finalQuery: query };
    }

    const steps = [];
    let finalQuery = '';

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();

        // Check if this part has a worker mention
        const workerMatch = part.match(/@(chatgpt|gpt|gemini|gem|perplexity|pplx|copilot|bing|grok|x)\b/i);

        if (workerMatch) {
            const workerName = workerMatch[1].toLowerCase();
            const workerId = resolveWorkerName(workerName);

            // Get the task for this step (text after @worker or before next @worker)
            let stepTask = part.replace(/@(chatgpt|gpt|gemini|gem|perplexity|pplx|copilot|bing|grok|x)\s*:?\s*/gi, '').trim();

            // If this is the last step and has content after worker, that's the final query
            if (i === parts.length - 1 && stepTask) {
                // Check if there's a : indicating task
                const colonMatch = part.match(/@\w+\s*:\s*(.+)/);
                if (colonMatch) {
                    stepTask = colonMatch[1].trim();
                }
            }

            steps.push({
                workerId,
                workerName,
                task: stepTask || null, // null means use output from previous step
                stepNumber: i + 1
            });
        }
    }

    // Get the final task (after last worker mention)
    const lastPart = parts[parts.length - 1];
    const taskMatch = lastPart.match(/:(.+)$/);
    if (taskMatch) {
        finalQuery = taskMatch[1].trim();
    } else {
        // Use everything after removing worker mentions
        finalQuery = removeWorkerMentions(lastPart);
    }

    return {
        isSequence: steps.length >= 2,
        steps,
        finalQuery
    };
}

/**
 * Execute sequence: run workers one after another, passing output as input
 */
async function executeSequence(sequenceInfo, initialQuery, safePost, workerManager) {
    const { steps, finalQuery } = sequenceInfo;

    console.log('[Controller] Executing sequence:', steps.map(s => s.workerId));

    let currentInput = finalQuery || initialQuery;
    const results = [];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const isLastStep = i === steps.length - 1;

        const worker = workerManager?.getWorker(step.workerId);
        if (!worker?.enabled) {
            return {
                success: false,
                error: `Worker ${step.workerId} not enabled`,
                results
            };
        }

        // Notify UI about current step
        safePost({
            status: 'progress',
            message: `${worker.icon} Step ${i + 1}/${steps.length}: ${worker.name}...`,
            worker: { id: step.workerId, name: worker.name, icon: worker.icon }
        });

        // Build the input for this step
        let stepInput = currentInput;
        if (step.task) {
            stepInput = step.task + '\n\n' + currentInput;
        }

        // If not first step, add context about being in a pipeline
        if (i > 0) {
            stepInput = `[Previous AI response follows. Please process it as requested.]\n\n${stepInput}`;
        }

        try {
            workerManager.setWorkerBusy(step.workerId, `Step ${i + 1}/${steps.length}`);

            const session = self.ASKGPT_BG.createBridgeSession(step.workerId, null);
            const response = await session.execute(stepInput, {
                maxRetries: 2,
                responseTimeout: 120000
            });

            workerManager.setWorkerReady(step.workerId);

            const responseText = response.text || response.html || '';

            results.push({
                step: i + 1,
                workerId: step.workerId,
                worker: {
                    name: worker.name,
                    icon: worker.icon,
                    color: worker.color
                },
                input: stepInput.slice(0, 100) + '...',
                output: responseText,
                success: true
            });

            // Output becomes input for next step
            currentInput = responseText;

        } catch (e) {
            workerManager.updateStatus(step.workerId, 'error', e.message);

            results.push({
                step: i + 1,
                workerId: step.workerId,
                error: e.message,
                success: false
            });

            return {
                success: false,
                error: `Step ${i + 1} failed: ${e.message}`,
                results
            };
        }
    }

    return {
        success: true,
        finalOutput: currentInput,
        results
    };
}

/**
 * Build HTML for sequence result with step-by-step visualization
 */
function buildSequenceResultHtml(sequenceResult) {
    const { results, finalOutput } = sequenceResult;

    let html = '<div class="sp-sequence-result">';

    // Show pipeline visualization
    html += '<div class="sp-sequence-pipeline">';
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const worker = r.worker || {};

        html += `
            <div class="sp-sequence-step ${r.success ? 'success' : 'error'}" data-step="${r.step}">
                <span class="sp-sequence-icon">${worker.icon || '❓'}</span>
                <span class="sp-sequence-name">${worker.name || r.workerId}</span>
            </div>
        `;

        if (i < results.length - 1) {
            html += '<span class="sp-sequence-arrow">→</span>';
        }
    }
    html += '</div>';

    // Show final output
    html += `
        <div class="sp-sequence-output">
            <div class="sp-sequence-output-header">
                <span class="sp-sequence-final-badge">✨ Final Result</span>
            </div>
            <div class="sp-bubble-content">${finalOutput}</div>
        </div>
    `;

    // Optionally show intermediate steps (collapsed)
    if (results.length > 1) {
        html += `
            <details class="sp-sequence-details">
                <summary>📋 View ${results.length} intermediate steps</summary>
                <div class="sp-sequence-steps-list">
        `;

        for (const r of results) {
            const worker = r.worker || {};
            html += `
                <div class="sp-sequence-step-detail">
                    <div class="sp-sequence-step-header">
                        ${worker.icon || ''} Step ${r.step}: ${worker.name || r.workerId}
                    </div>
                    <div class="sp-sequence-step-output">${(r.output || r.error || '').slice(0, 300)}${(r.output || '').length > 300 ? '...' : ''}</div>
                </div>
            `;
        }

        html += '</div></details>';
    }

    html += '</div>';

    return html;
}
