// Wire runtime and DOM events
const { state } = window.ASKGPT_CONTENT;
const { getPageContent } = window.ASKGPT_CONTENT;
const { showModal } = window.ASKGPT_CONTENT;
const { triggerAsk } = window.ASKGPT_CONTENT;
const { createFloatingButton, removeFloatingButton } = window.ASKGPT_CONTENT;

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "summarize_page") {
        const pageText = getPageContent();
        if (!pageText || pageText.length < 50) {
            alert("Trang này quá ngắn hoặc không có nội dung văn bản.");
            return;
        }

        showModal("Đang đọc nội dung trang web...", 100, 100);

        if (!state.isSidebarMode) {
            window.ASKGPT_CONTENT.toggleSidebar();
        }

        triggerAsk("Tóm tắt các ý chính của trang web này (bỏ qua quảng cáo/menu):", pageText);
    }
    else if (request.action === "trigger_modal_shortcut") {
        const selection = window.getSelection().toString().trim();
        const cx = window.innerWidth / 2 - 225;
        const cy = window.innerHeight / 2 - 300;
        showModal(selection || "Xin chào, tôi có thể giúp gì cho bạn?", cx, cy);
    }
});

document.addEventListener('mouseup', (e) => {
    if (e.target.closest('#askgpt-modal') || e.target.closest('#askgpt-floating-btn')) return;

    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length > 2) {
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
