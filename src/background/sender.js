// Send text to provider via debugger automation

async function sendTextViaDebugger(windowId, tabId, text, providerKey) {
    try {
        await chrome.windows.update(windowId, { focused: true });
        await self.ASKGPT_BG.injectKeepAliveAudio(tabId);
        await self.ASKGPT_BG.attachDebugger(tabId);

        await chrome.scripting.executeScript({
            target: { tabId },
            func: (pk) => {
                let el;
                if (pk === 'chatgpt_web') {
                    el = document.querySelector('#prompt-textarea');
                } else {
                    el = document.querySelector('div[contenteditable="true"]') ||
                        document.querySelector('rich-textarea div[contenteditable="true"]');
                }

                if (el) {
                    el.scrollIntoView({ block: "center" });
                    el.click();
                    el.innerHTML = pk === 'chatgpt_web' ? '<p><br></p>' : '';
                    el.focus();
                    const audio = document.getElementById('keep-alive-audio');
                    if (audio && audio.paused) audio.play().catch(() => { });
                }
            },
            args: [providerKey]
        });

        await new Promise(r => setTimeout(r, 300));

        await chrome.debugger.sendCommand({ tabId }, "Input.insertText", { text: text });
        await new Promise(r => setTimeout(r, 300));

        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
            type: 'keyDown', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, macCharCode: 13, text: "\r", unmodifiedText: "\r"
        });
        await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
            type: 'keyUp', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, macCharCode: 13
        });

        setTimeout(() => {
            chrome.scripting.executeScript({
                target: { tabId },
                func: (pk) => {
                    let btn;
                    if (pk === 'chatgpt_web') btn = document.querySelector('[data-testid="send-button"]');
                    else btn = document.querySelector('.send-button') || document.querySelector('button[aria-label*="Send"]');

                    if (btn && !btn.disabled) btn.click();
                },
                args: [providerKey]
            }).catch(() => { });
        }, 500);

        return { success: true };
    } catch (e) { return { error: e.message }; }
}

self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    sendTextViaDebugger
});
