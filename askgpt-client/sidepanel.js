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
let lastLensResults = null;
let lastLensSignature = "";
let lastLensPromptedSignature = "";

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


// Hàm Render và Gắn sự kiện trực tiếp
function appendBotMessage(text) {
  removeTyping();

  try {
    const msg = document.createElement('div');
    msg.className = 'sp-msg bot';

    const bubble = document.createElement('div');
    bubble.className = 'sp-bubble';
    bubble.style.position = 'relative'; // Support absolute icon

    // 1. Render HTML cơ bản
    let finalHtml = text || "";
    if (typeof marked !== 'undefined' && !finalHtml.trim().startsWith('<')) {
      finalHtml = marked.parse(finalHtml);
    }
    bubble.innerHTML = finalHtml;

    // TTS Feature (Read Aloud)
    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'sp-tts-btn';
    ttsBtn.innerHTML = '🔊';
    ttsBtn.title = "Đọc nội dung";
    ttsBtn.style.cssText = `
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #ddd;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #555;
        font-size: 16px;
        opacity: 0.7;
        z-index: 10;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    ttsBtn.onmouseover = () => ttsBtn.style.opacity = '1';
    ttsBtn.onmouseout = () => ttsBtn.style.opacity = '0.6';

    let isSpeaking = false;
    ttsBtn.onclick = () => {
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        ttsBtn.innerHTML = '🔊';
        isSpeaking = false;
      } else {
        window.speechSynthesis.cancel();
        // Lấy text thuần, loại bỏ các ký tự thừa
        const rawText = bubble.innerText.replace(/🔊|⏹️/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(rawText);
        // Auto-detect lang based on text? Default to VN/EN mix
        // utterance.lang = 'vi-VN'; 
        utterance.rate = 1.1; // Hơi nhanh một chút cho tự nhiên

        utterance.onend = () => {
          isSpeaking = false;
          ttsBtn.innerHTML = '🔊';
        };

        window.speechSynthesis.speak(utterance);
        ttsBtn.innerHTML = '⏹️';
        isSpeaking = true;
      }
    };
    bubble.appendChild(ttsBtn);

    // 2. Tìm thẻ <a> và biến thành <button>
    const links = bubble.querySelectorAll('a');

    links.forEach(link => {
      const content = link.textContent.trim();
      const href = link.getAttribute('href') || "";

      // 1. Try to find ID in text: "Mua ngay (ID: 15)" or "View (ID: view_images)"
      let match = content.match(/ID\s*[:]\s*([a-zA-Z0-9_-]+)/i);

      // 2. If not found in text, try href: "#ask-action-15"
      if (!match) {
        match = href.match(/#ask-action-([a-zA-Z0-9_-]+)/i);
      }

      if (match) {
        const id = match[1];

        // Tạo nút Action
        const btn = document.createElement('button');
        btn.textContent = content;

        // Minimal Green Style
        btn.style.cssText = `
                background: #e6f4ea; 
                color: #137333; 
                border: 1px solid #ceead6; 
                border-radius: 16px;
                padding: 4px 12px; 
                margin: 2px 4px; 
                cursor: pointer; 
                font-weight: 500;
                font-size: 0.9em;
                transition: all 0.2s;
                display: inline-block;
            `;

        btn.onmouseover = () => { btn.style.background = "#ceead6"; };
        btn.onmouseout = () => { btn.style.background = "#e6f4ea"; };

        btn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();

          // SPECIAL ACTIONS
          if (id === 'view_images') {
            this.textContent = "⏳ Scanning images...";
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "askgpt_get_images" }, (resp) => {
                  if (resp && resp.images) {
                    renderLensResults({ mode: 'similar', images: resp.images }); // Reuse UI
                    btn.textContent = "✅ Images Loaded";
                  } else {
                    btn.textContent = "⚠️ No images found";
                  }
                  setTimeout(() => btn.textContent = content, 2000);
                });
              }
            });
            return;
          }

          // DEFAULT: CLICK DOM ELEMENT (NUMERIC ID)
          const originalText = this.textContent;
          this.style.backgroundColor = "#fff8e1";
          this.style.color = "#f9ab00";
          this.textContent = "⏳ Đang xử lý...";

          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "CLICK_ELEMENT",
                targetId: id
              }, (response) => {
                if (chrome.runtime.lastError) {
                  this.textContent = "❌ Lỗi";
                } else {
                  if (response?.ok) {
                    this.textContent = "✅ Đã click";
                    this.style.backgroundColor = "#e6f4ea";
                    this.style.color = "#137333";
                    setTimeout(() => {
                      this.textContent = originalText;
                    }, 2000);
                  } else {
                    this.textContent = "⚠️ Không tìm thấy";
                  }
                }
              });
            }
          });
        };

        link.replaceWith(btn);
      }
    });

    // 3. Tìm các câu hỏi gợi ý (Discovery Questions) và biến thành nút bấm
    const listItems = bubble.querySelectorAll('li');
    listItems.forEach(li => {
      const text = li.textContent.trim();
      // Check if it looks like a question from our prompt (starts with quote)
      if ((text.startsWith('"') || text.startsWith('“')) && text.length > 10) {
        const cleanText = text.replace(/['"“”]/g, '').trim();

        const btn = document.createElement('button');
        btn.textContent = "❓ " + cleanText;
        btn.style.cssText = `
                display: block;
                width: 100%;
                text-align: left;
                background: #f0f4ff;
                color: #1a73e8;
                border: 1px solid #d2e3fc;
                border-radius: 8px;
                padding: 8px 12px;
                margin: 4px 0;
                cursor: pointer;
                font-size: 0.9em;
                transition: all 0.2s;
            `;
        btn.onmouseover = () => { btn.style.background = "#d2e3fc"; };
        btn.onmouseout = () => { btn.style.background = "#f0f4ff"; };

        btn.onclick = () => {
          // Tự động gửi câu hỏi
          promptEl.value = cleanText;
          // Gọi sendPrompt với tham số label là 'Discovery'
          // Tuy nhiên sendPrompt cần userText từ promptEl hoặc selection
          // Logic sendPrompt: const userText = promptEl.value.trim();
          // Nên ta set value xong gọi sendPrompt() là được.
          sendPrompt(null, "Discovery");
        };

        li.replaceWith(btn);
      }
    });

    msg.appendChild(bubble);
    answerEl.appendChild(msg);
    scrollToBottom();

  } catch (err) {
    console.error("Critical Error in Render:", err);
  }
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

  // CACHING LOGIC (Only for 'summary' prompt)
  if (activePromptId === 'summary') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.url) return proceedList();
      const cacheKey = "askgpt_summary_" + tabs[0].url;

      chrome.storage.local.get([cacheKey], (result) => {
        if (result[cacheKey]) {
          // Cache Hit

          // Clear welcome if any
          if (document.querySelector('.sp-welcome')) answerEl.innerHTML = "";

          // Show User Message
          // UX Improvement: Ẩn context dài hoặc dùng thông báo ngắn gọn
          let displayMsg = combined;
          if (activePromptId === 'analyze-dom') {
            displayMsg = "📄 Analysis Request: Scanning page content properities & structure...";
          } else if (activePromptId === 'summary') {
            displayMsg = "📝 Requesting Page Summary...";
          } else if (combined.length > 500) {
            displayMsg = combined.slice(0, 300) + "...\n(Full context sent to AI)";
          }
          appendUserMessage(displayMsg, promptLabel);

          // Show Bot Message from Cache
          setTimeout(() => {
            appendBotMessage(result[cacheKey] + "\n\n*(Đã tải từ bộ nhớ đệm)*");
            setStatus("");
          }, 500);

          return; // SKIP API CALL
        } else {
          proceedList(); // Cache Miss
        }
      });
    });
    return;
  }

  proceedList();

  function proceedList() {
    // START: Original Send Logic
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

    // Clear welcome screen if present (Logic chung)
    if (document.querySelector('.sp-welcome')) {
      answerEl.innerHTML = "";
    }

    // UX Improvement: Ẩn context dài hoặc dùng thông báo ngắn gọn
    let displayMsg = combined;

    if (activePromptId === 'analyze-dom') {
      displayMsg = "📄 Analysis Request: Scanning page content properities & structure...";
    } else if (activePromptId === 'summary') {
      displayMsg = "📝 Requesting Page Summary...";
    } else if (combined.length > 500) {
      // Truncate long contexts visually
      displayMsg = combined.slice(0, 300) + "...\n(Full context sent to AI)";
    }

    appendUserMessage(displayMsg, promptLabel);
    sendBtn.disabled = true;
    setStatus("");
    showTyping();
    ensurePort().postMessage({ query: combined });
    promptEl.value = "";
    // END: Original Send Logic
  }
}

function renderWelcomeScreen() {
  answerEl.innerHTML = "";

  const container = document.createElement('div');
  container.className = 'sp-welcome';
  container.style.cssText = "text-align: center; padding: 20px; color: #555;";

  const icon = document.createElement('div');
  icon.innerHTML = '<span style="font-size: 40px;">👋</span>';

  const title = document.createElement('h3');
  title.textContent = "How can I help you regarding this page?";
  title.style.margin = "10px 0 20px 0";

  const grid = document.createElement('div');
  grid.style.cssText = "display: flex; flex-direction: column; gap: 10px;";

  const actions = [
    { label: "📝 Summarize Page", id: "summary", icon: "📄" },
    { label: "🔍 Analyze & Control", id: "analyze-dom", icon: "🕹️" },
    { label: "❓ Q&A about Content", id: "qa", icon: "💬" }
  ];

  actions.forEach(act => {
    const btn = document.createElement('button');
    btn.className = 'sp-welcome-btn';
    btn.innerHTML = `${act.icon} <b>${act.label}</b>`;
    btn.style.cssText = `
            display: flex; align-items: center; gap: 10px;
            padding: 12px 16px;
            background: white; border: 1px solid #ddd;
            border-radius: 8px; cursor: pointer;
            font-size: 14px; text-align: left;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            transition: all 0.2s;
            width: 100%;
        `;
    btn.onmouseover = () => { btn.style.background = "#f5f5f5"; btn.style.transform = "translateY(-1px)"; };
    btn.onmouseout = () => { btn.style.background = "white"; btn.style.transform = "none"; };

    btn.onclick = () => {
      // Trigger prompt
      const p = promptRegistry.find(x => x.id === act.id);
      if (p) {
        activePromptId = p.id;
        activePrompt = p.text;

        // Các prompt này cần Context toàn trang (Fetch từ extract.js)
        const needsFullContext = ['analyze-dom', 'summary', 'qa'].includes(act.id);

        if (needsFullContext) {
          setStatus("Fetching page content...");

          // 1. Thử lấy từ Background (nếu đã lưu)
          chrome.runtime.sendMessage({ action: "askgpt_get_selection" }, (resp) => {
            let ctx = resp?.text || "";

            // 2. Nếu Background rỗng -> Gọi trực tiếp Content Script để lấy lại
            if (!ctx || ctx.length < 50) {
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                  chrome.tabs.sendMessage(tabs[0].id, { action: "askgpt_get_runtime_selection" }, (r) => {
                    ctx = r?.selection || "";

                    // Retry send
                    currentSelection = ctx;
                    updateActivePromptLabel(p.label);
                    if (document.querySelector('.sp-welcome')) answerEl.innerHTML = "";
                    sendPrompt();
                  });
                }
              });
            } else {
              currentSelection = ctx;
              updateActivePromptLabel(p.label);
              if (document.querySelector('.sp-welcome')) answerEl.innerHTML = "";
              sendPrompt();
            }
          });
        } else {
          // Các prompt thường (ví dụ Translate Selection)
          currentSelection = promptEl.value || "";
          updateActivePromptLabel(p.label);
          sendPrompt();
        }
      }
    };
    grid.appendChild(btn);
  });

  container.appendChild(icon);
  container.appendChild(title);
  container.appendChild(grid);
  answerEl.appendChild(container);
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
      : `<span class="sp-chip-initial">${escapeHtml((p.label || "AI").slice(0, 3))}</span>`;
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

    // CACHING SAVE (Only for summary)
    if (activePromptId === 'summary' && msg.answer && msg.answer.length > 50) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]?.url) return;
        const cacheKey = "askgpt_summary_" + tabs[0].url;
        const payload = {};
        payload[cacheKey] = msg.answer;
        chrome.storage.local.set(payload);
      });
    }

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
      if (state.lensResults) {
        renderLensResults(state.lensResults);
      }
      if (state.finalQuery) {
        const finalQuery = deriveLensFinalQuery(state.promptLabel, state.finalQuery);
        sendFinalQuery(finalQuery, currentSelection, state.promptLabel);
      } else {
        promptEl.value = state.prompt || state.selection || "";
      }
    } else {
      refreshSelection();
    }
  });
}

// Override refreshSelection to show welcome if empty
const originalRefresh = refreshSelection;
refreshSelection = function () {
  setStatus("Getting selection...");
  chrome.runtime.sendMessage({ action: "askgpt_get_selection" }, (resp) => {
    currentSelection = resp?.text || "";
    if (currentSelection) {
      promptEl.value = currentSelection;
      setStatus("");
    } else {
      // If nothing selected, show welcome screen
      setStatus("");
      if (answerEl.innerHTML.trim() === "") renderWelcomeScreen();
    }
  });
};
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
    const finalQuery = deriveLensFinalQuery(msg.promptLabel, msg.finalQuery || "");
    if (finalQuery) {
      sendFinalQuery(finalQuery, selectionText, msg.promptLabel);
    }
    if (msg.promptLabel) updateActivePromptLabel(msg.promptLabel);
  } else if (msg?.action === "askgpt_panel_lens_results") {
    if (msg.payload) renderLensResults(msg.payload);
  } else if (msg?.action === "askgpt_panel_lens_progress") {
    showTyping(msg.message || "Processing image...");
  } else if (msg?.action === "askgpt_panel_lens_done") {
    removeTyping();
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
  const count = 12; // Số lượng ảnh muốn hiển thị

  const gallery = document.createElement('div');
  gallery.className = 'sp-msg bot';

  const bubble = document.createElement('div');
  bubble.className = 'sp-bubble';

  const pinterestSearch = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(term)}`;
  bubble.innerHTML = `<div><strong>Image results for:</strong> ${safeTerm} · <a href="${pinterestSearch}" target="_blank" rel="noreferrer noopener">Pinterest</a></div>`;

  const grid = document.createElement('div');
  grid.className = 'sp-image-grid';

  // 1. Lấy dữ liệu thô
  const rawPinterestUrls = await fetchPinterestImages(term);

  // 2. TẠO BỘ LỌC ID ĐỂ TRÁNH TRÙNG (Quan trọng)
  const usedIds = new Set();
  const validPinterestUrls = [];

  (rawPinterestUrls || []).forEach(url => {
    // Bỏ qua avatar
    if (url.includes('_RS') || url.includes('75x75') || url.includes('30x30') || url.includes('60x60')) return;

    // Trích xuất ID từ URL để so sánh (thay vì so sánh cả chuỗi URL)
    // Vd: .../abc12345.jpg -> ID là abc12345
    const parts = url.split('/');
    const filename = parts[parts.length - 1]; // Lấy phần cuối file
    // Lấy phần ID chính (bỏ đuôi .jpg, bỏ size) - Logic tương đối
    // Pinterest ID thường nằm ở folder áp chót hoặc tên file hash
    // Cách đơn giản nhất: Dùng tên file làm ID duy nhất

    if (!usedIds.has(filename)) {
      usedIds.add(filename);
      validPinterestUrls.push(url);
    }
  });

  // 3. Chuẩn bị nguồn dữ liệu Master (Đảm bảo đủ 12 item duy nhất)
  const masterSourceList = [...validPinterestUrls];

  // Nếu chưa đủ 12 ảnh, chèn thêm ảnh từ nguồn khác (Picsum/Lorem)
  // Tạo seed duy nhất dựa trên index để không bao giờ trùng nhau
  const needed = count - masterSourceList.length;
  if (needed > 0) {
    for (let k = 0; k < needed; k++) {
      // Dùng Date.now() + k để đảm bảo mỗi lần gọi là 1 URL khác hoàn toàn
      // seed/{term}-{k} đảm bảo unique cho từng slot
      masterSourceList.push(`https://picsum.photos/seed/${encodeURIComponent(term)}-fallback-${k}/400/300`);
    }
  }

  // Cắt đúng số lượng cần thiết
  const finalSources = masterSourceList.slice(0, count);

  // 4. Render (Không dùng logic fallback xoay vòng nữa)
  for (let i = 0; i < finalSources.length; i++) {
    const sourceUrl = finalSources[i];

    const card = document.createElement('div');
    card.className = 'sp-image-card';

    const img = document.createElement('img');
    img.alt = term;
    img.loading = "lazy";
    img.decoding = "async";

    const anchor = document.createElement('a');
    anchor.className = 'sp-image-anchor';
    anchor.target = "_blank";
    anchor.rel = "noreferrer noopener";
    anchor.href = sourceUrl;

    // Load ảnh duy nhất được chỉ định cho slot này
    proxyFetchImage(sourceUrl)
      .then((dataUrl) => {
        if (dataUrl) {
          img.src = dataUrl;
          img.setAttribute('data-current-src', sourceUrl);
        } else {
          // Nếu ảnh này load lỗi -> ẨN LUÔN CARD (An toàn nhất để tránh trùng)
          // Hoặc bạn có thể set 1 ảnh placeholder cố định
          card.style.display = 'none';
        }
      })
      .catch(() => {
        card.style.display = 'none';
      });

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

function buildLensSignature(payload) {
  const ids = (payload?.images || [])
    .slice(0, 20)
    .map((img) => img.id || img.href || img.src || img.thumb || "")
    .filter(Boolean);
  const desc = (payload?.descriptions || []).slice(0, 20);
  return JSON.stringify({ mode: payload?.mode || "unknown", ids, desc });
}

function rememberLensResults(payload) {
  lastLensResults = payload || null;
  lastLensSignature = payload ? buildLensSignature(payload) : "";
  if (payload) lastLensPromptedSignature = "";
}

function buildLensPrompt(mode, payload) {
  const images = payload?.images || [];
  const safeImages = Array.isArray(images) ? images : [];

  // 1. Helper: Format dữ liệu đầu vào sạch sẽ
  const formatImageLine = (img, idx) => {
    // Ưu tiên AriaLabel (chuẩn nhất từ Google), rồi đến Title
    let content = img.ariaLabel || img.title || img.alt || "";

    // Lọc rác
    if (["Visual Match", "Image result", "Images"].includes(content)) content = "";
    if (!content && img.description) content = img.description;

    if (!content) return null;

    // Chỉ lấy text nội dung, bỏ qua link trong prompt để tiết kiệm token (trừ khi cần source)
    // Format: [Index]. "Nội dung"
    let line = `${idx + 1}. "${content}"`;

    // Nếu mode là similar thì cần source để trích dẫn, còn explain thì không bắt buộc
    if (mode === "similar" && img.source) {
      line += ` | Source: ${img.source}`;
    }

    return line;
  };

  // 2. Chuẩn bị dữ liệu (Lấy tối đa 30 items cho cả 2 mode để AI có cái nhìn toàn diện)
  const lines = safeImages.slice(0, 30)
    .map(formatImageLine)
    .filter(Boolean);

  // Fallback: Nếu không tìm thấy bất kỳ text nào
  if (!lines.length) {
    return "Google Lens returned visual matches but no textual descriptions. Please tell the user that you can see the image matches, but cannot identify the object specifically due to lack of text data.";
  }

  const contextData = lines.join("\n");

  // --- MODE 1: SIMILAR (Tìm kiếm & Liệt kê nguồn) ---
  if (mode === "similar") {
    return `I captured an image and used Google Lens to find matches. Here are the top results:\n\n` +
      `${contextData}\n\n` +
      `Request:\n` +
      `1. CONSENSUS IDENTIFICATION: Analyze the results to find the most recurring subject. What exactly is this image?\n` +
      `2. DETAILS: Mention specific details (Model, Year, Brand, Scientific Name) if available.\n` +
      `3. SOURCES: List the top 3 most authoritative sources from the list as markdown links [Source Name](URL).`; // Lưu ý: Cần truyền URL vào formatImageLine nếu muốn dùng tính năng này
  }

  // --- MODE 2: EXPLAIN/ANALYZE (Giải thích chi tiết) ---
  // TẬN DỤNG CHÍNH DỮ LIỆU SIMILAR ĐỂ VIẾT BÀI GIẢI THÍCH
  return `I have captured an image and performed a visual search. Below is the list of descriptions from similar images found by Google:\n\n` +
    `${contextData}\n\n` +
    `TASK: Act as an expert analyst. Based strictly on the consensus of the search results above, explain the image to me.\n` +
    `GUIDELINES:\n` +
    `- IDENTIFY: Start by clearly stating what the main subject is (Identity/Name).\n` +
    `- SYNTHESIZE: Combine the details from the results to explain the context, function, meaning, or cultural significance of the subject.\n` +
    `- TONE: Be informative, confident, and natural. Do not say "The search results show..." or "Based on the list...". Just describe the subject as if you recognize it directly.\n` +
    `- LENGTH: Provide a comprehensive paragraph (approx 4-6 sentences).`;
}
function deriveLensFinalQuery(promptLabel, fallbackQuery) {
  if (!lastLensResults) return fallbackQuery;

  const label = (promptLabel || "").toLowerCase();
  const wantsSimilar = label.includes("similar");
  const wantsExplain = label.includes("explain") || label.includes("describe") || label.includes("what"); // Thêm 'what' để bắt các câu hỏi "What is this?"

  const signature = lastLensSignature || buildLensSignature(lastLensResults);

  // LOGIC CŨ: Chỉ check images cho similar
  // LOGIC MỚI: Cả similar và explain đều dựa vào IMAGES để hoạt động
  const hasImages = lastLensResults.images && lastLensResults.images.length > 0;

  if (wantsSimilar && hasImages) {
    lastLensPromptedSignature = signature || lastLensPromptedSignature;
    return buildLensPrompt("similar", lastLensResults);
  }

  // SỬA Ở ĐÂY: Cho phép chạy explain nếu có images (thay vì chỉ check descriptions)
  if (wantsExplain && hasImages) {
    lastLensPromptedSignature = signature || lastLensPromptedSignature;
    // Gọi buildLensPrompt với mode "explain" -> nó sẽ tự dùng consensus từ images
    return buildLensPrompt("explain", lastLensResults);
  }

  return fallbackQuery;
}
function renderLensResults(payload) {
  const mode = payload?.mode || "similar";
  const images = payload?.images || [];
  // const descriptions = payload?.descriptions || []; // Bỏ dòng này hoặc giữ để fallback

  rememberLensResults(payload);
  removeTyping();

  const wrap = document.createElement('div');
  wrap.className = 'sp-msg bot';
  const bubble = document.createElement('div');
  bubble.className = 'sp-bubble';

  // --- MODE SIMILAR: Hiển thị lưới ảnh ---
  if (mode === "similar") {
    const title = payload.error
      ? `Google Lens error: ${escapeHtml(payload.error)}`
      : "Google Lens similar images";
    bubble.innerHTML = `<div><strong>${title}</strong></div>`;

    const grid = document.createElement('div');
    grid.className = 'sp-image-grid';
    const max = Math.min(images.length, 12);

    for (let i = 0; i < max; i++) {
      const imgMeta = images[i] || {};
      const card = document.createElement('div');
      card.className = 'sp-image-card';

      const a = document.createElement('a');
      a.className = 'sp-image-anchor';
      a.target = "_blank";
      a.rel = "noreferrer noopener";
      // Ưu tiên link gốc, nếu không có thì fallback
      const href = imgMeta.href || imgMeta.source || "#";
      a.href = href;

      const img = document.createElement('img');
      img.loading = "lazy";
      img.decoding = "async";
      img.src = imgMeta.thumb || imgMeta.src;
      // Hiển thị AriaLabel hoặc Title trong Alt
      img.alt = imgMeta.ariaLabel || imgMeta.title || "Lens result";

      if (imgMeta.title || imgMeta.source) {
        a.title = `${imgMeta.ariaLabel || imgMeta.title || ""}\nSource: ${imgMeta.source || ""}`;
      }

      a.appendChild(img);
      card.appendChild(a);

      // Caption dưới ảnh
      const caption = imgMeta.ariaLabel || imgMeta.title || imgMeta.source;
      if (caption) {
        const meta = document.createElement('div');
        meta.className = 'sp-image-meta';
        meta.textContent = caption;
        card.appendChild(meta);
      }

      grid.appendChild(card);
    }
    bubble.appendChild(grid);

  } else {
    // --- MODE EXPLAIN / OTHER ---
    // Vì không còn mảng descriptions riêng, ta trích xuất text từ images để hiển thị cho user thấy

    const title = payload.error
      ? `Google Lens error: ${escapeHtml(payload.error)}`
      : "Visual signals detected:"; // Đổi tiêu đề cho phù hợp

    // Trích xuất keyword từ 10 ảnh đầu tiên
    const derivedCaps = images
      .slice(0, 10)
      .map((img) => img.ariaLabel || img.title || img.alt) // Lấy text
      .filter(Boolean) // Loại bỏ rỗng
      .filter((txt) => !["Visual Match", "Image result"].includes(txt)); // Loại bỏ rác

    // Lọc trùng lặp (Unique)
    const uniqueCaps = [...new Set(derivedCaps)];

    const list = uniqueCaps.length
      ? `<ul>${uniqueCaps.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
      : "<p>No clear text descriptions found based on visual matches.</p>";

    bubble.innerHTML = `<div><strong>${title}</strong></div>${list}`;
  }

  wrap.appendChild(bubble);
  answerEl.appendChild(wrap);
  scrollToBottom();
}


