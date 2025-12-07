// Shared state for content script components
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
window.ASKGPT_CONTENT.state = {
    floatingBtn: null,
    rewriteMenu: null,
    modal: null,
    isSidebarMode: false,
    originalBodyMargin: "",
    currentBotMsgDiv: null,
    modalClosedManually: false
};
