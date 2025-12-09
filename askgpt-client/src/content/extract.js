// src/content/extract.js
// Phiên bản: 3.0 (Automation Ready)
// Mục tiêu: Tạo Interactive Snapshot (DOM ngữ nghĩa) cho AI đọc và điều khiển

window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};

if (window.ASKGPT_CONTENT.__extractLoaded) {
    if (!window.ASKGPT_CONTENT.__extractWarned) {
        window.ASKGPT_CONTENT.__extractWarned = true;
        console.debug("ASKGPT extract script already loaded; skipping.");
    }
} else {

    const CTX_EXTRACT = window.ASKGPT_CONTENT;
    let autoIdCounter = 0;

    /**
     * BƯỚC 1: ĐỊNH DANH (Indexing)
     * Chạy trên DOM thật để gán ID cho mọi phần tử tương tác.
     * AI sẽ dùng ID này để ra lệnh (VD: "Click 15").
     */
    function assignAutomationIds() {
        // CẬP NHẬT: Thêm h1-h6, p, li, article, section vào danh sách cần gán ID
        const interactiveSelectors = [
            'a[href]', 'button', 'input', 'textarea', 'select',
            '[role="button"]', '[role="link"]', '[role="checkbox"]',
            '[role="menuitem"]', '[role="tab"]',
            '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
            // --- THÊM PHẦN NÀY ĐỂ TRACK TEXT ---
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'article', 'section', 'li'
        ];

        const elements = document.querySelectorAll(interactiveSelectors.join(','));

        elements.forEach(el => {
            // Chỉ gán ID nếu chưa có VÀ nếu là thẻ text thì phải có nội dung (tránh gán thẻ rỗng)
            if (!el.hasAttribute('data-ask-id')) {
                // Với thẻ text, kiểm tra độ dài để tránh rác
                if (['P', 'LI', 'H1', 'H2', 'H3'].includes(el.tagName)) {
                    if (el.innerText.trim().length < 5) return;
                }

                autoIdCounter++;
                el.setAttribute('data-ask-id', autoIdCounter);
            }
        });

        console.debug(`[AskGPT] Assigned IDs to ${autoIdCounter} elements.`);
        return autoIdCounter;
    }

    /**
     * BƯỚC 2: TRÍCH XUẤT (Snapshot)
     * Tạo bản sao tối giản của trang web để gửi cho AI (tiết kiệm token).
     */
    function getPageContent() {
        assignAutomationIds();

        const root = document.body;
        // Các selector rác cần bỏ qua
        const trashSelectors = new Set([
            'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS',
            'VIDEO', 'AUDIO', 'LINK', 'META', 'OBJECT', 'EMBED', 'MAP'
        ]);

        // Các ID UI của extension cần bỏ qua
        const ignoreIds = new Set([
            'askgpt-floating-btn', 'askgpt-modal', 'askgpt-capture-overlay', 'askgpt-sidebar-root'
        ]);

        let output = [];

        function walk(node, depth) {
            if (!node) return;

            // 1. Kiểm tra Element
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName;

                // SKip rác
                if (trashSelectors.has(tagName) ||
                    ignoreIds.has(node.id) ||
                    node.classList.contains('hidden') ||
                    node.getAttribute('aria-hidden') === 'true' ||
                    (node.style && (node.style.display === 'none' || node.style.visibility === 'hidden'))) {
                    return;
                }

                // Lấy ID automation
                const askId = node.getAttribute('data-ask-id');
                const role = node.getAttribute('role');
                const ariaLabel = node.getAttribute('aria-label');
                const placeholder = node.getAttribute('placeholder');

                // Quyết định xem có ghi node này vào output hay không
                // Ghi nếu: Có ID automation HOẶC là thẻ cấu trúc quan trọng (H1-H6, NAV, SECTION, ARTICLE)
                const isHeading = /^H[1-6]$/.test(tagName);
                const isStructure = ['NAV', 'HEADER', 'FOOTER', 'SECTION', 'ARTICLE', 'MAIN'].includes(tagName);
                const isInteractive = !!askId;

                let line = "";
                const indent = "  ".repeat(depth);

                // Xây dựng nội dung Attributes quan trọng
                let attrParts = [];
                if (role) attrParts.push(`role="${role}"`);
                if (ariaLabel) attrParts.push(`label="${ariaLabel}"`);
                if (placeholder) attrParts.push(`placeholder="${placeholder}"`);
                if (tagName === 'A' && node.href) attrParts.push(`href="${node.href}"`);
                if (tagName === 'IMG') attrParts.push(`alt="${node.alt || ''}"`);
                if (tagName === 'INPUT') {
                    attrParts.push(`type="${node.type}"`);
                    if (node.value) attrParts.push(`val="${node.value}"`);
                }

                const attrStr = attrParts.length ? ` {${attrParts.join(', ')}}` : "";

                // A. Nếu là Element có ID hoặc Heading -> Ghi thẻ mở
                if (isInteractive || isHeading || isStructure) {
                    const idPart = askId ? `:${askId}` : "";
                    line = `${indent}[${tagName}${idPart}]${attrStr}`;
                }

                // B. Lấy Text Content trực tiếp của node này (không lấy của con)
                let directText = "";
                if (tagName !== 'SCRIPT' && tagName !== 'STYLE') {
                    // Hack: Chỉ lấy text node con trực tiếp
                    node.childNodes.forEach(child => {
                        if (child.nodeType === Node.TEXT_NODE) {
                            const t = child.textContent.replace(/\s+/g, ' ').trim();
                            if (t) directText += t + " ";
                        }
                    });
                }
                directText = directText.trim();

                // C. Ghép dòng
                if (line) {
                    if (directText) line += ` ${directText}`;
                    output.push(line);
                } else if (directText) {
                    // Nếu không phải thẻ interactive nhưng có text -> Ghi text
                    // (Chỉ ghi nếu text đủ dài hoặc có ý nghĩa)
                    if (directText.length > 2) {
                        output.push(`${indent}${directText}`);
                    }
                }

                // Recurse children
                // Tối ưu: Không đi sâu vào các node đã define là rác
                Array.from(node.children).forEach(child => walk(child, isInteractive || isStructure ? depth + 1 : depth));
            }
        }

        walk(root, 0);

        return output.join('\n').substring(0, 50000); // 50k char limit
    }

    CTX_EXTRACT.getPageContent = getPageContent;
    window.ASKGPT_CONTENT.__extractLoaded = true;
    window.ASKGPT_CONTENT.__extractWarned = true;
}