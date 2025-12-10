# AskGPT - Multi-Provider AI Assistant Browser Extension

**A lightweight, powerful browser extension that brings AI assistance directly to your workflow.** Select text anywhere on the web and get instant help with writing, translation, summarization, image analysis, and more.

---

## 🎯 Overview

AskGPT is a modular browser extension that integrates ChatGPT, Google Gemini, Perplexity, Microsoft Copilot, and Grok directly into your browsing experience. Work with AI through a floating toolbar, side panel chat, or keyboard shortcuts—all without leaving the webpage.

**Version:** 3.0 | **Multi-Provider Support** (ChatGPT, Gemini, Perplexity, Copilot, Grok)

---

## ✨ Key Features

### 1. **Text Selection Toolbar**
- Select any text on a webpage → floating toolbar appears instantly
- One-click access to quick prompts: Explain, Rewrite, Translate, Summarize, etc.
- Drag-and-drop toolbar positioning
- Direct side panel integration for detailed responses

### 2. **Side Panel Chat Interface**
- Full-featured chat panel with real-time responses
- **Smart prompt picker**: Press `/` to search and select prompts by keyword
- **Keyboard navigation**: Arrow keys to browse, Enter to select
- **Clean composition**: Shift+Enter for newlines, Enter to send
- Active prompt display shows which AI behavior is active
- Markdown rendering for formatted responses

### 3. **Multi-Provider Support**
- **ChatGPT (Web)**: Automated browser control via debugger API
- **Google Gemini (Web)**: Full Gemini web interface integration
- **Google Gemini (API)**: Direct API mode for faster, private responses
- **Perplexity AI**: Real-time web search and reasoning
- **Microsoft Copilot**: Enterprise-grade AI assistance
- **Grok (X.AI)**: Advanced reasoning and analysis
- Easy provider switching in extension settings

### 4. **Google Lens Image Analysis**
- Capture screenshots and analyze with Google Lens
- Two modes:
  - **Similar**: Find visually similar images with source attribution
  - **Explain**: Get detailed descriptions based on visual matches
- Integrated directly into the side panel workflow

### 5. **Image Search**
- Find images directly within the extension
- Multiple sources: Pinterest (primary), Unsplash, Picsum (fallback)
- Duplicate prevention and smart caching
- 12-image grid display with click-to-open in new tab
- Source attribution and Pinterest search links

### 6. **Shared Prompt Registry**
- Unified prompt system used across all UI surfaces
- Easily extensible with custom prompts
- Each prompt includes: ID, label, description, icon, text, and target surfaces
- Includes: Explain, Rewrite, Translate (VN/EN), TL;DR, Action Plan, and more

