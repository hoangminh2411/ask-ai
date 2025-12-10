# AI Supporter - Kiến trúc Foundation v2.0

## 🎯 Tầm nhìn

**AI Supporter** là một **Context-Aware AI Assistant** giúp người dùng:
1. **Hiểu** nội dung trang web đang xem
2. **Tương tác** với AI để phân tích, dịch, tóm tắt
3. **Tự động hóa** các thao tác duyệt web
4. **Tìm kiếm trực quan** qua Google Lens integration

---

## 📁 Kiến trúc Thư mục

```
askgpt-client/
│
├── manifest.json                 # Extension config
├── background.js                 # Service Worker entry
│
├── src/
│   │
│   ├── core/                     # 🔧 CORE FRAMEWORK
│   │   ├── config.js             # Global configuration
│   │   ├── events.js             # Event bus for cross-module communication
│   │   ├── plugin-manager.js     # Plugin registry & lifecycle
│   │   ├── context-engine.js     # Page context extraction
│   │   ├── action-executor.js    # Execute automation actions
│   │   └── ai-router.js          # Route requests to AI providers
│   │
│   ├── providers/                # 🤖 AI PROVIDER ADAPTERS
│   │   ├── base-provider.js      # Abstract base class
│   │   ├── chatgpt.js            # ChatGPT Web automation
│   │   ├── gemini.js             # Gemini Web automation
│   │   ├── claude.js             # Claude Web (future)
│   │   ├── copilot.js            # Copilot Web (future)
│   │   └── perplexity.js         # Perplexity Web (future)
│   │
│   ├── features/                 # 🧩 FEATURE MODULES
│   │   ├── lens/                 # Google Lens Integration
│   │   │   ├── lens-capture.js   # Screenshot & crop UI
│   │   │   ├── lens-api.js       # Lens API interaction
│   │   │   ├── lens-results.js   # Results processing
│   │   │   └── lens-ui.css       # Lens-specific styles
│   │   │
│   │   ├── automation/           # Smart Automation
│   │   │   ├── action-parser.js  # Parse AI suggested actions
│   │   │   ├── action-runner.js  # Execute DOM actions
│   │   │   ├── navigation.js     # Auto navigation
│   │   │   └── search.js         # Auto search
│   │   │
│   │   └── summarize/            # Content Analysis
│   │       ├── extractor.js      # Smart content extraction
│   │       └── analyzer.js       # Content type detection
│   │
│   ├── background/               # 📡 BACKGROUND SCRIPTS
│   │   ├── controller.js         # Main request controller
│   │   ├── window-bridge.js      # Window communication
│   │   ├── window-manager.js     # Provider windows
│   │   └── message-hub.js        # Message routing
│   │
│   ├── content/                  # 📄 CONTENT SCRIPTS
│   │   ├── extract.js            # DOM extraction
│   │   ├── events.js             # Page event listeners
│   │   └── injector.js           # Script injection
│   │
│   └── ui/                       # 🎨 UI COMPONENTS
│       ├── sidepanel/
│       │   ├── index.html
│       │   ├── app.js            # Main app logic
│       │   ├── chat.js           # Chat interface
│       │   ├── model-selector.js # AI model picker
│       │   └── quick-actions.js  # Quick action cards
│       │
│       ├── components/           # Reusable UI components
│       │   ├── button.js
│       │   ├── card.js
│       │   ├── dropdown.js
│       │   └── modal.js
│       │
│       └── styles/
│           ├── theme.css         # Design tokens
│           ├── components.css    # Component styles
│           └── sidepanel.css     # Panel layout
│
├── assets/
│   ├── icons/                    # Icon assets
│   └── images/                   # UI images
│
└── config/
    ├── providers.json            # Provider configurations
    └── default-settings.json     # Default user settings
```

---

## 🔧 Core Modules

### 1. Config (`src/core/config.js`)

```javascript
// Centralized configuration
const CONFIG = {
  // AI Providers
  providers: {
    chatgpt: {
      id: 'chatgpt',
      name: 'ChatGPT',
      icon: '🤖',
      url: 'https://chatgpt.com/',
      color: '#10a37f',
      enabled: true
    },
    gemini: {
      id: 'gemini',
      name: 'Gemini',
      icon: '✨',
      url: 'https://gemini.google.com/',
      color: '#4285f4',
      enabled: true
    },
    claude: {
      id: 'claude',
      name: 'Claude',
      icon: '🧠',
      url: 'https://claude.ai/',
      color: '#cc785c',
      enabled: false // Future
    },
    copilot: {
      id: 'copilot',
      name: 'Copilot',
      icon: '🚀',
      url: 'https://copilot.microsoft.com/',
      color: '#0078d4',
      enabled: false
    },
    perplexity: {
      id: 'perplexity',
      name: 'Perplexity',
      icon: '🔍',
      url: 'https://www.perplexity.ai/',
      color: '#1fb8cd',
      enabled: false
    }
  },
  
  // Default settings
  defaults: {
    provider: 'chatgpt',
    theme: 'light',
    language: 'vi'
  },
  
  // Feature flags
  features: {
    lens: true,
    automation: true,
    multiProvider: true
  }
};
```

