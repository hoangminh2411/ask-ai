// Modal rendering and binding logic
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__modalLoaded) {
    if (!window.ASKGPT_CONTENT.__modalWarned) {
        window.ASKGPT_CONTENT.__modalWarned = true;
        console.debug("ASKGPT modal script already loaded; skipping.");
    }
} else {
const CTX_MODAL = window.ASKGPT_CONTENT;

function resetModalState() {
    const result = document.getElementById('askgpt-result');
    const status = document.getElementById('askgpt-status-container');
    const input = document.getElementById('askgpt-custom-input');
    if (result) result.innerHTML = "";
    if (status) status.style.display = 'none';
    if (input) input.value = "";
}

function closeModal(reason = "user") {
    let modal = CTX_MODAL.state.modal;
    if (!modal) {
        modal = document.getElementById('askgpt-modal');
        if (modal) CTX_MODAL.state.modal = modal;
    }
    if (!modal) {
        console.debug("ASKGPT closeModal: modal missing", reason);
        return;
    }
    console.debug("ASKGPT closeModal", reason);
    CTX_MODAL.state.modalClosedManually = true;
    if (CTX_MODAL.state.isSidebarMode) document.body.style.marginRight = CTX_MODAL.state.originalBodyMargin;
    modal.remove();
    CTX_MODAL.state.modal = null;
    CTX_MODAL.state.isSidebarMode = false;
}

function bindActionButtons(currentText) {
    if (!CTX_MODAL.state.modal) return;
    const chips = CTX_MODAL.state.modal.querySelectorAll('.askgpt-chip');
    chips.forEach(chip => {
        const newChip = chip.cloneNode(true);
        chip.parentNode.replaceChild(newChip, chip);
        newChip.onclick = () => {
            const prompt = newChip.getAttribute('data-prompt');
            CTX_MODAL.triggerAsk(prompt, currentText);
        };
    });
}

function showModal(text, clientX, clientY) {
    CTX_MODAL.state.modalClosedManually = false;
    if (CTX_MODAL.state.modal) {
        const quoteDiv = document.getElementById('askgpt-quote');
        if (quoteDiv) quoteDiv.innerText = `"${text.substring(0, 200)}${text.length > 200 ? '...' : ''}"`;
        if (quoteDiv) quoteDiv.dataset.fullText = text;
        resetModalState();
        bindActionButtons(text);
        return;
    }

    CTX_MODAL.state.modal = document.createElement('div');
    CTX_MODAL.state.modal.id = 'askgpt-modal';

    const modalW = 450; const modalH = 600; const pad = 20;
    const vw = window.innerWidth; const vh = window.innerHeight;
    let left = clientX + 20; let top = clientY - 50;

    if (left + modalW > vw) left = clientX - modalW - 20;
    if (left < pad) left = pad;
    if (top + modalH > vh) top = vh - modalH - pad;
    if (top < pad) top = pad;

    CTX_MODAL.state.modal.style.left = `${left}px`;
    CTX_MODAL.state.modal.style.top = `${top}px`;

    CTX_MODAL.state.modal.innerHTML = `
        <div id="askgpt-sidebar-resizer"></div>
        <div id="askgpt-header">
            <div id="askgpt-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="13 2 13 9 20 9"></polyline>
                    <path d="M20 13v5a2 2 0 0 1-2 2h-4.586a1 1 0 0 0-.707.293L10 22v-2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path>
                </svg>
                <span>Ask AI Assistant</span>
            </div>
            <div class="askgpt-window-controls">
                <button id="askgpt-dock-btn" class="askgpt-icon-btn" title="Dock to right (Sidebar)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
                <button id="askgpt-close" class="askgpt-icon-btn close" title="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <div id="askgpt-body">
            <div id="askgpt-quote" data-full-text="${CTX_MODAL.escapeHtml(text)}">"${CTX_MODAL.escapeHtml(text.substring(0, 150))}${text.length > 150 ? '...' : ''}"</div>

            <div class="askgpt-input-group">
                <input type="text" id="askgpt-custom-input" placeholder="Ask follow-up or type a custom command...">
                <div class="askgpt-chips">
                    <div class="askgpt-chip" data-prompt="Explain this clearly for a beginner:">Explain</div>
                    <div class="askgpt-chip" data-prompt="Translate this to Vietnamese (natural tone):">Translate to Vietnamese</div>
                    <div class="askgpt-chip" data-prompt="Summarize in 5 bullet points:">Summarize</div>
                    <div class="askgpt-chip" data-prompt="Analyze code/issues and suggest fixes:">Code/Bug Review</div>
                </div>
            </div>

            <div id="askgpt-result"></div> <div id="askgpt-status-container" style="display:none;">
                <div id="askgpt-status-text">Connecting...</div>
                <div id="askgpt-skeleton">
                    <div class="skeleton-line"></div><div class="skeleton-line medium"></div>
                </div>
            </div>

            <div id="askgpt-resizer"></div>
        </div>
    `;

    document.body.appendChild(CTX_MODAL.state.modal);

    const header = document.getElementById('askgpt-header');
    const resizer = document.getElementById('askgpt-resizer');
    const sidebarResizer = document.getElementById('askgpt-sidebar-resizer');

    CTX_MODAL.makeDraggable(CTX_MODAL.state.modal, header);
    CTX_MODAL.makeResizable(CTX_MODAL.state.modal, resizer);
    CTX_MODAL.makeSidebarResizable(CTX_MODAL.state.modal, sidebarResizer);

    const closeBtn = document.getElementById('askgpt-close');
    closeBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); console.debug("ASKGPT closeBtn click"); closeModal("close-button"); };
    const dockBtn = document.getElementById('askgpt-dock-btn');
    dockBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); console.debug("ASKGPT dockBtn click"); CTX_MODAL.toggleSidebar(); };

    const customInput = document.getElementById('askgpt-custom-input');
    customInput.onkeydown = (e) => {
        if (e.key === 'Enter' && customInput.value.trim()) {
            const fullText = document.getElementById('askgpt-quote').dataset.fullText || "";
            CTX_MODAL.triggerAsk(customInput.value.trim(), fullText);
            customInput.value = "";
        }
    };

    bindActionButtons(text);
}

