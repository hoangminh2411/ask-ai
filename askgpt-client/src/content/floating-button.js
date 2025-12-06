// Floating button to trigger modal from selection
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__floatLoaded) {
    // Only log once to avoid console spam when scripts are reinjected.
    if (!window.ASKGPT_CONTENT.__floatWarned) {
        window.ASKGPT_CONTENT.__floatWarned = true;
        console.debug("ASKGPT floating button script already loaded; skipping.");
    }
} else {
const CTX_FLOAT = window.ASKGPT_CONTENT;

function createFloatingButton(pageX, pageY, clientX, clientY, textContent) {
    if (CTX_FLOAT.state.floatingBtn) CTX_FLOAT.state.floatingBtn.remove();

    CTX_FLOAT.state.floatingBtn = document.createElement('button');
    CTX_FLOAT.state.floatingBtn.id = 'askgpt-floating-btn';
    CTX_FLOAT.state.floatingBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="13 2 13 9 20 9"></polyline>
            <path d="M20 13v5a2 2 0 0 1-2 2h-4.586a1 1 0 0 0-.707.293L10 22v-2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path>
        </svg>
        <span>Ask AI</span>
    `;

    const btnWidth = 100;
    const docWidth = document.documentElement.scrollWidth;
    let safePageX = pageX;
    if (pageX + btnWidth > docWidth) safePageX = pageX - btnWidth - 10;

    CTX_FLOAT.state.floatingBtn.style.left = `${safePageX}px`;
    CTX_FLOAT.state.floatingBtn.style.top = `${pageY}px`;

    CTX_FLOAT.state.floatingBtn.onmousedown = (e) => {
        e.preventDefault(); e.stopPropagation();
        CTX_FLOAT.showModal(textContent, clientX, clientY);
        setTimeout(() => removeFloatingButton(), 10);
    };

    CTX_FLOAT.state.floatingBtn.onmouseup = (e) => e.stopPropagation();
    CTX_FLOAT.state.floatingBtn.onclick = (e) => e.stopPropagation();

    document.body.appendChild(CTX_FLOAT.state.floatingBtn);
}

function removeFloatingButton() {
    if (CTX_FLOAT.state.floatingBtn) { CTX_FLOAT.state.floatingBtn.remove(); CTX_FLOAT.state.floatingBtn = null; }
}

CTX_FLOAT.createFloatingButton = createFloatingButton;
CTX_FLOAT.removeFloatingButton = removeFloatingButton;
window.ASKGPT_CONTENT.__floatLoaded = true;
window.ASKGPT_CONTENT.__floatWarned = true;

} // end guard