### 2. Event Bus (`src/core/events.js`)

```javascript
// Cross-module event communication
class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }
  
  off(event, callback) {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(callback);
      if (idx > -1) list.splice(idx, 1);
    }
  }
  
  emit(event, payload) {
    const list = this.listeners.get(event) || [];
    list.forEach(cb => cb(payload));
  }
}

// Events:
// - 'provider:changed' - User switched AI provider
// - 'context:updated' - Page context refreshed
// - 'response:received' - AI response received
// - 'action:execute' - Automation action triggered
// - 'lens:captured' - Image captured for Lens
// - 'lens:results' - Lens results received
```

### 3. AI Router (`src/core/ai-router.js`)

```javascript
// Route requests to appropriate AI provider
class AIRouter {
  constructor(config) {
    this.config = config;
    this.currentProvider = config.defaults.provider;
    this.providers = new Map();
  }
  
  setProvider(providerId) {
    if (this.config.providers[providerId]?.enabled) {
      this.currentProvider = providerId;
      return true;
    }
    return false;
  }
  
  getProvider() {
    return this.config.providers[this.currentProvider];
  }
  
  async send(prompt, options = {}) {
    const provider = options.provider || this.currentProvider;
    const adapter = this.providers.get(provider);
    
    if (!adapter) {
      throw new Error(`Provider not available: ${provider}`);
    }
    
    return adapter.send(prompt, options);
  }
  
  registerAdapter(providerId, adapter) {
    this.providers.set(providerId, adapter);
  }
}
```

---

## 🤖 Provider Adapters

### Base Provider Interface

```javascript
// src/providers/base-provider.js
class BaseProvider {
  constructor(config) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
  }
  
  // Must be implemented by subclasses
  async send(prompt, options) {
    throw new Error('Not implemented');
  }
  
  async waitForResponse() {
    throw new Error('Not implemented');
  }
  
  // DOM selectors for this provider
  get selectors() {
    throw new Error('Not implemented');
  }
  
  // Check if provider page is ready
  async isReady() {
    throw new Error('Not implemented');
  }
}
```

### ChatGPT Adapter Example

```javascript
// src/providers/chatgpt.js
class ChatGPTProvider extends BaseProvider {
  get selectors() {
    return {
      input: '#prompt-textarea',
      composerButton: '#composer-submit-button',
      response: '.markdown',
      conversationTurn: '[data-testid^="conversation-turn"]'
    };
  }
  
  isStreaming(doc) {
    const btn = doc.querySelector(this.selectors.composerButton);
    const label = btn?.getAttribute('aria-label') || '';
    return label.toLowerCase().includes('stop');
  }
  
  isReady(doc) {
    const btn = doc.querySelector(this.selectors.composerButton);
    const label = btn?.getAttribute('aria-label') || '';
    return label.toLowerCase().includes('send') && !btn.disabled;
  }
}
```

---

## 🔍 Google Lens Architecture

### Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         LENS FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User clicks Lens icon                                        │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────┐                                             │
│  │  Capture Mode   │  ← Full-screen overlay with crop UI        │
│  │  (lens-capture) │                                             │
│  └────────┬────────┘                                             │
│           │ User selects region                                  │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │  Process Image  │  ← Convert to base64, optimize              │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │  Google Lens    │  ← Open lens.google.com with image          │
│  │  (lens-api)     │                                             │
│  └────────┬────────┘                                             │
│           │ Extract results                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │ Process Results │  ← Parse similar images, text, products     │
│  │ (lens-results)  │                                             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │  Display in UI  │  ← Grid view, AI analysis option            │
│  │  or Send to AI  │                                             │
│  └─────────────────┘                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

```javascript
// src/features/lens/lens-capture.js
class LensCapture {
  constructor() {
    this.overlay = null;
    this.cropRegion = { x: 0, y: 0, width: 0, height: 0 };
  }
  
  async start() {
    // 1. Create full-screen overlay
    // 2. Show crop UI with Google Lens style
    // 3. Handle mouse/touch events for selection
    // 4. Capture selected region
  }
  
  async captureRegion(region) {
    // Use chrome.tabs.captureVisibleTab()
    // Crop to selected region
    // Return base64 image
  }
}

// src/features/lens/lens-api.js  
class LensAPI {
  async search(imageBase64) {
    // Open Google Lens with image
    // Wait for results
    // Extract structured data
  }
  
  parseResults(doc) {
    return {
      similarImages: [...],
      textContent: [...],
      products: [...],
      entities: [...]
    };
  }
}
```

---

## 🚀 Automation Architecture

### Smart Actions

