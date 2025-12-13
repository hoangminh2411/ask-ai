/**
 * Worker Panel UI Logic
 * ======================
 * Handles worker panel interactions, theme toggle, and worker status display
 */

// ============================================
// THEME MANAGEMENT
// ============================================

function initTheme() {
    // Load saved theme from storage
    chrome.storage.local.get(['askgpt_theme'], (result) => {
        const savedTheme = result.askgpt_theme || 'light';
        document.body.setAttribute('data-theme', savedTheme);
    });
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    body.setAttribute('data-theme', newTheme);

    // Save to storage
    chrome.storage.local.set({ askgpt_theme: newTheme });

    // Animate the transition
    body.style.transition = 'background 0.3s ease, color 0.3s ease';
    setTimeout(() => {
        body.style.transition = '';
    }, 300);
}

// ============================================
// WORKER INSTANCE MANAGEMENT
// ============================================

// Default workers (cannot be deleted)
const DEFAULT_WORKERS = {
    chatgpt_web: { provider: 'chatgpt_web', name: 'ChatGPT', icon: '🤖', alias: '@chatgpt', url: 'https://chatgpt.com/' },
    gemini_web: { provider: 'gemini_web', name: 'Gemini', icon: '✨', alias: '@gemini', url: 'https://gemini.google.com/app' },
    perplexity_web: { provider: 'perplexity_web', name: 'Perplexity', icon: '🔍', alias: '@perplexity', url: 'https://www.perplexity.ai/' },
    copilot_web: { provider: 'copilot_web', name: 'Copilot', icon: '🚀', alias: '@copilot', url: 'https://copilot.microsoft.com/' },
    grok_web: { provider: 'grok_web', name: 'Grok', icon: '𝕏', alias: '@grok', url: 'https://grok.x.ai/' }
};

// Instance counter for each provider  
let workerInstances = {};

// Load worker instances from storage
async function loadWorkerInstances() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['worker_instances'], (result) => {
            workerInstances = result.worker_instances || {};
            resolve(workerInstances);
        });
    });
}

// Save worker instances to storage
async function saveWorkerInstances() {
    return new Promise((resolve) => {
        chrome.storage.local.set({ worker_instances: workerInstances }, resolve);
    });
}

// Clone a worker (create new instance)
async function cloneWorker(baseWorkerId) {
    const baseWorker = DEFAULT_WORKERS[baseWorkerId];
    if (!baseWorker) return null;

    // Count existing clones of this provider
    const existingClones = Object.keys(workerInstances).filter(id =>
        id.startsWith(baseWorkerId + '_')
    );
    const cloneNum = existingClones.length + 2; // #2, #3, etc.

    const newId = `${baseWorkerId}_${cloneNum}`;
    const newInstance = {
        id: newId,
        provider: baseWorker.provider,
        name: `${baseWorker.name} #${cloneNum}`,
        icon: baseWorker.icon,
        alias: `@${baseWorker.name.toLowerCase()}${cloneNum}`,
        url: baseWorker.url,
        isClone: true,
        enabled: true
    };

    workerInstances[newId] = newInstance;
    await saveWorkerInstances();

    // Register in background WorkerManager
    try {
        await chrome.runtime.sendMessage({
            action: 'register_clone',
            cloneData: newInstance
        });
    } catch (e) {
        console.warn('[WorkerInstances] Failed to register in background:', e);
    }

    // Refresh UI
    refreshWorkerListUI();
    refreshMentionOptions();

    console.log('[WorkerInstances] Cloned:', newId);
    return newInstance;
}

