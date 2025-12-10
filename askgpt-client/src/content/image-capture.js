// Screen capture overlay and prompt flow
window.ASKGPT_CONTENT = window.ASKGPT_CONTENT || {};
if (window.ASKGPT_CONTENT.__captureLoaded) {
    if (!window.ASKGPT_CONTENT.__captureWarned) {
        window.ASKGPT_CONTENT.__captureWarned = true;
        console.debug("ASKGPT capture script already loaded; skipping.");
    }
} else {
    const CTX_CAPTURE = window.ASKGPT_CONTENT;

    const CAPTURE_STATE = {
        overlay: null,
        selectionBox: null,
        start: null,
        pendingRect: null,
        lastRect: null,
        captureRectSnapshot: null,
        escHandler: null,
        toolboxEscHandler: null,
        lastCaptureDataUrl: null,
        lastUploadUrl: null,
        uploading: false,
        overlayHidden: false,
        handledCapture: false,
        hasDragged: false,
        sessionId: 0
    };

    function forceRemoveCaptureDom() {
        document.querySelectorAll('#askgpt-capture-overlay, #askgpt-capture-box, .askgpt-capture-toolbox').forEach((el) => el.remove());
        // Ensure page interactions re-enable if any capture overlay tweaked them.
        document.body.style.pointerEvents = '';
    }

    function hardResetCaptureState() {
        stopCaptureInteraction();
        removeToolbox();
        forceRemoveCaptureDom();
        CAPTURE_STATE.overlay = null;
        CAPTURE_STATE.selectionBox = null;
        CAPTURE_STATE.start = null;
        CAPTURE_STATE.pendingRect = null;
        CAPTURE_STATE.lastRect = null;
        CAPTURE_STATE.captureRectSnapshot = null;
        CAPTURE_STATE.overlayHidden = false;
        CAPTURE_STATE.handledCapture = false;
        CAPTURE_STATE.hasDragged = false;
        CAPTURE_STATE.sessionId = CAPTURE_STATE.sessionId || 0;
    }

    function startImageCapture() {
        // Always start from a clean slate to avoid stale overlays/toolboxes.
        hardResetCaptureState();
        removeToolbox();
        forceRemoveCaptureDom();

        // Bump session so stale capture results are ignored; keep lastCaptureDataUrl until a new result replaces it.
        CAPTURE_STATE.sessionId = (CAPTURE_STATE.sessionId || 0) + 1;

        const overlay = document.createElement('div');
        overlay.id = 'askgpt-capture-overlay';
        overlay.innerHTML = `
        <div class="askgpt-capture-instructions">
            <span>Select an area to capture. Esc to cancel.</span>
            <button id="askgpt-capture-cancel">Cancel</button>
        </div>
    `;
        document.body.appendChild(overlay);

        const box = document.createElement('div');
        box.id = 'askgpt-capture-box';
        overlay.appendChild(box);

        CAPTURE_STATE.overlay = overlay;
        CAPTURE_STATE.selectionBox = box;

        overlay.addEventListener('mousedown', onMouseDown);
        overlay.addEventListener('mousemove', onMouseMove);
        overlay.addEventListener('mouseup', onMouseUp);
        document.getElementById('askgpt-capture-cancel').addEventListener('click', cleanupCapture);

        CAPTURE_STATE.escHandler = (e) => { if (e.key === 'Escape') cleanupCapture(); };
        document.addEventListener('keydown', CAPTURE_STATE.escHandler);
    }

    function onMouseDown(e) {
        e.preventDefault();
        CAPTURE_STATE.handledCapture = false;
        CAPTURE_STATE.hasDragged = false;
        CAPTURE_STATE.pendingRect = null;
        CAPTURE_STATE.lastRect = null;
        CAPTURE_STATE.captureRectSnapshot = null;
        CAPTURE_STATE.start = { x: e.clientX, y: e.clientY };
        CAPTURE_STATE.selectionBox.style.display = 'block';
        CAPTURE_STATE.selectionBox.style.left = `${CAPTURE_STATE.start.x}px`;
        CAPTURE_STATE.selectionBox.style.top = `${CAPTURE_STATE.start.y}px`;
        CAPTURE_STATE.selectionBox.style.width = '0px';
        CAPTURE_STATE.selectionBox.style.height = '0px';
    }

    function onMouseMove(e) {
        if (!CAPTURE_STATE.start) return;
        const delta = Math.abs(e.clientX - CAPTURE_STATE.start.x) + Math.abs(e.clientY - CAPTURE_STATE.start.y);
        if (delta > 3) CAPTURE_STATE.hasDragged = true;
        const x = Math.min(e.clientX, CAPTURE_STATE.start.x);
        const y = Math.min(e.clientY, CAPTURE_STATE.start.y);
        const w = Math.abs(e.clientX - CAPTURE_STATE.start.x);
        const h = Math.abs(e.clientY - CAPTURE_STATE.start.y);
        CAPTURE_STATE.selectionBox.style.left = `${x}px`;
        CAPTURE_STATE.selectionBox.style.top = `${y}px`;
        CAPTURE_STATE.selectionBox.style.width = `${w}px`;
        CAPTURE_STATE.selectionBox.style.height = `${h}px`;
        CAPTURE_STATE.lastRect = { left: x, top: y, width: w, height: h };
    }

    function onMouseUp(e) {
        if (!CAPTURE_STATE.start) return;
        if (!CAPTURE_STATE.hasDragged) {
            cleanupCapture();
            return;
        }
        const x = Math.min(e.clientX, CAPTURE_STATE.start.x);
        const y = Math.min(e.clientY, CAPTURE_STATE.start.y);
        const w = Math.abs(e.clientX - CAPTURE_STATE.start.x);
        const h = Math.abs(e.clientY - CAPTURE_STATE.start.y);
        CAPTURE_STATE.start = null;

        if (w < 5 || h < 5) {
            cleanupCapture();
            return;
        }

        // Use DOMRect-like keys so downstream cropping logic works when the overlay is hidden.
        CAPTURE_STATE.pendingRect = { left: x, top: y, width: w, height: h };
        CAPTURE_STATE.lastRect = CAPTURE_STATE.pendingRect;
        CAPTURE_STATE.captureRectSnapshot = { left: x, top: y, width: w, height: h };
        hideOverlayForCapture();
        requestVisibleCapture();
    }

    function requestVisibleCapture() {
        try {
            const rect = CAPTURE_STATE.pendingRect || CAPTURE_STATE.lastRect || CAPTURE_STATE.captureRectSnapshot || null;
            chrome.runtime.sendMessage({ action: 'capture_visible', rect, sessionId: CAPTURE_STATE.sessionId }, () => {
                const lastError = chrome.runtime.lastError;
                if (lastError) {
                    console.error('Capture request failed:', lastError.message);
                    notifyCaptureError(lastError.message);
                    cleanupCapture();
                    showOverlayAfterCapture();
                }
            });
        } catch (err) {
            console.error('Capture request exception:', err);
            notifyCaptureError('Capture not available on this page.');
            cleanupCapture();
            showOverlayAfterCapture();
        }

        // Wait for background to respond with the data URL
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'capture_result' && msg.dataUrl && CAPTURE_STATE.overlay) {
            if (msg.sessionId && msg.sessionId !== CAPTURE_STATE.sessionId) return;
            if (CAPTURE_STATE.handledCapture) return;
            const liveRect = CAPTURE_STATE.selectionBox ? CAPTURE_STATE.selectionBox.getBoundingClientRect() : null;
            const rect = msg.rect
                || CAPTURE_STATE.pendingRect
                || CAPTURE_STATE.lastRect
                || CAPTURE_STATE.captureRectSnapshot
                || (liveRect ? { left: liveRect.left, top: liveRect.top, width: liveRect.width, height: liveRect.height } : null);
            if (!rect || !rect.width || !rect.height) {
                CAPTURE_STATE.handledCapture = true;
                console.warn('Capture result received without a valid rect');
                notifyCaptureError('No selection detected. Please drag to select an area.');
                cleanupCapture();
                return;
            }
            CAPTURE_STATE.handledCapture = true;
            showOverlayAfterCapture();
            cropDataUrl(msg.dataUrl, rect).then((cropped) => {
                CAPTURE_STATE.lastCaptureDataUrl = cropped;
                const rectCopy = rect ? { top: rect.top, left: rect.left, height: rect.height, width: rect.width } : null;
                copyImageToClipboard(cropped)
                    .then(() => showToast('Image copied. Press Ctrl+V in chat to paste.'))
                    .catch(() => showToast('Copy failed. Use the preview to save or forward.'))
                    .finally(() => {
                        stopCaptureInteraction();
                        cleanupCapture();
                        if (rectCopy) {
                            showCaptureToolbox(cropped, rectCopy);
                        }
                    });
            }).catch((err) => {
                console.error('Crop failed', err);
                notifyCaptureError('Could not crop captured image.');
                cleanupCapture();
            });
        } else if (msg.action === 'capture_result_error' && CAPTURE_STATE.overlay) {
            if (msg.sessionId && msg.sessionId !== CAPTURE_STATE.sessionId) return;
            notifyCaptureError(msg.error || 'Capture failed.');
            cleanupCapture();
            showOverlayAfterCapture();
        }
    });

    function cropDataUrl(dataUrl, rect) {
        if (!rect) return Promise.reject(new Error('No selection rectangle'));
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const ratioX = img.width / window.innerWidth;
                const ratioY = img.height / window.innerHeight;
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(rect.width * ratioX));
                canvas.height = Math.max(1, Math.round(rect.height * ratioY));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(
                    img,
                    rect.left * ratioX,
                    rect.top * ratioY,
                    rect.width * ratioX,
                    rect.height * ratioY,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    function showCaptureToolbox(imageDataUrl, rect) {
        // Ensure no stale overlay blocks clicks
        if (CAPTURE_STATE.overlay) {
            CAPTURE_STATE.overlay.remove();
            CAPTURE_STATE.overlay = null;
        }
        forceRemoveCaptureDom();
        removeToolbox();

        // Reset upload state for new capture
        CAPTURE_STATE.lastUploadUrl = null;

        const toolbox = document.createElement('div');
        toolbox.className = 'askgpt-capture-toolbox';

        // Smart positioning - keep within viewport
        const toolboxWidth = 320;
        const toolboxHeight = 100;

        let top = rect.top + rect.height + 12;
        let left = rect.left;

        // If goes below viewport, put above selection
        if (top + toolboxHeight > window.innerHeight - 20) {
            top = Math.max(12, rect.top - toolboxHeight - 12);
        }

        // Keep within horizontal bounds
        left = Math.max(12, Math.min(left, window.innerWidth - toolboxWidth - 12));

        toolbox.style.top = `${top}px`;
        toolbox.style.left = `${left}px`;
        toolbox.innerHTML = `
        <img src="${imageDataUrl}" alt="capture" />
        <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size:13px; font-weight:600; color:#1f2937;">✓ Copied to clipboard</div>
            <div class="actions">
                <button id="askgpt-tool-paste">Paste to AI</button>
                <button id="askgpt-tool-explain" class="secondary">Explain</button>
                <button id="askgpt-tool-similar" class="secondary">Similar</button>
                <button id="askgpt-tool-close" class="danger">×</button>
            </div>
        </div>
    `;
        document.body.appendChild(toolbox);

        // Paste to AI - send image to ChatGPT/Gemini
        document.getElementById('askgpt-tool-paste').onclick = async () => {
            showToast('Opening AI...');
            removeToolbox();
            cleanupCapture();
            chrome.runtime.sendMessage({
                action: 'askgpt_paste_image',
                dataUrl: imageDataUrl
            }, (resp) => {
                if (resp?.ok) {
                    showToast('Image sent to AI!', 2500);
                } else {
                    showToast('Use Ctrl+V in AI chat', 2500);
                }
            });
        };

        document.getElementById('askgpt-tool-explain').onclick = () => {
            sendImageIntent('explain').finally(cleanupCapture);
        };
        document.getElementById('askgpt-tool-similar').onclick = () => {
            sendImageIntent('similar').finally(cleanupCapture);
        };
        document.getElementById('askgpt-tool-close').onclick = () => {
            removeToolbox();
            cleanupCapture();
        };

        // Allow closing with Esc
        if (CAPTURE_STATE.toolboxEscHandler) {
            document.removeEventListener('keydown', CAPTURE_STATE.toolboxEscHandler);
        }
        CAPTURE_STATE.toolboxEscHandler = (e) => {
            if (e.key === 'Escape') {
                removeToolbox();
                cleanupCapture();
            }
        };
        document.addEventListener('keydown', CAPTURE_STATE.toolboxEscHandler);
    }

    function removeToolbox() {
        const existing = document.querySelector('.askgpt-capture-toolbox');
        if (existing) existing.remove();
        if (CAPTURE_STATE.toolboxEscHandler) {
            document.removeEventListener('keydown', CAPTURE_STATE.toolboxEscHandler);
            CAPTURE_STATE.toolboxEscHandler = null;
        }
    }

    async function requestLensAnalysis(mode) {
        if (!CAPTURE_STATE.lastCaptureDataUrl) throw new Error('No captured image available');
        return new Promise((resolve) => {
            let finished = false;
            const timer = setTimeout(() => {
                if (finished) return;
                finished = true;
                resolve({ error: 'Lens timed out' });
            }, 25000);
            chrome.runtime.sendMessage({
                action: 'askgpt_lens_search',
                dataUrl: CAPTURE_STATE.lastCaptureDataUrl,
                mode,
                maxItems: mode === 'similar' ? 12 : 10
            }, (resp) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                const err = resp?.error || chrome.runtime.lastError?.message;
                if (err) {
                    resolve({ error: err });
                    return;
                }
                resolve(resp || {});
            });
        });
    }

    async function sendImageIntent(mode) {
        const isSimilar = mode === 'similar';
        if (!CAPTURE_STATE.lastCaptureDataUrl) {
            showToast('No captured image found. Please capture again before using this action.', 2600);
            return;
        }
        showToast(isSimilar ? 'Finding similar images via Lens...' : 'Explaining image via Lens...');
        chrome.runtime.sendMessage({ action: "askgpt_open_sidepanel" });
        setTimeout(() => {
            chrome.runtime.sendMessage({
                action: "askgpt_panel_lens_progress",
                message: isSimilar ? "Searching similar images via Google Lens..." : "Analyzing image via Google Lens..."
            });
        }, 50);
        const lens = await requestLensAnalysis(mode);
        if (lens.error) {
            showToast('Lens failed: ' + lens.error, 2600);
            chrome.runtime.sendMessage({
                action: "askgpt_panel_lens_results",
                payload: { mode, images: [], descriptions: [], error: lens.error }
            });
            chrome.runtime.sendMessage({ action: "askgpt_panel_lens_done" });
            return;
        }

        const payload = {
            mode,
            images: lens.images || [],
            descriptions: lens.descriptions || []
        };

        removeToolbox();
        cleanupCapture();
        forceRemoveCaptureDom();

        const publishToPanel = (tasks) => {
            chrome.runtime.sendMessage({ action: "askgpt_open_sidepanel" }, () => {
                // Give the panel a brief moment to attach listeners/state
                setTimeout(tasks, 120);
            });
        };

        if (isSimilar) {
            publishToPanel(() => {
                chrome.runtime.sendMessage({
                    action: "askgpt_panel_lens_results",
                    payload: { ...payload, mode: 'similar' }
                });
                const urls = (payload.images || []).slice(0, 12).map((img) => img.source || img.src || img.thumb).filter(Boolean);
                const list = urls.map((u, idx) => `${idx + 1}. ${u}`).join('\n');
                const finalQuery = urls.length
                    ? `You are an image search assistant. We captured an image and fetched similar images via Google Lens. Here are the top results:\n${list}\n\nSummarize what these images depict in 2-3 sentences and surface the top 3 links as markdown bullets.`
                    : "Google Lens returned no similar images. Let the user know no similar results were found.";
                chrome.runtime.sendMessage({
                    action: "askgpt_panel_handle",
                    selection: "",
                    promptLabel: "Find similar",
                    finalQuery
                });
                chrome.runtime.sendMessage({ action: "askgpt_panel_lens_done" });
                console.debug("ASKGPT capture -> Lens similar results");
            });
            return;
        }

        // Explain flow using Lens descriptions
        publishToPanel(() => {
            if (payload.descriptions && payload.descriptions.length) {
                chrome.runtime.sendMessage({
                    action: "askgpt_panel_lens_results",
                    payload: { mode: 'explain', descriptions: payload.descriptions }
                });
                const bullets = payload.descriptions.slice(0, 10).map((d) => `- ${d}`).join('\n');
                chrome.runtime.sendMessage({
                    action: "askgpt_panel_handle",
                    selection: "",
                    promptLabel: "Explain image",
                    finalQuery: `Explain the captured image using these Google Lens observations:\n${bullets}\nProvide a concise, user-friendly explanation and key details.`
                });
            } else {
                chrome.runtime.sendMessage({
                    action: "askgpt_panel_handle",
                    selection: "",
                    promptLabel: "Explain image",
                    finalQuery: "Google Lens did not return descriptions for this image. Let the user know no description was found."
                });
            }
            chrome.runtime.sendMessage({ action: "askgpt_panel_lens_done" });
        });
    }

    function triggerAutoPaste() {
        showToast('Attempting auto paste (debug)...');
        chrome.runtime.sendMessage({ action: 'debug_paste' }, (resp) => {
            if (resp && resp.ok) {
                showToast('Auto paste sent. If allowed, image should appear in chat.');
            } else {
                const msg = resp?.error || chrome.runtime.lastError?.message || 'Auto paste failed';
                showToast(msg, 2600);
            }
        });
    }

    function sendImageToAssistant(imageDataUrl, instruction) {
        const centerX = window.innerWidth / 2 - 225;
        const centerY = window.innerHeight / 2 - 300;
        const prompt = `${instruction}\n\nBase64 PNG follows:\n${imageDataUrl}`;
        CTX_CAPTURE.showModal('Image captured. Sending to assistant...', centerX, centerY);
        CTX_CAPTURE.triggerAsk(prompt, '');
    }

    function dataUrlToBlob(dataUrl) {
        if (!dataUrl || !dataUrl.includes(',')) throw new Error('Invalid dataUrl');
        const parts = dataUrl.split(',');
        const mimeMatch = parts[0].match(/data:(.*?);/);
        const mime = mimeMatch && mimeMatch[1] ? mimeMatch[1] : "image/png";
        const byteString = atob(parts[1]);
        const len = byteString.length;
        const u8 = new Uint8Array(len);
        for (let i = 0; i < len; i++) u8[i] = byteString.charCodeAt(i);
        return new Blob([u8], { type: mime });
    }

    function dataUrlToFile(dataUrl, filename = "capture.png") {
        const blob = dataUrlToBlob(dataUrl);
        return new File([blob], filename, { type: blob.type || "image/png" });
    }

    function copyImageToClipboard(dataUrl) {
        if (!navigator.clipboard || !window.ClipboardItem) {
            return Promise.reject(new Error('Clipboard API not available'));
        }
        const blob = dataUrlToBlob(dataUrl);
        const item = new ClipboardItem({ [blob.type]: blob });
        return navigator.clipboard.write([item]);
    }

    async function uploadImageTemp(dataUrl) {
        if (!dataUrl) throw new Error('No image to upload');
        if (CAPTURE_STATE.uploading) throw new Error('Upload in progress');
        CAPTURE_STATE.uploading = true;
        try {
            const blob = dataUrlToBlob(dataUrl);
            const file = new File([blob], "capture.png", { type: blob.type });

            const uploaders = [
                async () => {
                    const form = new FormData();
                    form.append("file", file);
                    const resp = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: form });
                    if (!resp.ok) throw new Error(`tmpfiles failed (${resp.status})`);
                    const json = await resp.json();
                    const url = json?.data?.url || json?.url;
                    if (!url) throw new Error("tmpfiles missing url");
                    return url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
                },
                async () => {
                    const form = new FormData();
                    form.append("file", file);
                    const resp = await fetch("https://file.io", { method: "POST", body: form });
                    if (!resp.ok) throw new Error(`file.io failed (${resp.status})`);
                    const json = await resp.json();
                    if (!json?.success || !json?.link) throw new Error("file.io missing link");
                    return json.link;
                },
                async () => {
                    const form = new FormData();
                    form.append("file", file);
                    const resp = await fetch("https://0x0.st", { method: "POST", body: form });
                    if (!resp.ok) throw new Error(`0x0 failed (${resp.status})`);
                    const text = await resp.text();
                    const url = text.trim();
                    if (!url.startsWith("http")) throw new Error("0x0 invalid url");
                    return url;
                }
            ];

            let lastErr;
            for (const up of uploaders) {
                try {
                    const url = await up();
                    return url;
                } catch (err) {
                    lastErr = err;
                }
            }
            throw lastErr || new Error("Upload failed");
        } finally {
            CAPTURE_STATE.uploading = false;
        }
    }

    async function handleUploadLink(imageDataUrl) {
        const target = imageDataUrl || CAPTURE_STATE.lastCaptureDataUrl;
        if (!target) {
            showToast('No image available to upload.');
            return null;
        }
        if (CAPTURE_STATE.uploading) {
            showToast('Upload in progress...', 2000);
            return CAPTURE_STATE.lastUploadUrl || null;
        }
        showToast('Uploading image for shareable link...');
        try {
            const url = await uploadImageTemp(target);
            CAPTURE_STATE.lastUploadUrl = url;
            navigator.clipboard?.writeText?.(url).catch(() => { });
            showToast('Link copied: ' + url, 3000);
            return url;
        } catch (err) {
            console.error('Upload failed', err);
            showToast('Upload failed. You can still paste the image manually.');
            throw err;
        }
    }

    function isVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function trySetFileOnInputs(file) {
        const selectors = [
            'input[type="file"]',
            'input[type="file"][accept*="image"]',
            'input[type="file"]:not([disabled])'
        ];
        for (const sel of selectors) {
            const inputs = Array.from(document.querySelectorAll(sel)).filter(isVisible);
            for (const input of inputs) {
                try {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.files = dt.files;
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    return true;
                } catch (_) { /* ignore */ }
            }
        }
        return false;
    }

    function tryDropFile(file) {
        const targets = [
            '[data-testid="file-upload"]',
            '[aria-label*="Upload"]',
            '[class*="upload"]',
            'form',
            'main'
        ];
        const dt = new DataTransfer();
        dt.items.add(file);
        const opts = { bubbles: true, cancelable: true, dataTransfer: dt };
        for (const sel of targets) {
            const els = Array.from(document.querySelectorAll(sel)).filter(isVisible);
            for (const el of els) {
                try {
                    ['dragenter', 'dragover', 'drop'].forEach(type => {
                        el.dispatchEvent(new DragEvent(type, opts));
                    });
                    return true;
                } catch (_) { /* ignore */ }
            }
        }
        return false;
    }

    async function attachImageToPage(dataUrl) {
        const file = dataUrlToFile(dataUrl);
        if (trySetFileOnInputs(file)) return true;
        if (tryDropFile(file)) return true;
        return false;
    }

    function showToast(message, timeout = 2200) {
        const existing = document.getElementById('askgpt-capture-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'askgpt-capture-toast';
        toast.innerText = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), timeout);
    }

    function notifyCaptureError(message) {
        alert(`Capture failed: ${message}`);
    }

    function stopCaptureInteraction() {
        if (CAPTURE_STATE.overlay) {
            CAPTURE_STATE.overlay.removeEventListener('mousedown', onMouseDown);
            CAPTURE_STATE.overlay.removeEventListener('mousemove', onMouseMove);
            CAPTURE_STATE.overlay.removeEventListener('mouseup', onMouseUp);
            CAPTURE_STATE.overlay.style.cursor = 'default';
        }
        if (CAPTURE_STATE.escHandler) document.removeEventListener('keydown', CAPTURE_STATE.escHandler);
        CAPTURE_STATE.start = null;
        CAPTURE_STATE.escHandler = null;
    }

    function cleanupCapture() {
        hardResetCaptureState();
    }

    CTX_CAPTURE.startImageCapture = startImageCapture;
    CTX_CAPTURE.resetCaptureUi = hardResetCaptureState;
    CTX_CAPTURE.__captureLoaded = true;
    window.ASKGPT_CONTENT.__captureWarned = true;

    function hideOverlayForCapture() {
        if (CAPTURE_STATE.overlay && !CAPTURE_STATE.overlayHidden) {
            CAPTURE_STATE.overlayHidden = true;
            CAPTURE_STATE.overlay.style.display = 'none';
        }
    }

    function showOverlayAfterCapture() {
        if (CAPTURE_STATE.overlay && CAPTURE_STATE.overlayHidden) {
            CAPTURE_STATE.overlay.style.display = 'block';
            CAPTURE_STATE.overlayHidden = false;
        }
    }

} // end load guard
