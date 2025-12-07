// Floating launcher to open the Chrome side panel (not an in-page modal)
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__spLauncherLoaded) {
    if (!window.ASKGPT_CONTENT.__spLauncherWarned) {
        window.ASKGPT_CONTENT.__spLauncherWarned = true;
        console.debug("ASKGPT sidepanel launcher already loaded; skipping.");
    }
} else {
    const CTX_SP = window.ASKGPT_CONTENT;

    function createLauncher() {
        if (document.getElementById('askgpt-sidepanel-launcher')) return;
        const btn = document.createElement('button');
        btn.id = 'askgpt-sidepanel-launcher';
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="13 2 13 9 20 9"></polyline>
                <path d="M20 13v5a2 2 0 0 1-2 2h-4.586a1 1 0 0 0-.707.293L10 22v-2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path>
            </svg>
            <span>Ask</span>
        `;
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '18px',
            right: '18px',
            zIndex: '2147483647',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(135deg, #111827, #0f172a)',
            color: '#fff',
            border: 'none',
            borderRadius: '999px',
            padding: '10px 14px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
            cursor: 'pointer',
            fontFamily: '-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif',
            fontSize: '13px',
            fontWeight: '700',
            userSelect: 'none',
            touchAction: 'none'
        });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Clean up any in-page AskGPT UI before opening side panel
            document.querySelectorAll('#askgpt-modal, #askgpt-floating-btn, #askgpt-capture-overlay, .askgpt-capture-toolbox').forEach((el) => el.remove());
            chrome.runtime.sendMessage({ action: "askgpt_open_sidepanel" });
        });
        // Make draggable
        let drag = null;
        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            drag = { x: e.clientX - btn.offsetLeft, y: e.clientY - btn.offsetTop };
            const rect = btn.getBoundingClientRect();
            btn.style.left = `${rect.left}px`;
            btn.style.top = `${rect.top}px`;
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
        function move(e) {
            if (!drag) return;
            const maxX = window.innerWidth - btn.offsetWidth - 8;
            const maxY = window.innerHeight - btn.offsetHeight - 8;
            const nextX = Math.min(Math.max(e.clientX - drag.x, 8), maxX);
            const nextY = Math.min(Math.max(e.clientY - drag.y, 8), maxY);
            btn.style.left = `${nextX}px`;
            btn.style.top = `${nextY}px`;
        }
        function up() {
            drag = null;
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
        }
        document.body.appendChild(btn);
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.action === "askgpt_sidepanel_failed") {
            const reason = msg.error || "Side panel blocked (Chrome needs a direct user gesture). Please click the extension icon to open the panel.";
            alert(reason);
        }
    });

    // Delay to avoid clashing with page layout thrash on load
    setTimeout(createLauncher, 800);

    CTX_SP.__spLauncherLoaded = true;
    CTX_SP.__spLauncherWarned = true;
}