// Delete a worker clone
async function deleteWorkerClone(cloneId) {
    if (!workerInstances[cloneId]?.isClone) {
        console.warn('[WorkerInstances] Cannot delete default worker:', cloneId);
        return false;
    }

    // Unregister from background WorkerManager
    try {
        await chrome.runtime.sendMessage({
            action: 'unregister_clone',
            cloneId
        });
    } catch (e) {
        console.warn('[WorkerInstances] Failed to unregister from background:', e);
    }

    delete workerInstances[cloneId];
    await saveWorkerInstances();

    // Refresh UI
    refreshWorkerListUI();
    refreshMentionOptions();

    console.log('[WorkerInstances] Deleted:', cloneId);
    return true;
}

// Get all workers (defaults + clones)
function getAllWorkers() {
    const all = [];

    // Add default workers first
    for (const [id, worker] of Object.entries(DEFAULT_WORKERS)) {
        all.push({
            id,
            ...worker,
            isDefault: true,
            enabled: true, // TODO: load from storage
            clones: Object.values(workerInstances).filter(w => w.provider === worker.provider)
        });
    }

    return all;
}

// Refresh @mention popup options
function refreshMentionOptions() {
    const mentionPopup = document.getElementById('sp-mention-popup');
    if (!mentionPopup) return;

    const header = mentionPopup.querySelector('.sp-mention-header');
    mentionPopup.innerHTML = '';

    // Add header back
    const headerDiv = document.createElement('div');
    headerDiv.className = 'sp-mention-header';
    headerDiv.textContent = 'Select Worker';
    mentionPopup.appendChild(headerDiv);

    // Add default workers
    for (const [id, worker] of Object.entries(DEFAULT_WORKERS)) {
        mentionPopup.appendChild(createMentionOption(id, worker.name, worker.icon, 'Default'));
    }

    // Add clones
    for (const [id, clone] of Object.entries(workerInstances)) {
        if (clone.isClone) {
            mentionPopup.appendChild(createMentionOption(id, clone.name, clone.icon, 'Clone'));
        }
    }
}

// Create a mention option element
function createMentionOption(workerId, name, icon, tag) {
    // Generate shorthand alias for display
    let alias;
    const cloneMatch = workerId.match(/^(\w+)_web_(\d+)$/);
    if (cloneMatch) {
        alias = '@' + cloneMatch[1] + cloneMatch[2]; // @chatgpt2
    } else {
        const baseNames = {
            chatgpt_web: '@chatgpt',
            gemini_web: '@gemini',
            perplexity_web: '@perplexity',
            copilot_web: '@copilot',
            grok_web: '@grok'
        };
        alias = baseNames[workerId] || '@' + workerId;
    }

    const btn = document.createElement('button');
    btn.className = 'sp-mention-option';
    btn.setAttribute('data-worker', workerId);
    btn.innerHTML = `
        <span class="sp-mention-icon">${icon}</span>
        <span class="sp-mention-name">${name}</span>
        <span class="sp-mention-alias">${alias}</span>
        <span class="sp-mention-tag">${tag}</span>
    `;
    return btn;
}

// Refresh worker list in panel UI
function refreshWorkerListUI() {
    const container = document.getElementById('sp-worker-list');
    if (!container) return;

    container.innerHTML = '';

    for (const [id, worker] of Object.entries(DEFAULT_WORKERS)) {
        // Create default worker item with clone button
        const item = createWorkerItemWithClone(id, worker, false);
        container.appendChild(item);

        // Add clones underneath
        const clones = Object.values(workerInstances).filter(w => w.provider === worker.provider);
        for (const clone of clones) {
            const cloneItem = createWorkerItemWithClone(clone.id, clone, true);
            cloneItem.classList.add('sp-worker-clone');
            container.appendChild(cloneItem);
        }
    }
}

