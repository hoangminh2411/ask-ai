// Background service worker entry: load modular files
importScripts(
  'src/background/constants.js',
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
