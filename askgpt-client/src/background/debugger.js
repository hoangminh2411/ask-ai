// Debugger utilities (attach/detach, keep-alive audio)

async function injectKeepAliveAudio(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (src) => {
                if (document.getElementById('keep-alive-audio')) return;
                const audio = document.createElement('audio');
                audio.id = 'keep-alive-audio';
                audio.src = src;
                audio.loop = true;
                audio.volume = 0.01;
                document.body.appendChild(audio);
            },
            args: [self.ASKGPT_BG.SILENT_AUDIO_URL]
        });
    } catch (e) {}
}

async function attachDebugger(tabId) {
    if (self.ASKGPT_BG.activeDebuggers.has(tabId)) return;
    try {
        await chrome.debugger.attach({ tabId }, "1.3");
        self.ASKGPT_BG.activeDebuggers.add(tabId);
        await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    } catch (e) { }
}

async function detachDebugger(tabId) {
    if (!self.ASKGPT_BG.activeDebuggers.has(tabId)) return;
    try {
        await chrome.debugger.detach({ tabId });
        self.ASKGPT_BG.activeDebuggers.delete(tabId);
    } catch (e) { }
}

self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    injectKeepAliveAudio,
    attachDebugger,
    detachDebugger
});
