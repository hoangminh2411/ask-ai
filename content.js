// === CONTENT.JS: FIXED POSITION LOGIC (Multi-Provider Support) ===

let floatingBtn = null;
let modal = null;
let isSidebarMode = false;
let originalBodyMargin = ""; 

// 1. Tạo nút nổi (Nhận cả 2 loại tọa độ)
function createFloatingButton(pageX, pageY, clientX, clientY, textContent) {
    if (floatingBtn) floatingBtn.remove();
    
    floatingBtn = document.createElement('button');
    floatingBtn.id = 'askgpt-floating-btn';
    floatingBtn.innerHTML = `Hỏi AI`; 
    
    const btnWidth = 100;
    const docWidth = document.documentElement.scrollWidth;
    let safePageX = pageX;
    if (pageX + btnWidth > docWidth) safePageX = pageX - btnWidth - 10;

    floatingBtn.style.left = `${safePageX}px`;
    floatingBtn.style.top = `${pageY}px`;
    
    floatingBtn.onmousedown = (e) => {
        e.preventDefault(); e.stopPropagation();
        showModal(textContent, clientX, clientY);
        setTimeout(() => removeFloatingButton(), 10);
    };
    
    floatingBtn.onmouseup = (e) => e.stopPropagation();
    floatingBtn.onclick = (e) => e.stopPropagation();
    
    document.body.appendChild(floatingBtn);
}

function removeFloatingButton() {
    if (floatingBtn) { floatingBtn.remove(); floatingBtn = null; }
}

// 2. Logic Kéo Thả
function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        if (isSidebarMode || e.target.closest('button')) return;
        e = e || window.event; e.preventDefault();
        pos3 = e.clientX; pos4 = e.clientY;
        element.style.transition = 'none'; 
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event; e.preventDefault();
        pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
        pos3 = e.clientX; pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null; document.onmousemove = null;
        element.style.transition = 'width 0.2s, height 0.2s, top 0.2s, left 0.2s';
    }
}

// 3. Logic Resize Thường
function makeResizable(element, handle) {
    handle.onmousedown = (e) => {
        e.preventDefault(); e.stopPropagation();
        element.style.transition = 'none';
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResize);
    };
    function resize(e) {
        const newWidth = e.clientX - element.offsetLeft;
        const newHeight = e.clientY - element.offsetTop;
        if (newWidth > 300) element.style.width = newWidth + 'px';
        if (newHeight > 200) element.style.height = newHeight + 'px';
    }
    function stopResize() {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResize);
        element.style.transition = 'width 0.2s, height 0.2s, top 0.2s, left 0.2s';
    }
}

// 4. Logic Sidebar Resize
function makeSidebarResizable(modal, handle) {
    handle.onmousedown = (e) => {
        e.preventDefault(); e.stopPropagation();
        document.body.style.cursor = 'col-resize'; 
        modal.style.transition = 'none';
        document.body.style.transition = 'none';
        window.addEventListener('mousemove', resizeSidebar);
        window.addEventListener('mouseup', stopResizeSidebar);
    };
    function resizeSidebar(e) {
        if (!isSidebarMode) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 300 && newWidth < window.innerWidth * 0.8) {
            modal.style.width = newWidth + 'px';
            document.body.style.marginRight = newWidth + 'px';
        }
    }
    function stopResizeSidebar() {
        document.body.style.cursor = 'default';
        window.removeEventListener('mousemove', resizeSidebar);
        window.removeEventListener('mouseup', stopResizeSidebar);
        modal.style.transition = 'width 0.2s';
        document.body.style.transition = 'margin-right 0.2s';
    }
}

// 5. Toggle Sidebar
function toggleSidebar() {
    if (!modal) return;
    isSidebarMode = !isSidebarMode;
    const btnIcon = modal.querySelector('#askgpt-dock-btn');
    const header = document.getElementById('askgpt-header');
    
    if (isSidebarMode) {
        modal.classList.add('sidebar-mode');
        originalBodyMargin = document.body.style.marginRight;
        modal.style.width = '400px'; modal.style.height = ''; 
        modal.style.top = ''; modal.style.left = ''; 
        document.body.style.marginRight = '400px';
        document.body.style.transition = 'margin-right 0.2s ease-out';
        btnIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
        btnIcon.title = "Tháo ghim (Float)";
        header.style.cursor = "default";
    } else {
        modal.classList.remove('sidebar-mode');
        document.body.style.marginRight = originalBodyMargin;
        const floatWidth = 450; const floatHeight = 600;
        const leftPos = (window.innerWidth - floatWidth) / 2;
        const topPos = Math.max(50, (window.innerHeight - floatHeight) / 2);
        modal.style.width = `${floatWidth}px`; modal.style.height = "auto";
        modal.style.left = `${leftPos}px`; modal.style.top = `${topPos}px`;
        btnIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
        btnIcon.title = "Sidebar";
        header.style.cursor = "move";
    }
}

