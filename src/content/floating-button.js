// Floating button to trigger modal from selection
const { state } = window.ASKGPT_CONTENT;
const { showModal } = window.ASKGPT_CONTENT || {};

function createFloatingButton(pageX, pageY, clientX, clientY, textContent) {
    if (state.floatingBtn) state.floatingBtn.remove();

    state.floatingBtn = document.createElement('button');
    state.floatingBtn.id = 'askgpt-floating-btn';
    state.floatingBtn.innerHTML = `Hỏi AI`;

    const btnWidth = 100;
    const docWidth = document.documentElement.scrollWidth;
    let safePageX = pageX;
    if (pageX + btnWidth > docWidth) safePageX = pageX - btnWidth - 10;

    state.floatingBtn.style.left = `${safePageX}px`;
    state.floatingBtn.style.top = `${pageY}px`;

    state.floatingBtn.onmousedown = (e) => {
        e.preventDefault(); e.stopPropagation();
        showModal(textContent, clientX, clientY);
        setTimeout(() => removeFloatingButton(), 10);
    };

    state.floatingBtn.onmouseup = (e) => e.stopPropagation();
    state.floatingBtn.onclick = (e) => e.stopPropagation();

    document.body.appendChild(state.floatingBtn);
}

function removeFloatingButton() {
    if (state.floatingBtn) { state.floatingBtn.remove(); state.floatingBtn = null; }
}

window.ASKGPT_CONTENT = Object.assign(window.ASKGPT_CONTENT || {}, {
    createFloatingButton,
    removeFloatingButton
});