// Create worker item with clone/delete buttons and toggle
function createWorkerItemWithClone(id, worker, isClone) {
    const isEnabled = isClone ? (worker.enabled !== false) : true; // Clones can be toggled

    const item = document.createElement('div');
    item.className = `sp-worker-item ${isClone ? 'clone' : ''} ${isEnabled ? 'enabled' : 'disabled'}`;
    item.setAttribute('data-worker-id', id);

    item.innerHTML = `
        <div class="sp-worker-avatar">${worker.icon}</div>
        <div class="sp-worker-info">
            <div class="sp-worker-name">${worker.name}</div>
            <div class="sp-worker-alias">${worker.alias || '@' + worker.name.toLowerCase()}</div>
        </div>
        <div class="sp-worker-actions">
            ${isClone ? `
                <label class="sp-worker-toggle" title="Toggle worker">
                    <input type="checkbox" ${isEnabled ? 'checked' : ''} data-clone-id="${id}">
                    <span class="sp-toggle-slider"></span>
                </label>
                <button class="sp-worker-delete" data-clone-id="${id}" title="Delete clone">×</button>
            ` : `
                <button class="sp-worker-clone-btn" data-base-id="${id}" title="Add clone">+</button>
            `}
        </div>
    `;

    // Event handlers
    if (isClone) {
        // Toggle enabled/disabled
        const toggle = item.querySelector('input[type="checkbox"]');
        toggle?.addEventListener('change', async (e) => {
            e.stopPropagation();
            const enabled = e.target.checked;
            if (workerInstances[id]) {
                workerInstances[id].enabled = enabled;
                await saveWorkerInstances();
                item.classList.toggle('enabled', enabled);
                item.classList.toggle('disabled', !enabled);
            }
        });

        // Delete button
        const deleteBtn = item.querySelector('.sp-worker-delete');
        deleteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteWorkerClone(id);
        });
    } else {
        const cloneBtn = item.querySelector('.sp-worker-clone-btn');
        cloneBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            cloneWorker(id);
        });
    }

    return item;
}

// ============================================
// WORKER PANEL MANAGEMENT
// ============================================

let workerPanelOpen = false;

function openWorkerPanel() {
    const panel = document.getElementById('sp-worker-panel');
    if (panel) {
        panel.classList.add('open');
        workerPanelOpen = true;
        refreshWorkerListUI(); // Use new UI with clone buttons
    }
}

function closeWorkerPanel() {
    const panel = document.getElementById('sp-worker-panel');
    if (panel) {
        panel.classList.remove('open');
        workerPanelOpen = false;
    }
}

function toggleWorkerPanel() {
    if (workerPanelOpen) {
        closeWorkerPanel();
    } else {
        openWorkerPanel();
    }
}

/**
 * Refresh worker list from cached data
 */
function refreshWorkerList() {
    const listEl = document.getElementById('sp-worker-list');
    if (!listEl) return;

    // Request worker summary from background
    chrome.runtime.sendMessage({ action: 'get_workers_summary' }, (response) => {
        if (!response || !response.workers) {
            // Fallback: use default worker data
            renderWorkerListFallback(listEl);
            return;
        }

        renderWorkerList(listEl, response.workers, response.summary);
    });
}

/**
 * Force refresh all workers with real-time status check
 */
function refreshAllWorkersStatus() {
    const listEl = document.getElementById('sp-worker-list');

    // Show loading state
    if (listEl) {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'sp-worker-loading';
        loadingEl.innerHTML = '<div class="sp-spinner"></div> Checking workers...';
        loadingEl.style.cssText = 'padding: 20px; text-align: center; color: var(--text-tertiary);';
        listEl.innerHTML = '';
        listEl.appendChild(loadingEl);
    }

    // Show indicator animation
    const indicator = document.getElementById('sp-workers-indicator');
    if (indicator) {
        indicator.classList.add('refreshing');
    }

    // Request real-time status check from background
    chrome.runtime.sendMessage({ action: 'refresh_all_workers' }, (response) => {
        // Remove refreshing animation
        if (indicator) {
            indicator.classList.remove('refreshing');
        }

        if (response?.error) {
            console.warn('[WorkerPanel] Refresh failed:', response.error);
            refreshWorkerList(); // Fallback to cached data
            return;
        }

        if (response?.summary?.workers) {
            renderWorkerList(listEl, response.summary.workers, response.summary.summary);
        } else {
            refreshWorkerList(); // Fallback to cached data
        }

        // Update all dots based on real status
        if (response?.results) {
            for (const [workerId, status] of Object.entries(response.results)) {
                updateWorkerDot(workerId, status);
            }
        }
    });
}

