const statusEl = document.getElementById('sp-status');
const answerEl = document.getElementById('sp-answer');
const promptEl = document.getElementById('sp-prompt');
const sendBtn = document.getElementById('sp-send');
const promptRegistry = (window.ASKGPT_PROMPTS || []).slice();
const promptMenuBtn = document.getElementById('sp-toggle-prompts');
const promptMenu = document.getElementById('sp-quick-menu');
const promptWrapper = document.querySelector('.sp-quick-wrapper');
const promptFilter = document.getElementById('sp-prompt-filter');
const activePromptLabel = document.getElementById('sp-active-prompt');
let promptOptions = [];
let promptCursor = -1;

let currentSelection = "";
let activePrompt = "";
let activePromptId = "";
let port = null;
let initialized = false;
let typingEl = null;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle('error', !!isError);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appendUserMessage(text, promptLabel = "") {
  if (!text && !promptLabel) return;
  const msg = document.createElement('div');
  msg.className = 'sp-msg user';
  const parts = [];
  if (promptLabel) parts.push(`<div class="sp-user-label">${escapeHtml(promptLabel)}</div>`);
  parts.push(`<div class="sp-user-main">${escapeHtml(text)}</div>`);
  msg.innerHTML = `<div class="sp-bubble">${parts.join("")}</div>`;
  answerEl.appendChild(msg);
  scrollToBottom();
}

function appendBotMessage(html) {
  removeTyping();
  const msg = document.createElement('div');
  msg.className = 'sp-msg bot';
  if (typeof marked !== 'undefined') {
    msg.innerHTML = `<div class="sp-bubble">${marked.parse(html || "")}</div>`;
  } else {
    msg.innerHTML = `<div class="sp-bubble">${html || ""}</div>`;
  }
  answerEl.appendChild(msg);
  scrollToBottom();
}

function showTyping(text = "AI is thinking...") {
  removeTyping();
  const wrap = document.createElement('div');
  wrap.className = 'sp-msg bot';
  const bubble = document.createElement('div');
  bubble.className = 'sp-bubble';
  bubble.innerHTML = `<span class="sp-typing">${escapeHtml(text)}</span>`;
  wrap.appendChild(bubble);
  typingEl = wrap;
  answerEl.appendChild(wrap);
  scrollToBottom();
}

function removeTyping() {
  if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
  typingEl = null;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    answerEl.scrollTop = answerEl.scrollHeight;
  });
}

function refreshSelection() {
  setStatus("Getting selection...");
  chrome.runtime.sendMessage({ action: "askgpt_get_selection" }, (resp) => {
    currentSelection = resp?.text || "";
    if (currentSelection) {
      promptEl.value = currentSelection;
    }
    setStatus("");
  });
}

function ensurePort() {
  if (port) return port;
  port = chrome.runtime.connect({ name: "ask-gpt-port" });
  port.onDisconnect.addListener(() => {
    port = null;
    sendBtn.disabled = false;
    removeTyping();
  });
  port.onMessage.addListener(handlePortMessage);
  return port;
}

function sendFinalQuery(finalQuery, selectionText, promptLabel = "Prompt") {
  if (selectionText !== undefined) {
    currentSelection = selectionText;
    if (selectionText) promptEl.value = selectionText;
  }
  appendUserMessage(finalQuery, promptLabel);
  sendBtn.disabled = true;
  setStatus("");
  showTyping();
  ensurePort().postMessage({ query: finalQuery });
  promptEl.value = "";
}

function sendPrompt(prefix, label) {
  const userText = promptEl.value.trim();
  const selectedPrompt = promptRegistry.find(p => p.id === activePromptId) || promptRegistry.find(p => p.surfaces?.includes('panel'));
  activePrompt = prefix || selectedPrompt?.text || activePrompt || "";
  const promptLabel = label || selectedPrompt?.label || document.querySelector('.sp-chip.active')?.getAttribute('data-label') || (prefix ? "Prompt" : "User");
  updateActivePromptLabel(promptLabel);
  const combined = activePrompt
    ? `${activePrompt}\n\nContext:\n"${userText || currentSelection || ""}"`
    : (userText || currentSelection);

  if (!combined) {
    setStatus("Enter a prompt or use a quick action.", true);
    return;
  }
  if (selectedPrompt?.id === "image-search") {
    const term = userText || currentSelection;
    if (!term) {
      setStatus("Enter a keyword to search images on Unsplash.", true);
      return;
    }
    appendUserMessage(term, promptLabel);
    renderUnsplashResults(term);
    promptEl.value = "";
    return;
  }
  appendUserMessage(combined, promptLabel);
  sendBtn.disabled = true;
  setStatus("");
  showTyping();
  ensurePort().postMessage({ query: combined });
  promptEl.value = "";
}

