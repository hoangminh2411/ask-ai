// === CONTENT.JS: CHAT MODE & SIDEBAR SUMMARY ===

let floatingBtn = null;
let modal = null;
let isSidebarMode = false;
let originalBodyMargin = ""; 
let currentBotMsgDiv = null; // Biến để track tin nhắn bot đang stream

// =================================================================
// 1. PAGE EXTRACTION (LẤY NỘI DUNG TRANG THÔNG MINH)
// =================================================================
function getPageContent() {
    // Ưu tiên thẻ bài viết chuẩn
    const article = document.querySelector('article') || document.querySelector('main') || document.querySelector('[role="main"]');
    let content = "";
    
    if (article) {
        content = article.innerText;
    } else {
        // Fallback: Clone body và lọc rác
        const cloneBody = document.body.cloneNode(true);
        const trashSelectors = [
            'script', 'style', 'nav', 'footer', 'header', 'noscript', 'iframe', 
            '.ads', '#comments', '.sidebar', '.menu', '[role="banner"]', '[role="navigation"]'
        ];
        trashSelectors.forEach(sel => {
            const trash = cloneBody.querySelectorAll(sel);
            trash.forEach(el => el.remove());
        });
        content = cloneBody.innerText;
    }

    // Cắt gọn để tránh quá tải token (khoảng 15k ký tự ~ 4k token)
    return content.trim().substring(0, 15000); 
}

// =================================================================
// 2. LISTENERS (EVENTS TỪ BACKGROUND)
// =================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // A. Xử lý Tóm tắt trang (Context Menu / Shortcut)
    if (request.action === "summarize_page") {
        const pageText = getPageContent();
        if (!pageText || pageText.length < 50) {
            alert("Trang này quá ngắn hoặc không có nội dung văn bản.");
            return;
        }

        // Mở modal (vị trí tạm)
        showModal("Đang đọc nội dung trang web...", 100, 100);

        // Ép sang Sidebar Mode nếu chưa bật
        if (!isSidebarMode) {
            toggleSidebar();
        }
        
        // Gửi lệnh tóm tắt ngay
        triggerAsk("Tóm tắt các ý chính của trang web này (bỏ qua quảng cáo/menu):", pageText);
    }
    
    // B. Xử lý Phím tắt mở nhanh (Alt+Q)
    else if (request.action === "trigger_modal_shortcut") {
        const selection = window.getSelection().toString().trim();
        const cx = window.innerWidth / 2 - 225; 
        const cy = window.innerHeight / 2 - 300;
        showModal(selection || "Xin chào, tôi có thể giúp gì cho bạn?", cx, cy);
    }
});

// =================================================================
// 3. UI GENERATION (NÚT NỔI & MODAL)
// =================================================================
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

function showModal(text, clientX, clientY) {
    // Nếu modal đã mở -> Cập nhật context mới và reset
    if (modal) {
        const quoteDiv = document.getElementById('askgpt-quote');
        if (quoteDiv) quoteDiv.innerText = `"${text.substring(0, 200)}${text.length > 200 ? '...' : ''}"`;
        // Lưu context full vào thuộc tính ẩn để dùng khi chat tiếp
        if (quoteDiv) quoteDiv.dataset.fullText = text;
        
        resetModalState(); // Xóa lịch sử cũ để bắt đầu context mới
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
            <div id="askgpt-title">🤖 Ask AI Assistant</div>
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
            <div id="askgpt-quote" data-full-text="${escapeHtml(text)}">"${escapeHtml(text.substring(0, 150))}${text.length > 150 ? '...' : ''}"</div>
            
            <div class="askgpt-input-group">
                <input type="text" id="askgpt-custom-input" placeholder="Hỏi thêm hoặc nhập lệnh riêng...">
                <div class="askgpt-chips">
                    <div class="askgpt-chip" data-prompt="Giải thích chi tiết:">🧐 Giải thích</div>
                    <div class="askgpt-chip" data-prompt="Dịch sang tiếng Việt:">🇻🇳 Dịch Việt</div>
                    <div class="askgpt-chip" data-prompt="Tóm tắt ý chính:">📝 Tóm tắt</div>
                    <div class="askgpt-chip" data-prompt="Phân tích Code/Lỗi:">💻 Code/Bug</div>
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
    
    document.body.appendChild(modal);
    
    // Setup Events
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
        if (e.key === 'Enter' && customInput.value.trim()) {
            // Lấy context từ attribute ẩn
            const fullText = document.getElementById('askgpt-quote').dataset.fullText || "";
            triggerAsk(customInput.value.trim(), fullText);
            customInput.value = ""; // Clear input sau khi gửi
        }
    };

    bindActionButtons(text);
}

