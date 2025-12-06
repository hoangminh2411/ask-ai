// Modal rendering and binding logic
const CTX_MODAL = window.ASKGPT_CONTENT;

function resetModalState() {
    document.getElementById('askgpt-result').innerHTML = "";
    document.getElementById('askgpt-status-container').style.display = 'none';
    document.getElementById('askgpt-custom-input').value = "";
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
            <div id="askgpt-title">dY- Ask AI Assistant</div>
            <div class="askgpt-window-controls">
                <button id="askgpt-dock-btn" class="askgpt-icon-btn" title="Ghim sang phải (Sidebar)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
                <button id="askgpt-close" class="askgpt-icon-btn close" title="Đóng">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <div id="askgpt-body">
            <div id="askgpt-quote" data-full-text="${CTX_MODAL.escapeHtml(text)}">"${CTX_MODAL.escapeHtml(text.substring(0, 150))}${text.length > 150 ? '...' : ''}"</div>

            <div class="askgpt-input-group">
                <input type="text" id="askgpt-custom-input" placeholder="Hỏi thêm hoặc nhập lệnh riêng...">
                <div class="askgpt-chips">
                    <div class="askgpt-chip" data-prompt="Giải thích chi tiết:">dY? Giải thích</div>
                    <div class="askgpt-chip" data-prompt="Dịch sang tiếng Việt:">dYØ¯dYØ3 Dịch Việt</div>
                    <div class="askgpt-chip" data-prompt="Tóm tắt 5 ý chính:">dY"? Tóm tắt</div>
                    <div class="askgpt-chip" data-prompt="Phân tích Code/Lỗi:">dY'¯ Code/Bug</div>
                </div>
            </div>

            <div id="askgpt-result"></div> <div id="askgpt-status-container" style="display:none;">
                <div id="askgpt-status-text">Đang kết nối...</div>
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

    document.getElementById('askgpt-close').onclick = () => {
        if (CTX_MODAL.state.modal) {
            if (CTX_MODAL.state.isSidebarMode) document.body.style.marginRight = CTX_MODAL.state.originalBodyMargin;
            CTX_MODAL.state.modal.remove(); CTX_MODAL.state.modal = null; CTX_MODAL.state.isSidebarMode = false;
        }
    };
    document.getElementById('askgpt-dock-btn').onclick = CTX_MODAL.toggleSidebar;

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
