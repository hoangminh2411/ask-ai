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
    },
    perplexity_web: {
        windowId: null,
        tabId: null,
        url: "https://www.perplexity.ai",
        matchUrl: "https://www.perplexity.ai/*"
    },
    copilot_web: {
        windowId: null,
        tabId: null,
        url: "https://copilot.microsoft.com",
        matchUrl: "https://copilot.microsoft.com/*"
    },
    grok_web: {
        windowId: null,
        tabId: null,
        url: "https://grok.x.ai",
        matchUrl: "https://grok.x.ai/*"
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