document.getElementById('sp-open-settings').onclick = () => chrome.runtime.openOptionsPage();
document.getElementById('sp-refresh').onclick = refreshSelection;
function renderPromptChips(filterText = "") {
  const bar = promptMenu;
  if (!bar) return;
  bar.querySelectorAll('.sp-chip-card').forEach(el => el.remove());
  promptOptions = [];
  promptCursor = -1;
  const normalized = (filterText || "").toLowerCase();
  const items = promptRegistry
    .filter(p => p.surfaces?.includes('panel'))
    .filter(p => {
      if (!normalized) return true;
      const hay = `${p.label || ""} ${p.description || ""} ${p.text || ""}`.toLowerCase();
      return hay.includes(normalized);
    });
  items.forEach((p, idx) => {
    const chip = document.createElement('button');
    chip.className = 'sp-chip sp-chip-card';
    chip.setAttribute('data-prompt', p.text);
    chip.setAttribute('data-label', p.label);
    chip.setAttribute('data-id', p.id || "");
    chip.title = p.description || p.label;
    const iconSrc = p.icon ? (chrome.runtime?.getURL?.(p.icon) || p.icon) : "";
    const desc = p.description || p.text || "";
    const iconContent = iconSrc
      ? `<img src="${iconSrc}" alt="${escapeHtml(p.label)}">`
      : `<span class="sp-chip-initial">${escapeHtml((p.label || "AI").slice(0,3))}</span>`;
    chip.innerHTML = `
      <span class="sp-chip-icon${iconSrc ? "" : " fallback"}">${iconContent}</span>
      <span class="sp-chip-meta">
        <span class="sp-chip-title">${escapeHtml(p.label)}</span>
        <span class="sp-chip-desc">${escapeHtml(desc)}</span>
      </span>
    `;
    chip.onclick = () => {
      selectPrompt(p, chip);
    };
    if (idx === 0) {
      chip.classList.add('active');
      activePromptId = p.id || "";
      activePrompt = p.text;
      updateActivePromptLabel(p.label);
      promptCursor = 0;
    }
    promptOptions.push({ prompt: p, chip });
    bar.appendChild(chip);
  });
  if (promptOptions.length) {
    const currentIdx = promptOptions.findIndex(({ prompt }) => (prompt.id || "") === activePromptId);
    promptCursor = currentIdx >= 0 ? currentIdx : 0;
    promptOptions.forEach(({ chip }, idx) => chip.classList.toggle('active', idx === promptCursor));
    const currentPrompt = promptOptions[promptCursor].prompt;
    activePromptId = currentPrompt.id || activePromptId;
    activePrompt = currentPrompt.text || activePrompt;
    updateActivePromptLabel(currentPrompt.label);
  }
}
renderPromptChips();
if (promptFilter) {
  promptFilter.addEventListener('input', () => renderPromptChips(promptFilter.value));
}

sendBtn.onclick = () => sendPrompt();

function handlePortMessage(msg) {
  if (msg.status === 'progress') {
    showTyping(msg.message || "AI is thinking...");
  } else if (msg.status === 'success') {
    setStatus("");
    appendBotMessage(msg.answer);
    sendBtn.disabled = false;
  } else if (msg.status === 'error') {
    removeTyping();
    appendBotMessage("Error: " + (msg.error || "Unexpected issue."));
    sendBtn.disabled = false;
  }
}
ensurePort();

// Initial selection fetch
function initPanelState() {
  if (initialized) return;
  initialized = true;
  chrome.runtime.sendMessage({ action: "askgpt_panel_request_state" }, (resp) => {
    const state = resp?.state;
    if (state) {
      currentSelection = state.selection || "";
      activePrompt = state.prompt || "";
      if (state.promptLabel) updateActivePromptLabel(state.promptLabel);
      if (state.finalQuery) {
        sendFinalQuery(state.finalQuery, currentSelection);
      } else {
        promptEl.value = state.prompt || state.selection || "";
      }
    } else {
      refreshSelection();
    }
  });
}
initPanelState();

// Accept messages from content/background to set context or send a prompt
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action === "askgpt_panel_set_context") {
    currentSelection = msg.selection || "";
    if (msg.prompt) activePrompt = msg.prompt;
    promptEl.value = msg.prompt || currentSelection || "";
    if (msg.promptLabel) updateActivePromptLabel(msg.promptLabel);
  } else if (msg?.action === "askgpt_panel_handle") {
    const selectionText = msg.selection || "";
    activePromptId = "";
    activePrompt = msg.prompt || "";
    if (selectionText) {
      currentSelection = selectionText;
      promptEl.value = selectionText;
    }
    if (msg.finalQuery) {
      sendFinalQuery(msg.finalQuery, selectionText, msg.promptLabel);
    }
    if (msg.promptLabel) updateActivePromptLabel(msg.promptLabel);
  }
});

function openPromptMenu() {
  if (!promptWrapper) return;
  promptWrapper.classList.add('open');
  setTimeout(() => promptFilter?.focus(), 0);
}
function closePromptMenu() {
  if (!promptWrapper) return;
  promptWrapper.classList.remove('open');
}

