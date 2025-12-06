// Layout helpers: sidebar toggle and resize/drag behaviors
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__layoutLoaded) {
    if (!window.ASKGPT_CONTENT.__layoutWarned) {
        window.ASKGPT_CONTENT.__layoutWarned = true;
        console.debug("ASKGPT layout script already loaded; skipping.");
    }
} else {
const CTX_LAYOUT = window.ASKGPT_CONTENT;

function toggleSidebar() {
    const modal = CTX_LAYOUT.state.modal || document.getElementById('askgpt-modal');
    if (!modal) {
        console.debug("ASKGPT toggleSidebar: modal missing");
        return;
    }
    CTX_LAYOUT.state.modal = modal;
    const currentlySidebar = modal.classList.contains('sidebar-mode');
    CTX_LAYOUT.state.isSidebarMode = !currentlySidebar;
    console.debug("ASKGPT toggleSidebar state", { sidebar: CTX_LAYOUT.state.isSidebarMode });

    const btnIcon = modal.querySelector('#askgpt-dock-btn');
    const header = document.getElementById('askgpt-header');

    if (CTX_LAYOUT.state.isSidebarMode) {
        CTX_LAYOUT.state.modal.classList.add('sidebar-mode');
        CTX_LAYOUT.state.originalBodyMargin = document.body.style.marginRight;
        CTX_LAYOUT.state.modal.style.width = '400px'; CTX_LAYOUT.state.modal.style.height = '';
        CTX_LAYOUT.state.modal.style.top = ''; CTX_LAYOUT.state.modal.style.left = '';
        document.body.style.marginRight = '400px';
        document.body.style.transition = 'margin-right 0.2s ease-out';
        btnIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
        btnIcon.title = "Tháo ghim (Float)";
        header.style.cursor = "default";
    } else {
        CTX_LAYOUT.state.modal.classList.remove('sidebar-mode');
        document.body.style.marginRight = CTX_LAYOUT.state.originalBodyMargin;
        const floatWidth = 450; const floatHeight = 600;
        const leftPos = (window.innerWidth - floatWidth) / 2;
        const topPos = Math.max(50, (window.innerHeight - floatHeight) / 2);
        CTX_LAYOUT.state.modal.style.width = `${floatWidth}px`; CTX_LAYOUT.state.modal.style.height = "auto";
        CTX_LAYOUT.state.modal.style.left = `${leftPos}px`; CTX_LAYOUT.state.modal.style.top = `${topPos}px`;
        btnIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;
        btnIcon.title = "Sidebar";
        header.style.cursor = "move";
        // ensure modal stays on screen after undocking
        CTX_LAYOUT.state.modal.style.top = `${Math.max(20, parseFloat(CTX_LAYOUT.state.modal.style.top) || topPos)}px`;
        CTX_LAYOUT.state.modal.style.left = `${Math.max(10, parseFloat(CTX_LAYOUT.state.modal.style.left) || leftPos)}px`;
    }
}

function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;
    function dragMouseDown(e) {
        if (CTX_LAYOUT.state.isSidebarMode || e.target.closest('button')) return;
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
        if (!CTX_LAYOUT.state.isSidebarMode) return;
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

CTX_LAYOUT.toggleSidebar = toggleSidebar;
CTX_LAYOUT.makeDraggable = makeDraggable;
CTX_LAYOUT.makeResizable = makeResizable;
CTX_LAYOUT.makeSidebarResizable = makeSidebarResizable;
CTX_LAYOUT.escapeHtml = escapeHtml;

window.ASKGPT_CONTENT.__layoutLoaded = true;
window.ASKGPT_CONTENT.__layoutWarned = true;
} // end guard
