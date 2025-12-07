const LENS_URL = "https://lens.google.com/upload";
const MAX_WAIT_MS = 30000;

function safeNotify(payload) {
    try { chrome.runtime.sendMessage(payload); } catch (_) { /* ignore */ }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// 1. MỞ CỬA SỔ (Giữ nguyên)
async function openLensWindow() {
    const win = await chrome.windows.create({
        url: LENS_URL,
        type: "popup",
        width: 1280, 
        height: 800,
        focused: true 
    });
    
    let tabId = null;
    if (win.tabs && win.tabs.length > 0) tabId = win.tabs[0].id;
    else {
        const tabs = await chrome.tabs.query({ windowId: win.id });
        if (tabs.length > 0) tabId = tabs[0].id;
    }
    return { tabId: tabId, windowId: win.id };
}

// 2. UPLOAD ẢNH (Giữ nguyên)
async function injectAndUpload(tabId, dataUrl) {
    await sleep(1500); 
    const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (base64Data) => {
            const base64ToBlob = async (url) => {
                const res = await fetch(url);
                return await res.blob();
            };
            try {
                const blob = await base64ToBlob(base64Data);
                const file = new File([blob], "image.png", { type: "image/png" });
                const clipboardEvent = new ClipboardEvent('paste', {
                    bubbles: true, cancelable: true, clipboardData: new DataTransfer()
                });
                clipboardEvent.clipboardData.items.add(file);
                document.dispatchEvent(clipboardEvent);
                return true;
            } catch (e) { return false; }
        },
        args: [dataUrl]
    });
    return result[0]?.result || false;
}

// 3. SCRAPER (ĐÃ NỚI LỎNG)
async function scrapeLensResults(tabId, maxItems) {
    const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (limit) => {
            // 1. Tự động Scroll xuống cuối để kích hoạt Lazy Load
            window.scrollTo(0, document.body.scrollHeight);

            // Lấy tất cả ảnh
            const allImages = Array.from(document.images);
            const results = [];
            const seen = new Set();

            for (const img of allImages) {
                if (results.length >= limit) break;

                const src = img.src;
                // Lọc ảnh rác, icon, base64 quá ngắn
                if (!src || src.startsWith('data:image/gif') || src.includes('favicon')) continue;
                
                // Kích thước tối thiểu (loại bỏ icon nhỏ)
                const rect = img.getBoundingClientRect();
                if (rect.width < 50 || rect.height < 50) continue;

                // --- LOGIC TRÍCH XUẤT THÔNG MINH ---
                
                let title = "";
                let source = "";
                let href = "";
                let ariaLabel = "";

                // A. Tìm thẻ Div cha có chứa aria-label (Đây là dữ liệu quý giá nhất của Google)
                const parentDivWithLabel = img.closest('div[aria-label]');
                if (parentDivWithLabel) {
                    ariaLabel = parentDivWithLabel.getAttribute('aria-label');
                }

                // B. Tìm thẻ Link bao quanh
                const parentLink = img.closest('a');
                if (parentLink) {
                    href = parentLink.href;
                    // Nếu không có ariaLabel từ div, thử lấy từ link
                    if (!ariaLabel) {
                        ariaLabel = parentLink.getAttribute('aria-label') || parentLink.title;
                    }
                    try {
                        source = new URL(href).hostname.replace('www.', '');
                    } catch(e) {}
                }

                // C. Fallback: Tìm text xung quanh
                if (!ariaLabel && !title) {
                    const container = img.parentElement;
                    if (container) title = container.innerText || "";
                }

                // ƯU TIÊN: Aria Label là Title chính xác nhất
                let finalTitle = ariaLabel || title || "";

                // Dọn dẹp text
                finalTitle = finalTitle.replace(/\n/g, ' ').trim();
                if (finalTitle.length > 150) finalTitle = finalTitle.substring(0, 150) + "...";

                // Chỉ lấy nếu có Title hoặc AriaLabel (để tránh lấy ảnh rác không có ngữ nghĩa)
                // Tuy nhiên, nếu muốn lấy hết ảnh visual match thì bỏ điều kiện này.
                // Ở đây ta đặt tên mặc định nếu rỗng để AI vẫn nhận diện được hình ảnh.
                if (!finalTitle) finalTitle = "Visual Match Image";

                if (seen.has(src)) continue;
                seen.add(src);

                results.push({
                    title: finalTitle, // AI sẽ đọc trường này
                    ariaLabel: ariaLabel, // Lưu riêng để debug nếu cần
                    source: source || "Google Lens",
                    description: finalTitle,
                    src: src,
                    thumb: src,
                    href: href || src
                });
            }
            return results;
        },
        args: [maxItems]
    });

    return result[0]?.result || [];
}

// 4. MAIN FLOW
// 4. MAIN FLOW
async function runLensFlow(dataUrl, maxItems = 30) { // Mặc định tăng lên 30
    let ids = null;
    try {
        ids = await openLensWindow();
        safeNotify({ action: "askgpt_panel_lens_progress", message: "Connecting..." });

        const uploaded = await injectAndUpload(ids.tabId, dataUrl);
        if (!uploaded) throw new Error("Upload failed");
        
        safeNotify({ action: "askgpt_panel_lens_progress", message: "Analyzing..." });

        const startTime = Date.now();
        let finalImages = [];
        
        // Vòng lặp chờ kết quả
        while (Date.now() - startTime < MAX_WAIT_MS) {
            
            // Gọi hàm scrape (bên trong hàm này đã có lệnh scroll)
            const images = await scrapeLensResults(ids.tabId, maxItems);
            
            console.log(`[Lens Debug] Found ${images.length}/${maxItems} images`);

            // Nếu đã tìm đủ số lượng yêu cầu -> Thoát ngay
            if (images.length >= maxItems) {
                finalImages = images;
                break; 
            }

            // Nếu chưa đủ, nhưng đã có một số lượng kha khá (ví dụ > 10) và đã chạy được 1 nửa thời gian -> Có thể chấp nhận thoát sớm
            if (images.length > 10 && (Date.now() - startTime > MAX_WAIT_MS / 2)) {
                 finalImages = images;
                 break;
            }

            // Lưu tạm kết quả tốt nhất hiện có
            if (images.length > finalImages.length) {
                finalImages = images;
            }

            // Chờ 1.5s để trang load thêm (do thao tác scroll bên trong scraper)
            await sleep(500); 
        }

        // Kết thúc vòng lặp
        if (finalImages.length > 0) {
            safeNotify({ action: "askgpt_panel_lens_progress", message: `Found ${finalImages.length} results!` });
            
            chrome.runtime.sendMessage({
                action: "askgpt_panel_lens_results",
                payload: { images: finalImages, descriptions: finalImages.map(img =>img.ariaLabel || img.title ||  img.description || "") }
            });


            console.log("[Lens Debug] Final images:", finalImages);
            return { images: finalImages, descriptions: finalImages.map(img =>img.ariaLabel || img.title ||  img.description || "") };
        }
        
        throw new Error("Lens timed out (No images found).");

    } catch(err) {
        safeNotify({ action: "askgpt_panel_lens_done" });
        console.error("Lens Error:", err);
        throw err;
    } finally {
        if (ids?.windowId) chrome.windows.remove(ids.windowId).catch(() => {});
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === "askgpt_lens_search" && msg.dataUrl) {
        runLensFlow(msg.dataUrl, 20)
            .then((res) => sendResponse(res))
            .catch((err) => sendResponse({ error: String(err) }));
        return true; 
    }
});