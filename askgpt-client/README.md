# AskGPT Browser Extension

Lightweight assistant extension with floating selection toolbox, sidepanel chat, quick prompts (translate, summarize, polish, find images, etc.).

## Key Features
- Floating toolbox on text selection with quick prompts and sidepanel launcher.
- Sidepanel chat with prompt picker, slash search, Enter-to-send, Shift+Enter newline.
- Shared prompt registry (`prompts.js`) for toolbar and panel.
- Image search prompt (Pinterest/Unsplash/loremflickr/Picsum via background proxy) with 3-column thumbnails.
- Modular background (`src/background/*`) for window control, polling, API/Gemini routing, Pinterest scraping; content modules (`src/content/*`) for modal, layout, floating button, events.

## Install (dev)
Chrome/Chromium:
1) Open `chrome://extensions/`, enable Developer mode.
2) Load unpacked ? select `askgpt-client` (folder with `manifest.json`).

Firefox (temporary):
1) `about:debugging#/runtime/this-firefox` ? Load Temporary Add-on? ? pick `manifest.json`.

## Usage
- Select text ? floating toolbox ? choose prompt or open sidepanel.
- In sidepanel: press `/` to open prompt menu, arrow keys to navigate, Enter to select; Enter sends, Shift+Enter newline.
- ?Find Images? prompt returns a thumbnail grid; click to open the image in a new tab.

## Project Structure
- `manifest.json` ? permissions & host access (ChatGPT, Gemini, Pinterest, Unsplash, etc.).
- `background.js` ? `src/background/` modules (`controller`, `polling`, `sender`, `sidepanel`, `api.gemini`, etc.).
- `content.js` ? `src/content/` modules (`floating-button`, `modal`, `events`, `chat-client`, etc.).
- UI assets: `content.css`, `sidepanel.html/css/js`, `popup.html/js`, `icons/*.svg`.
- Prompt registry: `prompts.js`; Markdown renderer: `marked.min.js`.

## Dev Notes
- Edit logic in `src/`; entry files remain manifest targets.
- Update `prompts.js` and `icons/` when adding prompts/icons.
- If adding new host sources (e.g., images), update `manifest.json` and proxy handling in `src/background/sidepanel.js`.

## Troubleshooting
- Toolbox/sidepanel not opening: reload extension, check console and permissions.
- Stuck ?AI is writing??: ensure background service worker is active; reload extension/page.
- Empty images: sources may throttle; verify host permissions and reload.