```javascript
// src/features/automation/action-parser.js
class ActionParser {
  // Parse AI response for actionable items
  parse(response) {
    const actions = [];
    
    // Pattern: [Action Name (ID: 123)](#ask-action-123)
    const actionRegex = /\[([^\]]+)\]\(#ask-action-([a-zA-Z0-9_-]+)\)/g;
    let match;
    
    while ((match = actionRegex.exec(response)) !== null) {
      actions.push({
        label: match[1],
        id: match[2],
        type: this.detectActionType(match[1])
      });
    }
    
    return actions;
  }
  
  detectActionType(label) {
    const lower = label.toLowerCase();
    if (lower.includes('search') || lower.includes('tìm')) return 'search';
    if (lower.includes('click') || lower.includes('bấm')) return 'click';
    if (lower.includes('navigate') || lower.includes('đến')) return 'navigate';
    return 'click';
  }
}

// src/features/automation/action-runner.js
class ActionRunner {
  async execute(action) {
    switch (action.type) {
      case 'click':
        return this.click(action.id);
      case 'search':
        return this.search(action.query);
      case 'navigate':
        return this.navigate(action.url);
    }
  }
  
  async click(elementId) {
    // Find element by automation ID
    // Simulate click
  }
  
  async search(query) {
    // Detect search context (Google, site search, etc.)
    // Execute search
  }
  
  async navigate(url) {
    // Navigate to URL
    // Or construct URL from context
  }
}
```

### Smart Search Example

```javascript
// User: "Tìm giá cổ phiếu VNM"
// AI Response: "Tôi sẽ giúp bạn tìm giá cổ phiếu VNM"
// 
// System automatically:
// 1. Detect intent: stock_price
// 2. Construct URL: https://www.google.com/search?q=VNM+stock+price
// 3. Or navigate to: https://tradingview.com/symbols/HOSE-VNM/
```

---

## 🎨 UI Components

### Model Selector (in Chat Input)

```html
<!-- Instead of settings page, model selector in chat box -->
<div class="chat-input">
  <div class="model-selector">
    <button class="current-model">
      <span class="model-icon">🤖</span>
      <span class="model-name">ChatGPT</span>
      <span class="dropdown-arrow">▼</span>
    </button>
    <div class="model-dropdown">
      <div class="model-option active" data-provider="chatgpt">
        <span>🤖</span> ChatGPT
      </div>
      <div class="model-option" data-provider="gemini">
        <span>✨</span> Gemini
      </div>
      <div class="model-option disabled" data-provider="claude">
        <span>🧠</span> Claude (Coming Soon)
      </div>
    </div>
  </div>
  
  <textarea placeholder="Ask anything..."></textarea>
  
  <div class="input-actions">
    <button class="lens-btn" title="Visual Search">📷</button>
    <button class="send-btn">Send</button>
  </div>
</div>
```

---

## 📦 Module Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEPENDENCY GRAPH                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    ┌────────────────┐                            │
│                    │     CONFIG     │                            │
│                    └───────┬────────┘                            │
│                            │                                     │
│              ┌─────────────┼─────────────┐                       │
│              ▼             ▼             ▼                       │
│      ┌───────────┐  ┌───────────┐  ┌───────────┐                 │
│      │ EVENT BUS │  │ AI ROUTER │  │  PLUGINS  │                 │
│      └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                 │
│            │              │              │                       │
│            └──────────────┼──────────────┘                       │
│                           │                                      │
│              ┌────────────┴────────────┐                         │
│              ▼                         ▼                         │
│      ┌───────────────┐         ┌───────────────┐                 │
│      │   PROVIDERS   │         │   FEATURES    │                 │
│      │ ┌───────────┐ │         │ ┌───────────┐ │                 │
│      │ │  ChatGPT  │ │         │ │   Lens    │ │                 │
│      │ ├───────────┤ │         │ ├───────────┤ │                 │
│      │ │  Gemini   │ │         │ │ Automation│ │                 │
│      │ ├───────────┤ │         │ ├───────────┤ │                 │
│      │ │  Claude   │ │         │ │ Summarize │ │                 │
│      │ └───────────┘ │         │ └───────────┘ │                 │
│      └───────────────┘         └───────────────┘                 │
│                                                                  │
│                           │                                      │
│                           ▼                                      │
│                  ┌─────────────────┐                             │
│                  │       UI        │                             │
│                  │  ┌───────────┐  │                             │
│                  │  │ Sidepanel │  │                             │
│                  │  ├───────────┤  │                             │
│                  │  │  Toolbar  │  │                             │
│                  │  └───────────┘  │                             │
│                  └─────────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Implementation Phases

### Phase 1: Core Foundation ✅ (Current)
- [x] Plugin Manager
- [x] Basic Event Bus
- [ ] Config module
- [ ] AI Router base

### Phase 2: Provider Abstraction
- [ ] Base Provider class
- [ ] ChatGPT Provider
- [ ] Gemini Provider
- [ ] Model Selector UI

### Phase 3: Lens Enhancement
- [ ] Improved capture UI
- [ ] Results processing
- [ ] AI integration

### Phase 4: Smart Automation
- [ ] Action parser
- [ ] Action runner
- [ ] Auto navigation
- [ ] Smart search

---

## 📝 Next Steps

1. **Tạo Config module** - Centralized configuration
2. **Tạo AI Router** - Abstract provider routing
3. **Refactor Providers** - Use adapter pattern
4. **Model Selector UI** - In-chat model picker
5. **Lens improvements** - Better capture & results