CTX_MODAL.showModal = showModal;
CTX_MODAL.resetModalState = resetModalState;
CTX_MODAL.bindActionButtons = bindActionButtons;
CTX_MODAL.closeModal = closeModal;
window.ASKGPT_CONTENT.__modalLoaded = true;
window.ASKGPT_CONTENT.__modalWarned = true;

// Fallback global delegation so Close/Dock still work if direct bindings are missed.
if (!window.ASKGPT_CONTENT.__modalDelegated) {
    document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest && e.target.closest('#askgpt-close');
        const dockBtn = e.target.closest && e.target.closest('#askgpt-dock-btn');
        if (closeBtn && CTX_MODAL.state.modal) {
            e.preventDefault(); e.stopPropagation();
            console.debug("ASKGPT closeModal (delegated)", e);
            closeModal("delegated-close");
        } else if (dockBtn && CTX_MODAL.state.modal) {
            e.preventDefault(); e.stopPropagation();
            console.debug("ASKGPT toggleSidebar (delegated)", e);
            CTX_MODAL.toggleSidebar();
        }
    }, true); // capture phase to beat other overlays

    // Also handle mousedown in case click is suppressed by overlay quirks.
    document.addEventListener('mousedown', (e) => {
        const closeBtn = e.target.closest && e.target.closest('#askgpt-close');
        const dockBtn = e.target.closest && e.target.closest('#askgpt-dock-btn');
        if (closeBtn && CTX_MODAL.state.modal) {
            e.preventDefault(); e.stopPropagation();
            console.debug("ASKGPT closeModal (delegated mousedown)", e);
            closeModal("delegated-mousedown");
        } else if (dockBtn && CTX_MODAL.state.modal) {
            e.preventDefault(); e.stopPropagation();
            console.debug("ASKGPT toggleSidebar (delegated mousedown)", e);
            CTX_MODAL.toggleSidebar();
        } else {
            const inModal = e.target.closest && e.target.closest('#askgpt-modal');
            if (inModal) {
                const id = e.target.id || e.target.closest?.('[id]')?.id || 'no-id';
                console.debug("ASKGPT modal mousedown (capture)", { id, target: e.target });
            }
        }
    }, true);

    window.ASKGPT_CONTENT.__modalDelegated = true;
}

} // end guard