function renderWorkerList(container, workers, summary) {
    container.innerHTML = '';

    workers.forEach(worker => {
        const item = createWorkerItem(worker);
        container.appendChild(item);
    });

    // Update header count
    const countEl = document.getElementById('sp-workers-count');
    if (countEl && summary) {
        countEl.textContent = `${summary.online}/${summary.total}`;
    }
}

function renderWorkerListFallback(container) {
    // Default worker data if background not ready
    const defaultWorkers = [
        { id: 'chatgpt_web', name: 'ChatGPT', icon: '🤖', isMain: true, status: 'online', enabled: true, badges: ['Main Worker'] },
        { id: 'gemini_web', name: 'Gemini', icon: '✨', isMain: false, status: 'offline', enabled: true, badges: ['Vision'] },
        { id: 'perplexity_web', name: 'Perplexity', icon: '🔍', isMain: false, status: 'offline', enabled: true, badges: ['Real-time'] },
        { id: 'copilot_web', name: 'Copilot', icon: '🚀', isMain: false, status: 'offline', enabled: false, badges: ['Microsoft'] },
        { id: 'grok_web', name: 'Grok', icon: '𝕏', isMain: false, status: 'offline', enabled: false, badges: ['Twitter'] }
    ];

    renderWorkerList(container, defaultWorkers, { online: 1, total: 3 });
}

function createWorkerItem(worker) {
    const item = document.createElement('div');
    item.className = `sp-worker-item ${worker.status} ${worker.isMain ? 'main-worker' : ''}`;
    item.setAttribute('data-worker-id', worker.id);

    const statusText = getStatusText(worker.status, worker.activeTask);

    item.innerHTML = `
        <div class="sp-worker-avatar">${worker.icon}</div>
        <div class="sp-worker-info">
            <div class="sp-worker-name">
                ${escapeHtml(worker.name)}
                ${worker.isMain ? '<span class="sp-badge">Main</span>' : ''}
            </div>
            <div class="sp-worker-status ${worker.status}">${statusText}</div>
            <div class="sp-worker-tags">
                ${(worker.badges || []).map(b => `<span>${escapeHtml(b)}</span>`).join('')}
            </div>
        </div>
        <label class="sp-worker-toggle" title="${worker.isMain ? 'Main worker cannot be disabled' : 'Toggle worker'}">
            <input type="checkbox" 
                ${worker.enabled ? 'checked' : ''} 
                ${worker.isMain ? 'disabled' : ''}
                data-worker-id="${worker.id}">
            <span class="sp-toggle-slider"></span>
        </label>
    `;

    // Add toggle event
    const toggle = item.querySelector('input[type="checkbox"]');
    if (toggle && !worker.isMain) {
        toggle.addEventListener('change', (e) => {
            handleWorkerToggle(worker.id, e.target.checked);
        });
    }

    return item;
}

function getStatusText(status, activeTask) {
    switch (status) {
        case 'online':
            return '✓ Ready';
        case 'busy':
            return activeTask ? `⚡ ${activeTask}` : '⚡ Processing...';
        case 'connecting':
            return '○ Connecting...';
        case 'error':
            return '✕ Error';
        case 'offline':
        default:
            return '○ Offline';
    }
}

