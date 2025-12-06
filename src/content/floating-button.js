// Floating button to trigger modal from selection
const CTX_FLOAT = window.ASKGPT_CONTENT;

function createFloatingButton(pageX, pageY, clientX, clientY, textContent) {
    if (CTX_FLOAT.state.floatingBtn) CTX_FLOAT.state.floatingBtn.remove();

    CTX_FLOAT.state.floatingBtn = document.createElement('button');
    CTX_FLOAT.state.floatingBtn.id = 'askgpt-floating-btn';
    CTX_FLOAT.state.floatingBtn.innerHTML = `Hỏi AI`;

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
