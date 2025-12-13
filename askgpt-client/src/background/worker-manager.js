/**
 * Worker Manager
 * ==============
 * Manages the state, status, and lifecycle of all AI workers.
 * Provides real-time status monitoring and worker toggle functionality.
 * 
 * Version: 1.0
 */

// ============================================
// WORKER MANAGER CLASS
// ============================================
class WorkerManager {
    constructor() {
        this.workers = new Map();
        this.statusListeners = [];
        this.statusCheckInterval = null;
        this.initialized = false;
    }

    /**
     * Initialize the worker manager with worker configs
     */
    async init() {
        if (this.initialized) return;

        // Load worker configs (default workers)
        const configs = self.ASKGPT_WORKERS?.WORKER_CONFIGS || {};

        for (const [id, config] of Object.entries(configs)) {
            this.workers.set(id, {
                ...config,
                status: self.ASKGPT_WORKERS.WorkerStatus.OFFLINE,
                lastChecked: null,
                lastError: null,
                activeTask: null,
                isClone: false
            });
        }

        // Load clone instances from storage and register them
        await this._loadCloneWorkers();

        // Load saved enabled states from storage
        await this._loadSavedStates();

        this.initialized = true;
        console.log('[WorkerManager] Initialized with', this.workers.size, 'workers (including clones)');
    }

    /**
     * Load clone workers from chrome.storage and register them
     */
    async _loadCloneWorkers() {
        try {
            const result = await chrome.storage.local.get(['worker_instances']);
            const cloneInstances = result.worker_instances || {};

            for (const [id, clone] of Object.entries(cloneInstances)) {
                if (!clone.isClone) continue;

                // Get base worker config
                const baseConfig = self.ASKGPT_WORKERS?.WORKER_CONFIGS?.[clone.provider];
                if (!baseConfig) continue;

                // Register clone as a full worker
                this.workers.set(id, {
                    id,
                    name: clone.name,
                    icon: clone.icon,
                    url: clone.url || baseConfig.url,
                    provider: clone.provider,
                    isMain: false,
                    enabled: clone.enabled !== false,
                    badges: ['Clone'],
                    status: self.ASKGPT_WORKERS.WorkerStatus.OFFLINE,
                    lastChecked: null,
                    lastError: null,
                    activeTask: null,
                    isClone: true
                });

                // Create manager entry for this clone
                if (!self.ASKGPT_BG.MANAGERS) {
                    self.ASKGPT_BG.MANAGERS = {};
                }
                if (!self.ASKGPT_BG.MANAGERS[id]) {
                    self.ASKGPT_BG.MANAGERS[id] = { windowId: null, tabId: null };
                }

                console.log('[WorkerManager] Registered clone:', id);
            }
        } catch (e) {
            console.warn('[WorkerManager] Failed to load clone workers:', e);
        }
    }

    /**
     * Register a new clone worker dynamically (called when user creates clone)
     */
    async registerClone(cloneData) {
        const { id, provider, name, icon, url, enabled } = cloneData;

        const baseConfig = self.ASKGPT_WORKERS?.WORKER_CONFIGS?.[provider];
        if (!baseConfig) return false;

        this.workers.set(id, {
            id,
            name,
            icon,
            url: url || baseConfig.url,
            provider,
            isMain: false,
            enabled: enabled !== false,
            badges: ['Clone'],
            status: self.ASKGPT_WORKERS.WorkerStatus.OFFLINE,
            lastChecked: null,
            lastError: null,
            activeTask: null,
            isClone: true
        });

        // Create manager entry
        if (!self.ASKGPT_BG.MANAGERS[id]) {
            self.ASKGPT_BG.MANAGERS[id] = { windowId: null, tabId: null };
        }

        await this._saveStates();
        console.log('[WorkerManager] Registered new clone:', id);
        return true;
    }

    /**
     * Unregister a clone worker (called when user deletes clone)
     */
    async unregisterClone(cloneId) {
        const worker = this.workers.get(cloneId);
        if (!worker?.isClone) return false;

        // Close window if open
        await this._closeWorkerWindow(cloneId);

        // Remove from workers
        this.workers.delete(cloneId);

        // Remove manager entry
        delete self.ASKGPT_BG.MANAGERS?.[cloneId];

        console.log('[WorkerManager] Unregistered clone:', cloneId);
        return true;
    }

