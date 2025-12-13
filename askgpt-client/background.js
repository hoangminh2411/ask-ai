// Background service worker entry: load modular files
importScripts(
  'src/background/constants.js',
  'src/background/worker-configs.js',   // Worker definitions & capabilities
  'src/background/worker-manager.js',   // Worker state & status management
  'src/background/worker-orchestrator.js', // Worker collaboration & delegation
  'src/background/worker-status-checker.js', // Real-time status monitoring
  'src/background/element-detector.js', // Self-learning UI element detection
  'src/background/debugger.js',
  'src/background/window-manager.js',
  'src/background/window-bridge.js',
  'src/background/message-state.js',
  'src/background/sender.js',
  'src/background/polling.js',
  'src/background/api.gemini.js',
  'src/background/controller.js',
  'src/background/menus-shortcuts.js',
  'src/background/lens.js',
  'src/background/sidepanel.js'
);
