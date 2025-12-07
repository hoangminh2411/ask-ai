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
    // Redirect to side panel: update context and open panel
    CTX_MODAL.state.modalClosedManually = false;
    chrome.runtime.sendMessage({ action: "askgpt_open_sidepanel" });
    chrome.runtime.sendMessage({ action: "askgpt_panel_set_context", selection: text || "" });
    return;
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
