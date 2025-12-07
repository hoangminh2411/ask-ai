// Lightweight rewrite launcher that hooks into existing sidepanel prompts
// Shows a rewrite icon near selection; clicking opens a prompt chooser (no direct replacement yet).
(function () {
  const PROMPT_OPTIONS = [
    { key: "polish", label: "Polish EN", text: "Rewrite this in fluent, concise English. Preserve meaning and clarity." },
    { key: "academic", label: "Academic", text: "Rewrite this in clear, formal academic English with precise wording." },
    { key: "professional", label: "Professional", text: "Rewrite this in professional business tone: concise, confident, and courteous." },
    { key: "shorten", label: "Shorten", text: "Rewrite this to be shorter while keeping the key meaning intact." }
  ];

  class RewriteLauncher {
    constructor() {
      this.fab = null;
      this.menu = null;
      this.selectionText = "";
      this.selectionRect = null;
      this.bind();
    }

    bind() {
      document.addEventListener("mouseup", () => setTimeout(() => this.handleSelection(), 0));
      document.addEventListener("keyup", () => setTimeout(() => this.handleSelection(), 0));
      document.addEventListener("click", (e) => {
        if (this.menu && this.menu.contains(e.target)) return;
        if (this.fab && this.fab.contains(e.target)) return;
        this.hideAll();
      });
    }

    handleSelection() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        this.hideAll();
        return;
      }
      const text = sel.toString();
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      this.selectionText = text;
      this.selectionRect = rect;
      this.showFab(rect);
    }

    ensureFab() {
      if (this.fab) return;
      const btn = document.createElement("button");
      btn.title = "Rewrite";
      btn.textContent = "✎";
      Object.assign(btn.style, {
        position: "absolute",
        zIndex: 2147483647,
        width: "28px",
        height: "28px",
        borderRadius: "14px",
        border: "1px solid #d1d5db",
        background: "#fff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        cursor: "pointer",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "14px",
        padding: 0
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleMenu();
      });
      document.body.appendChild(btn);
      this.fab = btn;
    }

    showFab(rect) {
      this.ensureFab();
      const offset = 6;
      this.fab.style.left = `${rect.right + offset + window.scrollX}px`;
      this.fab.style.top = `${rect.top + window.scrollY}px`;
      this.fab.style.display = "flex";
    }

    ensureMenu() {
      if (this.menu) return;
      const box = document.createElement("div");
      Object.assign(box.style, {
        position: "absolute",
        zIndex: 2147483647,
        display: "none",
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "10px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        padding: "8px",
        minWidth: "180px"
      });
      PROMPT_OPTIONS.forEach(opt => {
        const btn = document.createElement("button");
        btn.textContent = opt.label;
        btn.title = opt.text;
        Object.assign(btn.style, {
          width: "100%",
          textAlign: "left",
          padding: "6px 8px",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          background: "#f9fafb",
          cursor: "pointer",
          marginBottom: "6px",
          fontSize: "13px"
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.runPrompt(opt);
        });
        box.appendChild(btn);
      });
      document.body.appendChild(box);
      this.menu = box;
    }

    toggleMenu() {
      if (!this.menu || this.menu.style.display === "none") {
        this.showMenu();
      } else {
        this.hideMenu();
      }
    }

    showMenu() {
      if (!this.selectionRect) return;
      this.ensureMenu();
      const offset = 6;
      this.menu.style.left = `${this.selectionRect.right + offset + window.scrollX}px`;
      this.menu.style.top = `${this.selectionRect.top + window.scrollY}px`;
      this.menu.style.display = "block";
    }

    hideMenu() {
      if (this.menu) this.menu.style.display = "none";
    }

    hideAll() {
      this.hideMenu();
      if (this.fab) this.fab.style.display = "none";
    }

    runPrompt(opt) {
      if (!this.selectionText) return;
      chrome.runtime.sendMessage({ action: "askgpt_open_sidepanel" });
      chrome.runtime.sendMessage({
        action: "askgpt_panel_handle",
        selection: this.selectionText,
        finalQuery: `${opt.text}\n\nContext:\n"${this.selectionText}"`,
        promptLabel: opt.label
      });
      this.hideAll();
    }
  }

  new RewriteLauncher();
})();
