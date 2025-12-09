// Wire runtime and DOM events
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__eventsLoaded) {
    if (!window.ASKGPT_CONTENT.__eventsWarned) {
        window.ASKGPT_CONTENT.__eventsWarned = true;
        console.debug("ASKGPT events script already loaded; skipping.");
    }
} else {
    const CTX_EVENTS = window.ASKGPT_CONTENT;

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        // Handle unifying action for analyzing or summarizing
        if (request.action === "summarize_page" || request.action === "analyze_page") {
            // 1. Lấy nội dung DOM
            const pageContent = CTX_EVENTS.getPageContent();

            if (!pageContent || pageContent.length < 50) {
                alert("Trang này quá ngắn hoặc không có nội dung để phân tích.");
                sendResponse?.({ ok: false, error: "too_short" });
                return;
            }

            // 2. Determine Prompt ID
            // User wants 'analyze-dom' for the Alt+S shortcut (summarize_page)
            let targetPromptId = "analyze-dom";
            // if (request.action === "summarize_page") targetPromptId = "summary"; // DISABLE this override

            const promptObj = (window.ASKGPT_PROMPTS || []).find(p => p.id === targetPromptId);
            const promptText = promptObj ? promptObj.text : `Bạn là AI Automation Assistant. Nhiệm vụ: Phân tích sâu nội dung và cấu trúc trang web để giúp người dùng hiểu rõ và điều khiển nó.

QUAN TRỌNG NHẤT - CÁCH TÌM ID:
- Tìm \`[TAG:123]\` -> Số \`123\` là ID.
- BẮT BUỘC dùng đúng ID để tạo nút bấm.

CONTEXT (Semantic DOM):
{{context}}

YÊU CẦU OUTPUT (Markdown):

### 1. 📝 Phân tích chuyên sâu (Deep Analysis)
*Viết đoạn văn phân tích chi tiết mục đích và giá trị cốt lõi của trang này.*
- **Nội dung chính:** ...
- **Điểm nổi bật/Insight:** ...

### 2. 💡 Gợi ý tìm hiểu (Discovery)
*Đề xuất 3 câu hỏi thú vị để người dùng hỏi bạn thêm về trang này:*
- "..."
- "..."
- "..."

### 3. 🚀 Actions (Điều khiển)
*Các nút bấm thực tế để thao tác trên trang.*

**🎯 Key Actions:**
- [👉 <Tên Action> (ID: <số>)](#ask-action-<số>)
- [👉 <Tên Action> (ID: <số>)](#ask-action-<số>)
- [📷 Xem toàn bộ ảnh (ID: view_images)](#ask-action-view_images) *(Nếu có nhiều ảnh)*

**LƯU Ý:**
1. **NO FAKE IDs:** Chỉ dùng ID có thật trong Context.
2. **Format:** \`[Tên(ID: <số>)](#ask-action-<số>)\`.`;
            const promptLabel = promptObj ? promptObj.label : "Analysis";

            // 3. Ghép Prompt
            const finalQuery = `${promptText}\n\nContext (Semantic DOM):\n"${pageContent}"`;

            // 4. Mở Sidepanel
            chrome.runtime.sendMessage({ action: "askgpt_open_sidepanel" });

            setTimeout(() => {
                chrome.runtime.sendMessage({
                    action: "askgpt_panel_handle",
                    selection: pageContent,
                    finalQuery: finalQuery,
                    promptLabel: promptLabel
                });
            }, 100);

            sendResponse?.({ ok: true });
            return true;
        }
        else if (request.action === "trigger_modal_shortcut") {
            const selection = window.getSelection().toString().trim();
            const cx = window.innerWidth / 2 - 225;
            const cy = window.innerHeight / 2 - 300;
            CTX_EVENTS.showModal(selection || "Hi there, how can I help?", cx, cy);
            sendResponse?.({ ok: true });
            return true;
        }
        else if (request.action === "start_image_capture") {
            CTX_EVENTS.startImageCapture();
            sendResponse?.({ ok: true });
            return true;
        }
        else if (request.action === "askgpt_get_images") {
            const images = Array.from(document.querySelectorAll('img'))
                .filter(img => img.naturalWidth > 150 && img.naturalHeight > 150) // Lọc ảnh nhỏ/icon
                .filter(img => {
                    const rect = img.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                })
                .map(img => ({
                    src: img.src || img.dataset.src,
                    thumb: img.src || img.dataset.src, // Fallback
                    alt: img.alt || "",
                    title: img.title || "",
                    width: img.naturalWidth,
                    height: img.naturalHeight
                }));

            // Deduplicate by src
            const unique = [];
            const seen = new Set();
            images.forEach(img => {
                if (!seen.has(img.src)) {
                    seen.add(img.src);
                    unique.push(img);
                }
            });

            sendResponse?.({ ok: true, images: unique.slice(0, 50) }); // Limit 50
            return true;
        }
        else if (request.action === "askgpt_get_runtime_selection") {
            const content = CTX_EVENTS.getPageContent ? CTX_EVENTS.getPageContent() : "";
            sendResponse?.({ selection: content || "" });
            return true;
        }
        else if (request.action === "CLICK_ELEMENT") {
            const id = request.targetId;
            const target = document.querySelector(`[data-ask-id="${id}"]`);

            if (target) {
                // 1. Cuộn đến phần tử
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // 2. Highlight ngắn để user biết đang click vào đâu
                const originalOutline = target.style.outline;
                const originalBg = target.style.backgroundColor;

                target.style.outline = "4px solid #137333"; // Màu xanh Action
                target.style.backgroundColor = "rgba(19, 115, 51, 0.2)";

                // 3. Thực hiện Click sau 500ms (để kịp nhìn highlight)
                setTimeout(() => {
                    // Reset style
                    target.style.outline = originalOutline;
                    target.style.backgroundColor = originalBg;

                    // Dispatch Click Event chuẩn
                    // Cố gắng dùng .click() native trước
                    try {
                        target.click();
                    } catch (e) {
                        console.log("Native click failed, dispatching events...");
                        const clickEvent = new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: true
                        });
                        target.dispatchEvent(clickEvent);
                    }

                    // Backup: Nếu là thẻ A có href, đôi khi cần force chuyển trang
                    if (target.tagName === 'A' && target.href) {
                        // Kiểm tra xem click() có điều hướng chưa, nếu chưa thì đổi location
                        // Nhưng cẩn thận Single Page App (SPA), nên ưu tiên click()
                    }

                }, 500);

                sendResponse?.({ ok: true });
            } else {
                console.warn(`[AskGPT] Element with ID ${id} not found.`);
                sendResponse?.({ ok: false, error: "not_found" });
            }
            return true;
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.target.closest('#askgpt-modal') || e.target.closest('#askgpt-floating-btn')) return;

        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text.length > 2) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            const pageX = rect.right + window.scrollX + 5;
            const pageY = rect.top + window.scrollY - 35;
            const clientX = rect.right + 5;
            const clientY = rect.top - 35;

            CTX_EVENTS.createFloatingButton(pageX, pageY, clientX, clientY, text);
        } else {
            CTX_EVENTS.removeFloatingButton();
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#askgpt-floating-btn') && !e.target.closest('#askgpt-modal')) {
            CTX_EVENTS.removeFloatingButton();
        }
    });

    document.addEventListener('selectionchange', () => {
        const text = window.getSelection().toString().trim();
        if (text.length < 3) {
            CTX_EVENTS.removeFloatingButton();
        }
    });

    window.ASKGPT_CONTENT.__eventsLoaded = true;
    window.ASKGPT_CONTENT.__eventsWarned = true;
} // end guard