function handleWorkerToggle(workerId, enabled) {
    // Update UI immediately
    const item = document.querySelector(`[data-worker-id="${workerId}"]`);
    if (item) {
        item.classList.toggle('connecting', enabled);
        item.classList.toggle('offline', !enabled);

        const statusEl = item.querySelector('.sp-worker-status');
        if (statusEl) {
            statusEl.textContent = enabled ? '○ Connecting...' : '○ Offline';
            statusEl.className = 'sp-worker-status ' + (enabled ? 'connecting' : 'offline');
        }
    }

    // Send toggle request to background
    chrome.runtime.sendMessage({
        action: 'toggle_worker',
        workerId,
        enabled
    }, (response) => {
        if (response && response.success) {
            // Update status indicator dots
            updateWorkerDot(workerId, response.status);
        }
        // Refresh list after toggle
        setTimeout(refreshWorkerList, 500);
    });
}

function updateWorkerDot(workerId, status) {
    // Update count and icons
    updateWorkersDisplay();
}

function updateWorkersDisplay() {
    // Request summary from background
    chrome.runtime.sendMessage({ action: 'get_workers_summary' }, (response) => {
        if (!response?.workers) return;

        const enabledWorkers = response.workers.filter(w => w.enabled);
        const onlineWorkers = enabledWorkers.filter(w =>
            w.status === 'online' || w.status === 'busy'
        );

        // Update icons display
        const iconsEl = document.querySelector('.sp-workers-icons');
        if (iconsEl) {
            const icons = enabledWorkers
                .slice(0, 4) // Max 4 icons
                .map(w => w.icon)
                .join('');
            iconsEl.textContent = icons || '🤖';
        }

        // Update count
        const countEl = document.getElementById('sp-workers-count');
        if (countEl) {
            countEl.textContent = `${onlineWorkers.length}/${enabledWorkers.length}`;
        }
    });
}

// Helper function (may be duplicated from sidepanel.js)
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ============================================
// WORKER SELECTOR (Input Footer)
// ============================================

let currentWorkerId = 'chatgpt_web';  // Default to main worker
let workerDropdownOpen = false;