    /**
     * Load saved worker enabled states from chrome.storage
     */
    async _loadSavedStates() {
        try {
            const result = await chrome.storage.local.get(['workerEnabledStates']);
            const savedStates = result.workerEnabledStates || {};

            for (const [id, enabled] of Object.entries(savedStates)) {
                const worker = this.workers.get(id);
                if (worker) {
                    worker.enabled = enabled;
                }
            }
        } catch (e) {
            console.warn('[WorkerManager] Failed to load saved states:', e);
        }
    }

    /**
     * Save worker enabled states to chrome.storage
     */
    async _saveStates() {
        try {
            const states = {};
            for (const [id, worker] of this.workers) {
                states[id] = worker.enabled;
            }
            await chrome.storage.local.set({ workerEnabledStates: states });
        } catch (e) {
            console.warn('[WorkerManager] Failed to save states:', e);
        }
    }

    // =========================================
    // STATUS MANAGEMENT
    // =========================================

    /**
     * Get a worker by ID
     */
    getWorker(workerId) {
        return this.workers.get(workerId);
    }

    /**
     * Get all workers as array
     */
    getAllWorkers() {
        return Array.from(this.workers.values())
            .sort((a, b) => a.displayOrder - b.displayOrder);
    }

    /**
     * Get the main worker
     */
    getMainWorker() {
        return this.getAllWorkers()
            .find(w => w.role === self.ASKGPT_WORKERS.WorkerRole.MAIN);
    }

    /**
     * Get all enabled workers
     */
    getEnabledWorkers() {
        return this.getAllWorkers().filter(w => w.enabled);
    }

    /**
     * Get all online workers
     */
    getOnlineWorkers() {
        const { WorkerStatus } = self.ASKGPT_WORKERS;
        return this.getAllWorkers()
            .filter(w => w.enabled &&
                (w.status === WorkerStatus.ONLINE || w.status === WorkerStatus.BUSY));
    }

    /**
     * Check if a specific worker is ready for tasks
     */
    isWorkerReady(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker) return false;

