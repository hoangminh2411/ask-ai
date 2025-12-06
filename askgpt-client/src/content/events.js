// Wire runtime and DOM events
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__eventsLoaded) {
    if (!window.ASKGPT_CONTENT.__eventsWarned) {
        window.ASKGPT_CONTENT.__eventsWarned = true;
        console.debug("ASKGPT events script already loaded; skipping.");
    }
} else {
const CTX_EVENTS = window.ASKGPT_CONTENT;

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "summarize_page") {
        const pageText = CTX_EVENTS.getPageContent();
        if (!pageText || pageText.length < 50) {
            alert("This page is too short or has no visible content.");
            sendResponse?.({ ok: false, error: "too_short" });
            return;
        }

        CTX_EVENTS.showModal("Reading page content...", 100, 100);

        if (!CTX_EVENTS.state.isSidebarMode) {
            CTX_EVENTS.toggleSidebar();
        }

        CTX_EVENTS.triggerAsk("Summarize the key points of this page (ignore ads/menus):", pageText);
        sendResponse?.({ ok: true });
        return true;
    }
    else if (request.action === "trigger_modal_shortcut") {
        const selection = window.getSelection().toString().trim();
        const cx = window.innerWidth / 2 - 225;
        const cy = window.innerHeight / 2 - 300;
        CTX_EVENTS.showModal(selection || "Hi there, how can I help?", cx, cy);
        sendResponse?.({ ok: true });
        return true;
    }
    else if (request.action === "start_image_capture") {
        CTX_EVENTS.startImageCapture();
        sendResponse?.({ ok: true });
        return true;
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

        CTX_EVENTS.createFloatingButton(pageX, pageY, clientX, clientY, text);
    }
});

document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#askgpt-floating-btn') && !e.target.closest('#askgpt-modal')) {
        CTX_EVENTS.removeFloatingButton();
    }
});

window.ASKGPT_CONTENT.__eventsLoaded = true;
window.ASKGPT_CONTENT.__eventsWarned = true;
} // end guard