function initWorkerSelector() {
    const btn = document.getElementById('sp-worker-btn');
    const dropdown = document.getElementById('sp-worker-dropdown');

    if (!btn || !dropdown) return;

    // Toggle dropdown on button click
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWorkerDropdown();
    });

    // Handle worker selection
    dropdown.querySelectorAll('.sp-dropdown-option').forEach(option => {
        option.addEventListener('click', () => {
            const workerId = option.getAttribute('data-worker');
            if (workerId) {
                selectWorker(workerId, option);
            }
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (workerDropdownOpen && !e.target.closest('#sp-worker-btn') && !e.target.closest('#sp-worker-dropdown')) {
            closeWorkerDropdown();
        }
    });
}

function toggleWorkerDropdown() {
    const dropdown = document.getElementById('sp-worker-dropdown');
    if (!dropdown) return;

    workerDropdownOpen = !workerDropdownOpen;
    dropdown.classList.toggle('open', workerDropdownOpen);
}

function closeWorkerDropdown() {
    const dropdown = document.getElementById('sp-worker-dropdown');
    if (dropdown) {
        dropdown.classList.remove('open');
        workerDropdownOpen = false;
    }
}

function selectWorker(workerId, optionEl) {
    currentWorkerId = workerId;

    // Update button display
    const nameEl = document.getElementById('sp-worker-name');
    const iconEl = document.querySelector('.sp-worker-icon');
    const badgeEl = document.querySelector('.sp-main-badge');

    if (nameEl && optionEl) {
        const name = optionEl.querySelector('.sp-opt-name')?.textContent || workerId;
        const icon = optionEl.querySelector('.sp-opt-icon')?.textContent || '🤖';
        const isMain = optionEl.querySelector('.sp-opt-badge.main') !== null;

        nameEl.textContent = name;
        if (iconEl) iconEl.textContent = icon;
        if (badgeEl) badgeEl.style.display = isMain ? 'inline' : 'none';
    }

    // Update active state in dropdown
    document.querySelectorAll('#sp-worker-dropdown .sp-dropdown-option').forEach(opt => {
        opt.classList.toggle('active', opt.getAttribute('data-worker') === workerId);
    });

    // Save selection
    chrome.storage.local.set({ askgpt_selected_worker: workerId });

    closeWorkerDropdown();

    // Notify background of worker change
    chrome.runtime.sendMessage({
        action: 'set_active_worker',
        workerId
    });
}

function getSelectedWorker() {
    return currentWorkerId;
}

// ============================================
// COLLABORATION INDICATOR
// ============================================

function showCollaborationIndicator(fromWorker, toWorker, message) {
    const indicator = document.createElement('div');
    indicator.className = 'sp-collab-indicator';
    indicator.innerHTML = `
        <span>${fromWorker.icon} ${fromWorker.name}</span>
        <span class="sp-collab-arrow">→</span>
        <span>${toWorker.icon} ${toWorker.name}</span>
    `;

    return indicator;
}

// ============================================
// EVENT LISTENERS
// ============================================

function initWorkerPanelEvents() {
    // Theme toggle
    const themeBtn = document.getElementById('sp-theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // More menu toggle
    const moreBtn = document.getElementById('sp-more-btn');
    const moreMenu = document.getElementById('sp-more-menu');
    if (moreBtn && moreMenu) {
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu.classList.toggle('open');
        });

        // Close more menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#sp-more-btn') && !e.target.closest('#sp-more-menu')) {
                moreMenu.classList.remove('open');
            }
        });

        // Handle more menu options
        moreMenu.querySelectorAll('.sp-more-option').forEach(opt => {
            opt.addEventListener('click', () => {
                moreMenu.classList.remove('open');
            });
        });
    }

    // Worker Avatars Click -> Toggle ON/OFF
    initWorkerAvatars();

    // Manage Workers button -> Open Worker Panel
    const manageBtn = document.getElementById('sp-open-worker-panel');
    if (manageBtn) {
        manageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openWorkerPanel();
        });
    }

    // Close panel button
    const closeBtn = document.getElementById('sp-worker-panel-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeWorkerPanel);
    }

    // Refresh panel button (real-time status check)
    const refreshBtn = document.getElementById('sp-worker-panel-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            refreshWorkerListUI(); // Use new UI with clone buttons
        });
    }

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (workerPanelOpen &&
            !e.target.closest('#sp-worker-panel') &&
            !e.target.closest('.sp-avatar')) {
            closeWorkerPanel();
        }
    });
}

// ============================================
// WORKER AVATARS (Bottom Bar)
// ============================================

function initWorkerAvatars() {
    const avatarsContainer = document.getElementById('sp-worker-avatars');
    if (!avatarsContainer) return;

    // Click on avatar = toggle worker
    avatarsContainer.addEventListener('click', (e) => {
        const avatar = e.target.closest('.sp-avatar');
        if (!avatar) return;

        const workerId = avatar.dataset.worker;
        if (!workerId) return;

        // Toggle state
        const isCurrentlyOn = avatar.classList.contains('on');
        const newState = !isCurrentlyOn;

        // Update UI immediately
        avatar.classList.toggle('on', newState);
        avatar.classList.toggle('off', !newState);

        // Send toggle to background
        chrome.runtime.sendMessage({
            action: 'toggle_worker',
            workerId,
            enabled: newState
        }, (response) => {
            if (response?.success) {
                // Update avatar state based on actual response
                updateAvatarState(workerId, response.status);
            }
        });
    });

    // Initialize avatars state
    refreshAvatarsState();
}

function updateAvatarState(workerId, status) {
    const avatar = document.querySelector(`.sp-avatar[data-worker="${workerId}"]`);
    if (!avatar) return;

    avatar.classList.remove('on', 'off', 'busy');

    if (status === 'online') {
        avatar.classList.add('on');
    } else if (status === 'busy') {
        avatar.classList.add('on', 'busy');
    } else {
        avatar.classList.add('off');
    }
}

