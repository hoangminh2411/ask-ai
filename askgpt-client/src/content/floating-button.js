// Floating toolbar for text selection
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__floatLoaded) {
    if (!window.ASKGPT_CONTENT.__floatWarned) {
        window.ASKGPT_CONTENT.__floatWarned = true;
        console.debug("ASKGPT floating button script already loaded; skipping.");
    }
} else {
    const CTX_FLOAT = window.ASKGPT_CONTENT;
    let dragOffset = null;
    let globalDismissBound = false;

    function createFloatingButton(pageX, pageY, clientX, clientY, textContent) {
        removeFloatingButton();

        const pop = document.createElement('div');
        pop.id = 'askgpt-floating-btn';
        // Robust Styles to prevent UI breaking
        Object.assign(pop.style, {
            position: 'absolute',
            zIndex: '2147483647',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '6px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            width: 'auto',
            maxWidth: '90vw',
            flexWrap: 'nowrap',
            fontFamily: 'sans-serif',
            userSelect: 'none',
            left: '0px',
            top: '0px'
        });

        const promptList = (window.ASKGPT_PROMPTS || []).filter(p => (p.surfaces || []).includes('toolbar')).slice(0, 6);
        if (promptList.length === 0) {
            promptList.push(
                { label: "Explain", text: "Explain this clearly with concise steps and a short summary.", icon: "" },
                { label: "EN", text: "Rewrite in fluent English.", icon: "" },
                { label: "VN", text: "Dịch sang tiếng Việt ngắn gọn.", icon: "" },
                { label: "TL;DR", text: "Summarize into 3-5 bullets.", icon: "" }
            );
        }
        // Append quick controls - text only, no icons
        promptList.push(
            { label: "→", text: "", icon: "" },  // Panel button
            { label: "×", text: "__close__", icon: "" }  // Close button
        );

        const actions = document.createElement('div');
        actions.className = 'askgpt-fab-actions';
        Object.assign(actions.style, {
            display: 'flex',
            gap: '6px',
            alignItems: 'center'
        });

        promptList.forEach((preset) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'askgpt-fab-action';
            // Button Styles
            Object.assign(btn.style, {
                border: 'none',
                background: 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '13px',
                fontWeight: '500',
                color: '#333',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                transition: 'background 0.2s'
            });
            btn.onmouseover = () => btn.style.background = '#f0f2f5';
            btn.onmouseout = () => btn.style.background = 'transparent';

            btn.setAttribute('data-prompt', preset.text || "");
            if (preset.id) btn.setAttribute('data-id', preset.id);
            btn.title = preset.label;
            const iconSrc = preset.icon ? (chrome.runtime?.getURL?.(preset.icon) || preset.icon) : "";
            const needsRewriteMenu = preset.id === "rewrite-en";

            // Render Text/Icon content
            if (iconSrc) {
                btn.innerHTML = `<img src="${iconSrc}" style="width:16px;height:16px;">`;
            } else {
                btn.innerHTML = `<span>${preset.label}</span>`;
            }

            if (needsRewriteMenu) {
                btn.classList.add('askgpt-rewrite-entry');
            }
            actions.appendChild(btn);
        });
        pop.appendChild(actions);

        const btnWidth = pop.offsetWidth || 300; // Estimate
        const docWidth = document.documentElement.scrollWidth;
        const docHeight = document.documentElement.scrollHeight;
        const safePageX = Math.min(Math.max(pageX, 12), docWidth - 320);
        const safePageY = Math.min(Math.max(pageY, 12), docHeight - 120);
        pop.style.left = `${safePageX}px`;
        pop.style.top = `${safePageY}px`;

        pop.onmousedown = (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('button')) return;
            dragOffset = { x: e.clientX - pop.offsetLeft, y: e.clientY - pop.offsetTop };
            e.stopPropagation();
            document.addEventListener('mousemove', dragMove);
            document.addEventListener('mouseup', dragEnd);
        };

        pop.addEventListener('click', (e) => {
            const btn = e.target.closest('button.askgpt-fab-action');
            if (!btn) return;
            e.stopPropagation();
            const prompt = btn.getAttribute('data-prompt') || "";
            const label = btn.title || "";
            const id = btn.getAttribute('data-id') || "";
            if (prompt === "__close__") {
                removeFloatingButton();
                return;
            }
            if (id === "rewrite-en") {
                showRewriteMenu(pop, textContent);
                return;
            }
            chrome.runtime.sendMessage({ action: "askgpt_open_sidepanel" });
            if (prompt) {
                chrome.runtime.sendMessage({
                    action: "askgpt_panel_handle",
                    selection: textContent || "",
                    finalQuery: `${prompt}\n\nContext:\n"${textContent || ""}"`,
                    promptLabel: label
                });
            } else {
                chrome.runtime.sendMessage({
                    action: "askgpt_panel_set_context",
                    selection: textContent || ""
                });
            }
            setTimeout(() => removeFloatingButton(), 20);
        });

        document.body.appendChild(pop);
        CTX_FLOAT.state.floatingBtn = pop;

        if (!globalDismissBound) {
            document.addEventListener('mousedown', (e) => {
                if (CTX_FLOAT.state.floatingBtn && !e.target.closest('#askgpt-floating-btn')) {
                    removeFloatingButton();
                }
            });
            globalDismissBound = true;
        }
    }

    function removeFloatingButton() {
        if (CTX_FLOAT.state.floatingBtn) {
            dragEnd();
            CTX_FLOAT.state.floatingBtn.remove();
            CTX_FLOAT.state.floatingBtn = null;
        }
    }

    function dragMove(e) {
        if (!dragOffset || !CTX_FLOAT.state.floatingBtn) return;
        const el = CTX_FLOAT.state.floatingBtn;
        const maxX = document.documentElement.scrollWidth - el.offsetWidth - 10;
        const maxY = document.documentElement.scrollHeight - el.offsetHeight - 10;
        const x = Math.min(Math.max(e.clientX - dragOffset.x, 10), maxX);
        const y = Math.min(Math.max(e.clientY - dragOffset.y, 10), maxY);
        el.style.left = `${x + window.scrollX}px`;
        el.style.top = `${y + window.scrollY}px`;
    }
    function dragEnd() {
        dragOffset = null;
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('mouseup', dragEnd);
    }

    function showRewriteMenu(container, selectionText) {
        if (CTX_FLOAT.state.rewriteMenu) {
            CTX_FLOAT.state.rewriteMenu.remove();
            CTX_FLOAT.state.rewriteMenu = null;
        }
        const menu = document.createElement('div');
        menu.className = 'askgpt-rewrite-menu';
        Object.assign(menu.style, {
            position: 'absolute',
            top: '100%',
            left: '0',
            marginTop: '8px',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.15)',
            padding: '8px',
            zIndex: 2147483647,
            minWidth: '220px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
        });
        const options = (window.ASKGPT_REWRITE_OPTIONS || []).map(opt => ({
            label: opt.label,
            text: opt.text,
            icon: opt.icon
        }));
        options.forEach(opt => {
            const b = document.createElement('button');
            b.className = 'askgpt-rewrite-option';
            const iconSrc = opt.icon ? (chrome.runtime?.getURL?.(opt.icon) || opt.icon) : "";
            b.innerHTML = iconSrc
                ? `<img class="askgpt-fab-icon" src="${iconSrc}" alt=""><span>${opt.label}</span>`
                : `<span class="askgpt-fab-icon-text">?</span><span>${opt.label}</span>`;
            b.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: "askgpt_open_sidepanel" });
                chrome.runtime.sendMessage({
                    action: "askgpt_panel_handle",
                    selection: selectionText || "",
                    finalQuery: `${opt.text}

Context:
"${selectionText || ""}"`,
                    promptLabel: opt.label
                });
                removeFloatingButton();
            });
            menu.appendChild(b);
        });
        container.appendChild(menu);
        CTX_FLOAT.state.rewriteMenu = menu;
    }


    CTX_FLOAT.createFloatingButton = createFloatingButton;
    CTX_FLOAT.removeFloatingButton = removeFloatingButton;
    window.ASKGPT_CONTENT.__floatLoaded = true;
    window.ASKGPT_CONTENT.__floatWarned = true;

} // end guard