### 7. **Keyboard Shortcuts**
- **Alt+S**: Summarize the current page
- **Alt+A**: Capture screenshot for AI analysis
- **/** (in side panel): Open prompt menu
- **Enter**: Send message (Shift+Enter for newline)
- **Arrow Keys**: Navigate prompts

---

## 📦 Installation

### Chrome / Chromium / Edge (Developer Mode)

1. Clone or download this repository
2. Open `chrome://extensions/` (or edge://extensions/)
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **"Load unpacked"**
5. Select the `askgpt-client` folder
6. Extension appears in your toolbar

### Firefox (Temporary Installation)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on"**
3. Select the `manifest.json` file in `askgpt-client`
4. Extension loads for the current session (reinstall after browser restart)

### Configuration

1. Click the extension icon → **Settings** (⚙️)
2. Select AI provider:
   - **ChatGPT Web**: Uses your logged-in ChatGPT account
   - **Gemini Web**: Uses your logged-in Google account
   - **Gemini API**: Enter your [Google Generative AI API key](https://aistudio.google.com/app/apikey)
   - **Perplexity / Copilot / Grok**: Uses your logged-in web account
3. Click **Save**

---

## 🚀 Usage Guide

### Basic Workflow

1. **Select text** on any webpage
2. **Floating toolbar appears** with quick action buttons
3. Choose a prompt or click **"Panel"** to open the side panel
4. View response in real-time with markdown formatting

### Side Panel Interface

- **Open**: Click extension icon or use floating toolbar
- **Search prompts**: Type `/` or click the prompt menu button
- **Filter prompts**: Start typing to search by name or description
- **Navigate**: Use arrow keys, press Enter to select
- **Compose**: Type your message or select a prompt
- **Send**: Press Enter (Shift+Enter adds line break)

### Advanced Features

#### Image Capture & Analysis
1. Press **Alt+A** or click toolbar → **Capture**
2. Select screen region
3. Google Lens analyzes the image automatically
4. Choose "Similar" (find matches) or "Explain" (analyze)
5. Results display in side panel with actionable insights

#### Page Summarization
1. Press **Alt+S** anywhere on a page
2. Extension extracts main content automatically
3. AI generates concise bullet-point summary
4. Appears in side panel for easy reading

#### Image Search
1. Type in side panel or select "Find Images" prompt
2. Enter search keyword
3. Results grid appears with 12 images
4. Click any image to open in new tab
5. "View on Pinterest" link for additional results

---

## 🏗️ Project Structure

```
askgpt-client/
├── manifest.json              # Extension configuration & permissions
├── background.js              # Service worker entry point
├── content.js                 # Content script entry point
├── popup.html/js              # Extension popup interface
├── options.html/js            # Settings page
├── sidepanel.html/css/js      # Side panel UI & logic
├── prompts.js                 # Shared prompt registry
├── content.css                # Content script styles
├── marked.min.js              # Markdown parser
│
├── src/background/            # Background service worker modules
│   ├── constants.js           # Shared constants & provider configs
│   ├── controller.js          # Main port controller & request router
│   ├── api.gemini.js          # Gemini API handler
│   ├── sender.js              # Text injection & debugger automation
│   ├── window-manager.js      # Browser window/tab management
│   ├── message-state.js       # Message counting & status checking
│   ├── polling.js             # Response polling logic
│   ├── debugger.js            # Chrome debugger utilities
│   ├── lens.js                # Google Lens integration
│   ├── sidepanel.js           # Side panel message handling
│   ├── window-bridge.js       # Window communication bridge
│   └── menus-shortcuts.js     # Context menu & keyboard commands
│
├── src/content/               # Content scripts (injected on all pages)
│   ├── state.js               # Shared content state
│   ├── extract.js             # Page content extraction
│   ├── layout.js              # Layout & spacing management
│   ├── modal.js               # Modal dialog creation
│   ├── chat-client.js         # Chat request handling
│   ├── floating-button.js     # Floating toolbar creation
│   ├── events.js              # DOM & runtime event listeners
│   ├── sidepanel-launcher.js  # Side panel trigger logic
│   ├── image-capture.js       # Screenshot capture utilities
│   ├── chatgpt-observer.js    # ChatGPT response observer
│   └── rewrite-plugin.js      # Text rewriting context menu
│
├── docs/                      # Additional documentation
├── icons/                     # Extension & prompt icons (SVG/PNG)
└── README.md                  # This file
```

---

## ⚙️ Architecture & Design

### Modular Design

The extension uses a **modular architecture** for maintainability and extensibility:

- **Entry Points**: `background.js` and `content.js` load all submodules via `importScripts()`
- **Namespace**: All modules attach to `self.ASKGPT_BG` (background) or `window.ASKGPT_CONTENT` (content)
- **No Global Conflicts**: Each module guards against double-loading with `__loaded` flags

### Data Flow

1. **User Action** (text selection/button click) → Content script detects
2. **Message to Background** → Port established for real-time communication
3. **Provider Selection** → Route to ChatGPT, Gemini, or API
4. **Response Handling** → Stream updates via port messages
5. **UI Update** → Side panel renders with markdown formatting

### Key Modules

| Module | Purpose | Type |
|--------|---------|------|
| `controller.js` | Routes requests to providers, validates config | Background |
| `api.gemini.js` | Handles Gemini API calls with error handling | Background |
| `sender.js` | Injects text into ChatGPT/Gemini via debugger | Background |
| `lens.js` | Captures & analyzes images with Google Lens | Background |
| `sidepanel.js` | Manages all side panel message routing & state | Background |
| `floating-button.js` | Creates & manages selection toolbar | Content |
| `events.js` | Wires up all event listeners | Content |
| `chatgpt-observer.js` | Observes ChatGPT response completion | Content |
| `sidepanel.html` | UI layout, styling, initialization | UI |

---

## 🔧 Development Guide

### Adding a New Prompt

1. Edit `prompts.js`:
```javascript
{
  id: "my-prompt",                                // Unique identifier
  label: "My Action",                             // Display name
  icon: "icons/prompt-myaction.svg",              // (optional) Icon file
  surfaces: ['toolbar', 'panel'],                 // Where it appears
  text: "Your prompt instruction text...",        // System message
  description: "Short description for search"     // Help text
}
```

2. Add icon file to `icons/` folder (SVG recommended)
3. Reload extension in `chrome://extensions/`

### Adding a New AI Provider

1. Create handler in `src/background/`:
   - Example: `api.myprovider.js`
   - Implement async handler function
   - Attach to `self.ASKGPT_BG`

2. Update `src/background/controller.js`:
   ```javascript
   if (provider === 'myprovider') {
       await self.ASKGPT_BG.handleMyProvider(port, query, config);
       return;
   }
   ```

3. Update `manifest.json`:
   - Add `host_permissions` for new domains
   - Add provider to `MANAGERS` in `src/background/constants.js`

4. Update `options.html` & `options.js`:
   - Add provider option to select dropdown
   - Update configuration UI as needed

### Extending Features

- **New keyboard shortcuts**: Edit `src/background/menus-shortcuts.js`
- **New context menu items**: Add to `menus-shortcuts.js`, update `manifest.json`
- **Image sources**: Modify `sidepanel.js` (`renderUnsplashResults()`) and `src/background/sidepanel.js` (proxy handlers)
- **CSS customization**: Edit `sidepanel.css` and `content.css`

---

## 🐛 Troubleshooting

### Floating Toolbar Not Appearing

**Problem**: Select text but toolbar doesn't show

- **Solution 1**: Reload extension (`chrome://extensions/` → reload button)
- **Solution 2**: Check console for errors (F12 → Console tab)
- **Solution 3**: Verify extension has permissions for current domain (check `manifest.json` `host_permissions`)

### Side Panel Won't Open

**Problem**: Panel icon clicked but nothing happens

- **Solution 1**: Ensure background service worker is active (refresh page)
- **Solution 2**: Check for errors in Service Worker console:
  - Chrome: `chrome://extensions/` → AskGPT → "Errors"
- **Solution 3**: Reload extension entirely

### "AI is Writing..." Stuck

**Problem**: Response never completes, stays in loading state

- **For ChatGPT Web**: 
  - Ensure you're logged into ChatGPT
  - Check ChatGPT tab in the popup window (may be behind main window)
  - Reload extension if browser debugger becomes disconnected
  
- **For Gemini Web**:
  - Verify you're logged into your Google account
  - Check Gemini tab is accessible
  
- **For Gemini API**:
  - Verify API key is valid in Settings
  - Check network connectivity
  - API may be rate-limited (wait a minute before retrying)

- **For Other Providers**:
  - Ensure you're logged into the respective service
  - Check provider website for service status

### Empty Image Results

**Problem**: Image search returns blank grid

- **Solution 1**: Wait 2-3 seconds (images load asynchronously)
- **Solution 2**: Try different search terms
- **Solution 3**: Verify Pinterest/Unsplash accessibility (may be blocked in your region)
- **Solution 4**: Check Network tab (F12) for CORS errors—may require VPN

### Configuration Won't Save

**Problem**: Settings reset after reload

- **Solution 1**: Ensure you clicked "Save" button
- **Solution 2**: Check for permission errors in console
- **Solution 3**: Clear extension storage and reconfigure:
  - `chrome://extensions/` → AskGPT → **Remove** → reinstall
  - Reconfigure in Settings

### Wrong Responses or Slow Performance

**Problem**: AI responses seem outdated or slow

- **For ChatGPT Web**: Responses reflect current ChatGPT knowledge
- **For Gemini Web**: Responses reflect current Gemini knowledge
- **For Gemini API**: Faster but uses API model (check [API limits](https://ai.google.dev/pricing))
- **For Perplexity**: Uses real-time web search
- **For Copilot/Grok**: Check respective service status
- **Solution**: Try different provider in Settings for comparison

---

## 🔐 Privacy & Security

- **No server-side data**: Extension operates entirely on your device
- **No tracking**: No analytics, telemetry, or third-party requests (except to AI providers)
- **Open source**: Full code visible, can be audited
- **Local storage**: Settings stored in Chrome's `chrome.storage.sync` (encrypted by browser)
- **API keys**: Only sent directly to provider APIs, never logged or stored on external servers

---

## 📝 Prompt Customization

Edit `prompts.js` to customize or add prompts:

```javascript
window.ASKGPT_PROMPTS = [
  {
    id: "explain",
    label: "Explain",
    icon: "icons/prompt-explain.svg",
    surfaces: ['toolbar', 'panel'],
    text: "You are a senior AI tutor. Explain the selection in concise bullet steps, then end with a 2-sentence takeaway.",
    description: "Explain in bullets and a short takeaway."
  },
  // Add more prompts here...
];
```

Each prompt appears in both the floating toolbar and side panel prompt menu.

---

## 🤝 Contributing

To improve AskGPT:

1. **Report bugs**: Check console errors (F12 → Console)
2. **Suggest features**: Add issues with clear use cases
3. **Improve docs**: Submit PRs for better explanations
4. **Add prompts**: Contribute useful prompt ideas to `prompts.js`

---

## 📄 License

This project is provided as-is for educational and personal use.

---

## 🎓 Credits

- **Google Lens**: For visual search & image analysis
- **Google Gemini**: For fast, modern AI responses
- **OpenAI ChatGPT**: For reliable, quality responses
- **Perplexity AI**: For real-time web search capabilities
- **Microsoft Copilot**: For enterprise AI assistance
- **Grok (X.AI)**: For advanced reasoning
- **Marked.js**: For markdown rendering
- Built with ❤️ for productivity-focused developers

---

## 📞 Support

- **Errors in console?** Check "Troubleshooting" section above
- **Feature requests?** Open an issue with details
- **Performance issues?** Check System Settings for extension storage
- **Questions?** Review Project Structure & Architecture sections for how things work

Enjoy faster, smarter browsing! 🚀