function resetModalState() {
    document.getElementById('askgpt-result').innerHTML = ""; // Xóa chat cũ khi chọn text mới
    document.getElementById('askgpt-status-container').style.display = 'none';
    document.getElementById('askgpt-custom-input').value = "";
}

function bindActionButtons(currentText) {
    if (!modal) return;
    const chips = modal.querySelectorAll('.askgpt-chip');
    chips.forEach(chip => {
        // Clone để xóa event listener cũ
        const newChip = chip.cloneNode(true);
        chip.parentNode.replaceChild(newChip, chip);
        newChip.onclick = () => {
            const prompt = newChip.getAttribute('data-prompt');
            triggerAsk(prompt, currentText);
        }
    });
}

// =================================================================
// 4. CHAT LOGIC (APPEND MESSAGE)
// =================================================================
function triggerAsk(promptPrefix, text) {
    const resultDiv = document.getElementById('askgpt-result');
    const statusContainer = document.getElementById('askgpt-status-container');
    const statusText = document.getElementById('askgpt-status-text');

    // 1. Render User Message
    const userMsg = document.createElement('div');
    userMsg.className = 'askgpt-msg-user';
    // Nếu prompt có dấu : (VD: "Giải thích:"), chỉ hiện phần label cho đẹp
    userMsg.innerText = promptPrefix.endsWith(':') ? promptPrefix.replace(':', '') : promptPrefix;
    resultDiv.appendChild(userMsg);

    // 2. Render Bot Message Placeholder
    currentBotMsgDiv = document.createElement('div');
    currentBotMsgDiv.className = 'askgpt-msg-bot';
    currentBotMsgDiv.innerHTML = '<span class="askgpt-typing">AI đang suy nghĩ...</span>';
    resultDiv.appendChild(currentBotMsgDiv);

    // Scroll xuống dưới cùng
    resultDiv.scrollTop = resultDiv.scrollHeight;

    // Show Loading
    statusContainer.style.display = 'flex';
    statusText.innerText = "⏳ Đang xử lý...";

    // 3. Gửi Request Background
    const port = chrome.runtime.connect({ name: "ask-gpt-port" });
    
    // Nếu là câu lệnh ngắn (follow-up), không cần gửi lại context dài dòng nếu dùng Web Automation (vì tab kia vẫn mở)
    // Tuy nhiên để an toàn cho cả API mode, ta cứ gửi kèm Context nhưng làm gọn lại.
    let finalQuery = "";
    if (text && text.length > 0) {
        finalQuery = `${promptPrefix}\n\nContext:\n"${text}"`;
    } else {
        finalQuery = promptPrefix;
    }

    port.postMessage({ query: finalQuery });

    // 4. Nhận Stream kết quả
    port.onMessage.addListener((msg) => {
        if (msg.status === 'progress') {
            statusText.innerText = "⚡ " + msg.message;
        } 
        else if (msg.status === 'success') {
            statusContainer.style.display = 'none';
            
            if (typeof marked !== 'undefined') {
                currentBotMsgDiv.innerHTML = marked.parse(msg.answer);
            } else {
                currentBotMsgDiv.innerText = msg.answer; 
            }
            
            // Auto scroll
            resultDiv.scrollTop = resultDiv.scrollHeight;
        } 
        else if (msg.status === 'error') {
            statusContainer.style.display = 'none';
            currentBotMsgDiv.innerHTML = `<span style="color:red">❌ ${msg.error}</span>`;
        }
    });
}

// =================================================================
// 5. WINDOW MANAGEMENT (DRAG, RESIZE, SIDEBAR)
// =================================================================
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

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// =================================================================
// 6. GLOBAL TRIGGERS (MOUSE EVENTS)
// =================================================================
document.addEventListener('mouseup', (e) => {
    if (e.target.closest('#askgpt-modal') || e.target.closest('#askgpt-floating-btn')) return;
    
    // Chỉ hiện nút nổi nếu bôi đen đủ dài và không phải click vu vơ
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length > 2) { 
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Tính toán vị trí thông minh
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