        const { WorkerStatus } = self.ASKGPT_WORKERS;
        return worker.enabled && worker.status === WorkerStatus.ONLINE;
    }

    /**
     * Update worker status
     */
    updateStatus(workerId, status, error = null) {
        const worker = this.workers.get(workerId);
        if (!worker) return;

        const oldStatus = worker.status;
        worker.status = status;
        worker.lastChecked = Date.now();
        worker.lastError = error;

        if (oldStatus !== status) {
            console.log(`[WorkerManager] ${workerId}: ${oldStatus} -> ${status}`);
            this._notifyListeners({
                type: 'status_change',
                workerId,
                oldStatus,
                newStatus: status,
                error
            });
        }
    }

    /**
     * Set worker as busy with a task
     */
    setWorkerBusy(workerId, taskInfo = null) {
        const worker = this.workers.get(workerId);
        if (!worker) return;

        worker.status = self.ASKGPT_WORKERS.WorkerStatus.BUSY;
        worker.activeTask = taskInfo;

        this._notifyListeners({
            type: 'worker_busy',
            workerId,
            task: taskInfo
        });
    }

    /**
     * Set worker as ready (finished task)
     */
    setWorkerReady(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker) return;

        worker.status = self.ASKGPT_WORKERS.WorkerStatus.ONLINE;
        worker.activeTask = null;

        this._notifyListeners({
            type: 'worker_ready',
            workerId
        });
    }

    // =========================================
    // WORKER TOGGLE (ON/OFF)
    // =========================================

    /**
     * Toggle worker enabled state
     * When enabled: opens worker window
     * When disabled: closes worker window
     */
    async toggleWorker(workerId, enabled) {
        const worker = this.workers.get(workerId);
        if (!worker) return false;

        // Main worker cannot be disabled
        if (worker.role === self.ASKGPT_WORKERS.WorkerRole.MAIN && !enabled) {
            console.warn('[WorkerManager] Cannot disable main worker');
            return false;
        }

        worker.enabled = enabled;

        if (enabled) {
            // Start connecting to worker
            worker.status = self.ASKGPT_WORKERS.WorkerStatus.CONNECTING;
            this._notifyListeners({
                type: 'worker_enabling',
                workerId
            });

            // Open worker window
            try {
                await this._openWorkerWindow(workerId);
                worker.status = self.ASKGPT_WORKERS.WorkerStatus.ONLINE;
            } catch (e) {
                console.warn('[WorkerManager] Failed to open worker window:', e);
                worker.status = self.ASKGPT_WORKERS.WorkerStatus.OFFLINE;
            }
        } else {
            // Close worker window
            await this._closeWorkerWindow(workerId);
            worker.status = self.ASKGPT_WORKERS.WorkerStatus.OFFLINE;
        }

        await this._saveStates();

        this._notifyListeners({
            type: 'worker_toggled',
            workerId,
            enabled,
            status: worker.status
        });

        return true;
    }

    /**
     * Open a worker window
     */
    async _openWorkerWindow(workerId) {
        const workerConfig = self.ASKGPT_WORKERS?.WORKER_CONFIGS?.[workerId];

        if (!workerConfig) {
            console.warn('[WorkerManager] No config for worker:', workerId);
            return;
        }

        // Get or create manager entry
        const managers = self.ASKGPT_BG?.MANAGERS || {};
        if (!managers[workerId]) {
            managers[workerId] = { windowId: null, tabId: null };
        }
        const manager = managers[workerId];

        // Check if window already exists
        if (manager.windowId) {
            try {
                const win = await chrome.windows.get(manager.windowId);
                if (win) {
                    // Window exists, just focus it
                    await chrome.windows.update(manager.windowId, { focused: true });
                    console.log(`[WorkerManager] Focused existing window for ${workerId}`);
                    return;
                }
            } catch (e) {
                // Window doesn't exist
                manager.windowId = null;
                manager.tabId = null;
            }
        }

        // Get URL from worker config
        const url = workerConfig.url;
        if (!url) {
            console.warn('[WorkerManager] No URL for worker:', workerId);
            return;
        }

        console.log(`[WorkerManager] Opening window for ${workerId}:`, url);

        try {
            const newWindow = await chrome.windows.create({
                url,
                type: 'popup',
                width: 520,
                height: 720,
                focused: true
            });

            if (newWindow?.id && newWindow?.tabs?.[0]?.id) {
                manager.windowId = newWindow.id;
                manager.tabId = newWindow.tabs[0].id;
                console.log(`[WorkerManager] Opened window for ${workerId}:`, manager.windowId);
            }
        } catch (e) {
            console.error(`[WorkerManager] Failed to open window for ${workerId}:`, e);
            throw e;
        }
    }

    /**
     * Close a worker window
     */
    async _closeWorkerWindow(workerId) {
        const managers = self.ASKGPT_BG?.MANAGERS || {};
        const manager = managers[workerId];

        if (!manager || !manager.windowId) {
            console.log(`[WorkerManager] No window to close for ${workerId}`);
            return;
        }

        // Close window if exists
        try {
            await chrome.windows.remove(manager.windowId);
            console.log(`[WorkerManager] Closed window for ${workerId}`);
        } catch (e) {
            console.log(`[WorkerManager] Window already closed for ${workerId}`);
        }
        manager.windowId = null;
        manager.tabId = null;
    }

    /**
     * Check if a worker's website is accessible
     */
    async checkWorkerOnline(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker) return false;

        // Check if we have an active window/tab for this worker
        const manager = self.ASKGPT_BG?.MANAGERS?.[workerId];
        if (manager?.tabId) {
            try {
                const tab = await chrome.tabs.get(manager.tabId);
                if (tab && !tab.discarded) {
                    return true;
                }
            } catch (e) {
                // Tab doesn't exist
            }
        }

        // For now, if enabled, consider it "ready to connect"
        return worker.enabled;
    }

    /**
     * Check status of all workers
     */
    async checkAllWorkersStatus() {
        const results = {};

        for (const [id, worker] of this.workers) {
            if (!worker.enabled) {
                results[id] = self.ASKGPT_WORKERS.WorkerStatus.OFFLINE;
                continue;
            }

            const isOnline = await this.checkWorkerOnline(id);
            const status = isOnline
                ? self.ASKGPT_WORKERS.WorkerStatus.ONLINE
                : self.ASKGPT_WORKERS.WorkerStatus.OFFLINE;

            this.updateStatus(id, status);
            results[id] = status;
        }

        return results;
    }

    // =========================================
    // STATUS LISTENERS
    // =========================================

    /**
     * Add a listener for status changes
     */
    addStatusListener(callback) {
        this.statusListeners.push(callback);
        return () => this.removeStatusListener(callback);
    }

    /**
     * Remove a status listener
     */
    removeStatusListener(callback) {
        const idx = this.statusListeners.indexOf(callback);
        if (idx > -1) {
            this.statusListeners.splice(idx, 1);
        }
    }

    /**
     * Notify all listeners of an event
     */
    _notifyListeners(event) {
        for (const listener of this.statusListeners) {
            try {
                listener(event);
            } catch (e) {
                console.error('[WorkerManager] Listener error:', e);
            }
        }

        // Also broadcast to sidepanel if open
        this._broadcastToSidepanel(event);
    }

    /**
     * Broadcast event to sidepanel
     */
    _broadcastToSidepanel(event) {
        try {
            chrome.runtime.sendMessage({
                action: 'worker_event',
                event
            }).catch(() => {
                // Sidepanel might not be open
            });
        } catch (e) {
            // Ignore
        }
    }

    // =========================================
    // WORKER SUMMARY FOR UI
    // =========================================

    /**
     * Get a summary of all workers for the UI
     */
    getWorkersSummary() {
        const { WorkerStatus, WorkerRole } = self.ASKGPT_WORKERS;

        const workers = this.getAllWorkers().map(w => ({
            id: w.id,
            name: w.name,
            shortName: w.shortName,
            icon: w.icon,
            color: w.color,
            role: w.role,
            isMain: w.role === WorkerRole.MAIN,
            status: w.status,
            enabled: w.enabled,
            strengths: w.strengths,
            badges: w.badges,
            activeTask: w.activeTask,
            lastError: w.lastError
        }));

        const onlineCount = workers.filter(w =>
            w.status === WorkerStatus.ONLINE || w.status === WorkerStatus.BUSY
        ).length;

        const totalEnabled = workers.filter(w => w.enabled).length;

        return {
            workers,
            summary: {
                online: onlineCount,
                total: totalEnabled,
                mainWorker: workers.find(w => w.isMain)?.name || 'None'
            }
        };
    }

    // =========================================
    // TASK ROUTING
    // =========================================

    /**
     * Find the best worker for a given task
     */
    findBestWorkerForTask(taskAnalysis) {
        if (!taskAnalysis.shouldDelegate) {
            return this.getMainWorker();
        }

        const targetWorker = this.workers.get(taskAnalysis.targetWorker);
        if (targetWorker && targetWorker.enabled) {
            return targetWorker;
        }

        // Fallback to main worker
        return this.getMainWorker();
    }

    /**
     * Check if a worker is currently busy
     */
    isWorkerBusy(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker) return false;
        return worker.status === self.ASKGPT_WORKERS.WorkerStatus.BUSY;
    }

    /**
     * Get an available worker (not busy) from the enabled workers
     * Optionally specify worker IDs to prefer
     */
    getAvailableWorker(preferredWorkerIds = []) {
        const { WorkerStatus } = self.ASKGPT_WORKERS;

        // First, try preferred workers in order
        for (const workerId of preferredWorkerIds) {
            const worker = this.workers.get(workerId);
            if (worker && worker.enabled && worker.status !== WorkerStatus.BUSY) {
                return worker;
            }
        }

        // If all preferred are busy, find any available worker
        const enabledWorkers = this.getEnabledWorkers();
        for (const worker of enabledWorkers) {
            if (worker.status !== WorkerStatus.BUSY) {
                return worker;
            }
        }

        // All workers are busy, return null
        return null;
    }

    /**
     * Get all workers that are not currently busy
     */
    getIdleWorkers() {
        const { WorkerStatus } = self.ASKGPT_WORKERS;
        return this.getEnabledWorkers().filter(w =>
            w.status !== WorkerStatus.BUSY
        );
    }

    /**
     * Analyze a task and route to appropriate worker
     */
    routeTask(taskText) {
        const { analyzeTaskForDelegation } = self.ASKGPT_WORKERS;
        const analysis = analyzeTaskForDelegation(taskText);

        const targetWorker = this.findBestWorkerForTask(analysis);

        return {
            analysis,
            targetWorker,
            requiresDelegation: analysis.shouldDelegate && targetWorker.role !== 'main'
        };
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================
const workerManager = new WorkerManager();

// ============================================
// EXPORT TO GLOBAL
// ============================================
self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    workerManager,
    WorkerManager
});

// Auto-init when configs are ready
if (self.ASKGPT_WORKERS) {
    workerManager.init();
}

console.log('[WorkerManager] Module loaded');