function refreshAvatarsState() {
    chrome.runtime.sendMessage({ action: 'get_workers_summary' }, (response) => {
        if (!response?.workers) return;

        response.workers.forEach(worker => {
            updateAvatarState(worker.id, worker.enabled ? worker.status : 'offline');
        });
    });
}

// ============================================
// LISTEN FOR WORKER EVENTS FROM BACKGROUND
// ============================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'worker_event') {
        handleWorkerEvent(msg.event);
    } else if (msg.action === 'worker_delegation') {
        // Update worker dots to show delegation
        updateWorkerDot(msg.from, 'online');
        updateWorkerDot(msg.to, 'busy');

        // Refresh panel if open
        if (workerPanelOpen) {
            setTimeout(refreshWorkerList, 300);
        }
    }
});

function handleWorkerEvent(event) {
    switch (event.type) {
        case 'status_change':
            updateAvatarState(event.workerId, event.newStatus);
            if (workerPanelOpen) {
                refreshWorkerList();
            }
            break;

        case 'worker_busy':
            updateAvatarState(event.workerId, 'busy');
            break;

        case 'worker_ready':
            updateAvatarState(event.workerId, 'online');
            break;

        case 'worker_toggled':
            updateAvatarState(event.workerId, event.enabled ? event.status : 'offline');
            break;
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initWorkerPanelEvents();

    // Load worker instances from storage
    await loadWorkerInstances();

    // Initialize avatar states from background
    setTimeout(() => {
        refreshAvatarsState();
    }, 300);

    // Initialize @ mention popup with dynamic workers  
    initMentionPopup();

    // Refresh mention options to include clones
    refreshMentionOptions();

    // Initialize Quick Reference chips (click to insert)
    initQuickRefChips();
});

// ============================================
// QUICK REFERENCE CLICK-TO-INSERT
// ============================================

function initQuickRefChips() {
    const promptEl = document.getElementById('sp-prompt');
    // Handle both Quick Ref chips and Help popup chips
    const chips = document.querySelectorAll('.sp-quick-chip, .sp-help-chip');

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const copyText = chip.dataset.copy || chip.dataset.insert;
            if (copyText && promptEl) {
                // Insert at cursor position or append
                const currentValue = promptEl.value;
                const cursorPos = promptEl.selectionStart || currentValue.length;

                // Add space if needed
                const needsSpaceBefore = cursorPos > 0 && currentValue[cursorPos - 1] !== ' ';
                const textToInsert = (needsSpaceBefore ? ' ' : '') + copyText + ' ';

                const newValue = currentValue.slice(0, cursorPos) + textToInsert + currentValue.slice(cursorPos);
                promptEl.value = newValue;

                // Focus and position cursor after inserted text
                promptEl.focus();
                const newCursorPos = cursorPos + textToInsert.length;
                promptEl.setSelectionRange(newCursorPos, newCursorPos);

                // Visual feedback
                chip.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    chip.style.transform = '';
                }, 100);

                // Auto-resize textarea if needed
                promptEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });
}

// ============================================
// @ MENTION POPUP
// ============================================

