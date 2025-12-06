# Browser Extension

Short README for this browser extension project.  
Recent change: code was split into smaller modules under `src/` for maintainability; manifest still loads the same entry files (`background.js`, `content.js`) which import/chain-load these modules.

## Overview

This repository contains a small browser extension that injects a content script into web pages, provides a popup UI and an options page, and includes a bundled Markdown renderer (`marked.min.js`).

## Features

- Injects content script (`content.js`) with styling (`content.css`)
- Background logic in `background.js` (imports modular files in `src/background/`)
- Popup UI (`popup.html`, `popup.js`)
- Options/settings page (`options.html`, `options.js`)
- Markdown rendering via `marked.min.js`

## Install (development / local)

Chrome / Chromium:  
1. Open `chrome://extensions/`.  
2. Enable "Developer mode".  
3. Click "Load unpacked" and select this project folder (the folder that contains `manifest.json`).

Firefox (temporary install):  
1. Open `about:debugging#/runtime/this-firefox`.  
2. Click "Load Temporary Add-on..." and choose the `manifest.json` file from this project folder.

## Usage

- Click the extension toolbar icon to open the popup (`popup.html`).  
- Open the options page to configure settings (`options.html`).  
- Visit pages matching the `manifest.json` `content_scripts` `matches` patterns to see the content script run.

## Project structure

- `manifest.json` — Extension manifest and permission settings  
- `background.js` — Entry for service worker; loads modules in `src/background/`  
- `src/background/` — Split modules: `constants`, `debugger`, `window-manager`, `message-state`, `sender`, `polling`, `api.gemini`, `controller`, `menus-shortcuts`  
- `content.js` — Entry for injected content script; loaded after modules below  
- `src/content/` — Split modules: `state`, `extract`, `layout`, `modal`, `chat-client`, `floating-button`, `events`  
- `content.css` — Styling for injected UI  
- `popup.html`, `popup.js` — Popup UI and logic  
- `options.html`, `options.js` — Options/settings UI and logic  
- `marked.min.js` — Bundled Markdown renderer  

## Development notes

- Edit modules in `src/` for logic; entries `background.js` and `content.js` remain the manifest targets.  
- If adding libraries or changing permissions/host matches, update `manifest.json` accordingly.  
- Use browser extension devtools and console logs for debugging.

## Troubleshooting

- Extension won't load: confirm you selected the correct folder and `manifest.json` is present.  
- Content scripts not running: check `manifest.json` `matches` and permissions.  
- See the browser console and background page console for errors.

## License

Default: MIT — change as needed.
