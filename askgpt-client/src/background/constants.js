// Shared constants and state for background service worker
const MANAGERS = {
    chatgpt_web: {
        windowId: null,
        tabId: null,
        url: "https://chatgpt.com",
        matchUrl: "https://chatgpt.com/*"
    },
    gemini_web: {
        windowId: null,
        tabId: null,
        url: "https://gemini.google.com/app",
        matchUrl: "https://gemini.google.com/*"
    }
};

// Track attached debuggers to avoid duplicate attaches
const activeDebuggers = new Set();

// Silent audio keeps tabs from idling
const SILENT_AUDIO_URL = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIwLjEwMAAAAAAAAAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA';

// Expose to other background modules
self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    MANAGERS,
    activeDebuggers,
    SILENT_AUDIO_URL
});
