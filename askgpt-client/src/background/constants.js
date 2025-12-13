// Shared constants and state for background service worker
// ============================================
// WORKER WINDOW/TAB STATE MANAGEMENT
// ============================================
// Tracks active windows and tabs for each worker
// This is the runtime state, distinct from worker configs

const MANAGERS = {
    // Main Worker - ChatGPT (Central Brain)
    chatgpt_web: {
        windowId: null,
        tabId: null,
        url: "https://chatgpt.com",
        matchUrl: "https://chatgpt.com/*",
        isMainWorker: true
    },
    // Specialist Worker - Gemini (Multimodal)
    gemini_web: {
        windowId: null,
        tabId: null,
        url: "https://gemini.google.com/app",
        matchUrl: "https://gemini.google.com/*",
        isMainWorker: false
    },
    // Specialist Worker - Perplexity (Real-time Search)
    perplexity_web: {
        windowId: null,
        tabId: null,
        url: "https://www.perplexity.ai",
        matchUrl: "https://www.perplexity.ai/*",
        isMainWorker: false
    },
    // Specialist Worker - Copilot (Microsoft 365)
    copilot_web: {
        windowId: null,
        tabId: null,
        url: "https://copilot.microsoft.com",
        matchUrl: "https://copilot.microsoft.com/*",
        isMainWorker: false
    },
    // Specialist Worker - Grok (Twitter/X)
    grok_web: {
        windowId: null,
        tabId: null,
        url: "https://grok.x.ai",
        matchUrl: "https://grok.x.ai/*",
        isMainWorker: false
    }
};

// Alias for backward compatibility (MANAGERS) and new terminology (WORKERS)
const WORKERS = MANAGERS;

// Track attached debuggers to avoid duplicate attaches
const activeDebuggers = new Set();

// Silent audio keeps tabs from idling
const SILENT_AUDIO_URL = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIwLjEwMAAAAAAAAAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA//oeEsAAAAAAAASwgAAAAAAA';

// Expose to other background modules
self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    MANAGERS,
    WORKERS,  // New terminology alias
    activeDebuggers,
    SILENT_AUDIO_URL
});