function initMentionPopup() {
    const promptEl = document.getElementById('sp-prompt');
    const mentionPopup = document.getElementById('sp-mention-popup');

    if (!promptEl || !mentionPopup) return;

    let mentionActive = false;
    let mentionCursor = -1;

    // Show popup when typing @
    promptEl.addEventListener('input', (e) => {
        const value = promptEl.value;
        const cursorPos = promptEl.selectionStart;

        // Check if @ was just typed
        if (value[cursorPos - 1] === '@') {
            showMentionPopup();
        } else if (mentionActive) {
            // Check if we're still in mention mode
            const textBeforeCursor = value.substring(0, cursorPos);
            const lastAtIndex = textBeforeCursor.lastIndexOf('@');

            if (lastAtIndex === -1 || textBeforeCursor.indexOf(' ', lastAtIndex) !== -1) {
                hideMentionPopup();
            } else {
                // Filter workers based on typed text
                const filterText = textBeforeCursor.substring(lastAtIndex + 1).toLowerCase();
                filterMentionOptions(filterText);
            }
        }
    });

    // Hide popup on blur
    promptEl.addEventListener('blur', () => {
        setTimeout(() => {
            hideMentionPopup();
        }, 200);
    });

    // Keyboard navigation
    promptEl.addEventListener('keydown', (e) => {
        if (!mentionActive) return;

        const options = mentionPopup.querySelectorAll('.sp-mention-option:not(.hidden)');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            mentionCursor = Math.min(mentionCursor + 1, options.length - 1);
            updateMentionCursor(options);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            mentionCursor = Math.max(mentionCursor - 1, 0);
            updateMentionCursor(options);
        } else if (e.key === 'Enter' && mentionCursor >= 0) {
            e.preventDefault();
            const selected = options[mentionCursor];
            if (selected) {
                selectMention(selected.dataset.worker);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideMentionPopup();
        }
    });

    // Click to select
    mentionPopup.addEventListener('click', (e) => {
        const option = e.target.closest('.sp-mention-option');
        if (option) {
            selectMention(option.dataset.worker);
        }
    });

    function showMentionPopup() {
        mentionPopup.classList.add('open');
        mentionActive = true;
        mentionCursor = 0;
        filterMentionOptions('');
        updateMentionCursor(mentionPopup.querySelectorAll('.sp-mention-option'));
    }

    function hideMentionPopup() {
        mentionPopup.classList.remove('open');
        mentionActive = false;
        mentionCursor = -1;
    }

    function filterMentionOptions(filter) {
        const options = mentionPopup.querySelectorAll('.sp-mention-option');
        options.forEach(opt => {
            const name = opt.querySelector('.sp-mention-name')?.textContent.toLowerCase() || '';
            opt.classList.toggle('hidden', !name.includes(filter));
            opt.style.display = name.includes(filter) ? 'flex' : 'none';
        });
    }

    function updateMentionCursor(options) {
        options.forEach((opt, i) => {
            opt.classList.toggle('active', i === mentionCursor);
        });
    }

    function selectMention(workerId) {
        // Map worker IDs to shorthand names
        const workerNames = {
            chatgpt_web: 'chatgpt',
            gemini_web: 'gemini',
            perplexity_web: 'perplexity',
            copilot_web: 'copilot',
            grok_web: 'grok'
        };

        // Handle clones: chatgpt_web_2 -> chatgpt2
        let name;
        const cloneMatch = workerId.match(/^(\w+)_web_(\d+)$/);
        if (cloneMatch) {
            const baseName = cloneMatch[1]; // 'chatgpt'
            const cloneNum = cloneMatch[2]; // '2'
            name = baseName + cloneNum; // 'chatgpt2'
        } else {
            name = workerNames[workerId] || workerId;
        }

        const value = promptEl.value;
        const cursorPos = promptEl.selectionStart;
        const lastAtIndex = value.substring(0, cursorPos).lastIndexOf('@');

        // Replace @... with @worker
        const newValue = value.substring(0, lastAtIndex) + '@' + name + ' ' + value.substring(cursorPos);
        promptEl.value = newValue;
        promptEl.focus();

        // Position cursor after the mention
        const newCursorPos = lastAtIndex + name.length + 2;
        promptEl.setSelectionRange(newCursorPos, newCursorPos);

        hideMentionPopup();
    }
}

// Export for use in sidepanel.js
window.WorkerPanel = {
    // Theme
    toggleTheme,

    // Worker Panel
    refreshWorkerList,
    refreshAllWorkersStatus,
    openWorkerPanel,
    closeWorkerPanel,

    // Worker Avatars
    refreshAvatarsState,
    updateAvatarState,

    // Legacy (for compatibility)
    showCollaborationIndicator,
    updateWorkerDot: updateAvatarState
};