promptMenuBtn?.addEventListener('click', () => {
  if (promptWrapper?.classList.contains('open')) {
    closePromptMenu();
  } else {
    openPromptMenu();
  }
});

document.addEventListener('click', (e) => {
  if (promptWrapper?.classList.contains('open') && !e.target.closest('.sp-quick-wrapper')) {
    closePromptMenu();
  }
});

promptEl.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    openPromptMenu();
    setTimeout(() => promptFilter?.focus(), 0);
  }
});

promptFilter?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    movePromptCursor(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    movePromptCursor(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    activateCursorSelection();
  }
});

function movePromptCursor(delta) {
  if (!promptOptions.length) return;
  promptCursor = (promptCursor + delta + promptOptions.length) % promptOptions.length;
  promptOptions.forEach(({ chip }, idx) => {
    chip.classList.toggle('active', idx === promptCursor);
  });
  const current = promptOptions[promptCursor];
  if (current) {
    activePromptId = current.prompt.id || "";
    activePrompt = current.prompt.text;
    updateActivePromptLabel(current.prompt.label);
  }
}

function activateCursorSelection() {
  if (promptCursor < 0 && promptOptions.length) promptCursor = 0;
  if (promptCursor < 0 || promptCursor >= promptOptions.length) return;
  const { prompt, chip } = promptOptions[promptCursor];
  selectPrompt(prompt, chip);
}

function selectPrompt(p, chip) {
  promptOptions.forEach(({ chip: c }) => c.classList.remove('active'));
  chip.classList.add('active');
  activePromptId = p.id || "";
  activePrompt = p.text;
  updateActivePromptLabel(p.label);
  promptCursor = promptOptions.findIndex(({ prompt }) => (prompt.id || "") === activePromptId);
  closePromptMenu();
  promptEl.focus();
}

async function renderUnsplashResults(term) {
  const safeTerm = escapeHtml(term);
  const count = 12;
  const gallery = document.createElement('div');
  gallery.className = 'sp-msg bot';
  const bubble = document.createElement('div');
  bubble.className = 'sp-bubble';
  const pinterestSearch = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(term)}`;
  bubble.innerHTML = `<div><strong>Image results for:</strong> ${safeTerm} · <a href="${pinterestSearch}" target="_blank" rel="noreferrer noopener">Pinterest</a></div>`;
  const grid = document.createElement('div');
  grid.className = 'sp-image-grid';
  const pinterestUrls = await fetchPinterestImages(term);
  const uniquePins = Array.from(new Set(pinterestUrls || []));
  const baseSources = Array.from(new Set([
    ...uniquePins,
    `https://loremflickr.com/640/480/${encodeURIComponent(term)}/all`,
    `https://source.unsplash.com/featured/400x300/?${encodeURIComponent(term)}&sig=${Date.now()}`,
    `https://picsum.photos/seed/${encodeURIComponent(term)}-a/400/300`,
    `https://picsum.photos/seed/${encodeURIComponent(term)}-b/400/300`
  ]));
  const slots = Math.min(count, baseSources.length);
  for (let i = 0; i < slots; i++) {
    const card = document.createElement('div');
    card.className = 'sp-image-card';
    const img = document.createElement('img');
    img.alt = term;
    img.loading = "lazy";
    img.decoding = "async";

    // Multi-source fallback proxied via background; rotate starting source per slot to reduce duplicates
    const rotated = [...baseSources.slice(i), ...baseSources.slice(0, i)];
    const sources = rotated;
    const anchor = document.createElement('a');
    anchor.className = 'sp-image-anchor';
    anchor.target = "_blank";
    anchor.rel = "noreferrer noopener";

    const loadViaProxy = (idx = 0) => {
      if (idx >= sources.length) {
        img.alt = "Image unavailable";
        return;
      }
      proxyFetchImage(sources[idx])
        .then((dataUrl) => {
          if (dataUrl) {
            img.src = dataUrl;
            img.setAttribute('data-current-src', sources[idx]);
            anchor.href = sources[idx];
          } else {
            loadViaProxy(idx + 1);
          }
        })
        .catch(() => loadViaProxy(idx + 1));
    };
    loadViaProxy();

    anchor.appendChild(img);
    card.appendChild(anchor);
    grid.appendChild(card);
  }
  bubble.appendChild(grid);
  gallery.appendChild(bubble);
  removeTyping();
  answerEl.appendChild(gallery);
  scrollToBottom();
}

function proxyFetchImage(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "askgpt_proxy_image", url }, (resp) => {
      if (resp?.dataUrl) resolve(resp.dataUrl);
      else resolve(null);
    });
  });
}

function fetchPinterestImages(term) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "askgpt_pinterest_fetch", query: term }, (resp) => {
      if (resp?.urls?.length) resolve(resp.urls);
      else resolve([]);
    });
  });
}

// Enter to send, Shift+Enter to newline
promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendPrompt();
  }
});

function updateActivePromptLabel(label) {
  if (!activePromptLabel) return;
  activePromptLabel.textContent = label ? `Prompt: ${label}` : "Prompt: Free";
}