// 6. Show Modal
function showModal(text, clientX, clientY) {
    if (modal) {
        const quoteDiv = document.getElementById('askgpt-quote');
        if (quoteDiv) quoteDiv.innerText = `"${text}"`;
        resetModalState();
        bindActionButtons(text);
        return; 
    }

    modal = document.createElement('div');
    modal.id = 'askgpt-modal';
    
    const modalW = 450; const modalH = 600; const pad = 20;
    const vw = window.innerWidth; const vh = window.innerHeight;
    let left = clientX + 20; let top = clientY - 50;

    if (left + modalW > vw) left = clientX - modalW - 20;
    if (left < pad) left = pad;
    if (top + modalH > vh) top = vh - modalH - pad;
    if (top < pad) top = pad;

    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;

    modal.innerHTML = `
        <div id="askgpt-sidebar-resizer"></div>
        <div id="askgpt-header">
            <div id="askgpt-title">🤖 Ask AI</div>
            <div class="askgpt-window-controls">
                <button id="askgpt-dock-btn" class="askgpt-icon-btn" title="Ghim sang phải">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
                <button id="askgpt-close" class="askgpt-icon-btn close" title="Đóng">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <div id="askgpt-body">
            <div id="askgpt-quote">"${escapeHtml(text)}"</div>
            <div class="askgpt-input-group">
                <input type="text" id="askgpt-custom-input" placeholder="Nhập lệnh riêng (Enter)...">
                <div class="askgpt-chips">
                    <div class="askgpt-chip" data-prompt="Giải thích chi tiết:">🧐 Giải thích</div>
                    <div class="askgpt-chip" data-prompt="Dịch sang tiếng Việt:">🇻🇳 Dịch Việt</div>
                    <div class="askgpt-chip" data-prompt="Dịch sang tiếng Anh:">🇬🇧 Dịch Anh</div>
                    <div class="askgpt-chip" data-prompt="Tóm tắt ý chính:">📝 Tóm tắt</div>
                    <div class="askgpt-chip" data-prompt="Phân tích Code:">💻 Code</div>
                    <div class="askgpt-chip" data-prompt="Viết Unit Test:">✅ Test</div>
                </div>
            </div>
            <div id="askgpt-status-container" style="display:none;">
                <div id="askgpt-status-text">Đang kết nối...</div>
                <div id="askgpt-skeleton">
                    <div class="skeleton-line"></div><div class="skeleton-line medium"></div>
                </div>
            </div>
            <div id="askgpt-result"></div>
            <div id="askgpt-resizer"></div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const header = document.getElementById('askgpt-header');
    const resizer = document.getElementById('askgpt-resizer');
    const sidebarResizer = document.getElementById('askgpt-sidebar-resizer');
    
    makeDraggable(modal, header);
    makeResizable(modal, resizer);
    makeSidebarResizable(modal, sidebarResizer);
    
    document.getElementById('askgpt-close').onclick = () => { 
        if(modal) {
            if (isSidebarMode) document.body.style.marginRight = originalBodyMargin;
            modal.remove(); modal = null; isSidebarMode = false;
        } 
    };
    document.getElementById('askgpt-dock-btn').onclick = toggleSidebar;

    const customInput = document.getElementById('askgpt-custom-input');
    customInput.onkeydown = (e) => {
        if (e.key === 'Enter' && customInput.value.trim()) triggerAsk(customInput.value.trim() + ":", text);
    };

    bindActionButtons(text);
}

function resetModalState() {
    document.getElementById('askgpt-result').innerHTML = "";
    document.getElementById('askgpt-status-container').style.display = 'none';
    document.getElementById('askgpt-custom-input').value = "";
    if(modal) modal.querySelectorAll('.askgpt-chip').forEach(c => c.classList.remove('active'));
}

function bindActionButtons(currentText) {
    if (!modal) return;
    const chips = modal.querySelectorAll('.askgpt-chip');
    chips.forEach(chip => {
        const newChip = chip.cloneNode(true);
        chip.parentNode.replaceChild(newChip, chip);
        newChip.onclick = () => {
            modal.querySelectorAll('.askgpt-chip').forEach(c => c.classList.remove('active'));
            newChip.classList.add('active');
            const prompt = newChip.getAttribute('data-prompt');
            triggerAsk(prompt, currentText);
        }
    });
}

function triggerAsk(promptPrefix, text) {
    const resultDiv = document.getElementById('askgpt-result');
    const statusContainer = document.getElementById('askgpt-status-container');
    const statusText = document.getElementById('askgpt-status-text');

    resultDiv.innerHTML = "";
    statusContainer.style.display = 'flex';
    statusText.innerText = "⏳ Đang xử lý...";

    const port = chrome.runtime.connect({ name: "ask-gpt-port" });
    const query = `${promptPrefix}\n\nRunning Context:\n"${text}"`;
    port.postMessage({ query: query });

    port.onMessage.addListener((msg) => {
        if (msg.status === 'progress') statusText.innerText = "⚡ " + msg.message;
        else if (msg.status === 'success') {
            statusContainer.style.display = 'none';
            // === UPDATE: Render Markdown cho cả API và Web ===
            if (typeof marked !== 'undefined') {
                resultDiv.innerHTML = marked.parse(msg.answer);
            } else {
                resultDiv.innerHTML = msg.answer; 
            }
        } 
        else if (msg.status === 'error') {
            statusContainer.style.display = 'none';
            resultDiv.innerHTML = `<span style="color:red">❌ ${msg.error}</span>`;
        }
    });
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 7. GLOBAL LISTENER
document.addEventListener('mouseup', (e) => {
    if (e.target.closest('#askgpt-modal') || e.target.closest('#askgpt-floating-btn')) return;
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const pageX = rect.right + window.scrollX + 5;
        const pageY = rect.top + window.scrollY - 35;
        const clientX = rect.right + 5;
        const clientY = rect.top - 35;
        createFloatingButton(pageX, pageY, clientX, clientY, text);
    }
});

document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#askgpt-floating-btn') && !e.target.closest('#askgpt-modal')) {
        removeFloatingButton();
    }
});