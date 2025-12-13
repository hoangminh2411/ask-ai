# Self-Learning Element Detector

## Tổng Quan

Module tự động phát hiện và thích ứng với thay đổi UI trong các giao diện chat AI.

## Tính Năng

### 1. Auto-Detection
Tự động phát hiện các loại element:
- **input**: Textarea, contenteditable, textbox
- **submit**: Send button, submit button
- **response**: Markdown container, chat bubble
- **loading**: Spinner, streaming indicator

### 2. Learning & Caching
- Lưu selectors hoạt động với confidence score
- Tăng confidence khi selector thành công
- Giảm confidence khi fail

### 3. Self-Healing
- Khi hardcoded selector fail → tự động thử alternatives
- `selfHeal()` method để re-detect tất cả elements
- Cache updated selectors cho lần sau

## Kiến trúc

```
┌─────────────────────────────┐
│    WindowBridgeSession      │
├─────────────────────────────┤
│ getSmartSelector(type)      │
│   ├─ 1. Try hardcoded       │
│   ├─ 2. Verify in page      │
│   └─ 3. Fallback to Detector│
├─────────────────────────────┤
│ selfHeal()                  │
│   └─ Re-detect all elements │
└─────────────────────────────┘
         ↓
┌─────────────────────────────┐
│    ElementDetector          │
├─────────────────────────────┤
│ Strategies:                 │
│   ├─ Specific (chatgpt,..)  │
│   ├─ Common (textarea,..)   │
│   └─ Heuristic (largest,..) │
├─────────────────────────────┤
│ Cache:                      │
│   └─ chrome.storage.local   │
└─────────────────────────────┘
```

## Detection Strategies

### Input Detection
1. Platform-specific: `#prompt-textarea`, `.ql-editor`
2. Common: `[contenteditable="true"]`, `textarea`
3. Heuristic: Largest visible textarea

### Submit Button Detection
1. Aria-labels: `[aria-label*="Send"]`
2. Test IDs: `[data-testid="send-button"]`
3. Heuristic: Button nearest to input

### Response Detection
1. Chat-specific: `.markdown.prose`, `.model-response-text`
2. Common: `[class*="message"]`, `[class*="response"]`
3. Heuristic: Largest text container

## API

```javascript
// Get singleton instance
const detector = self.ASKGPT_BG.elementDetector;

// Detect an element
const result = await detector.detectElement(tabId, 'chatgpt_web', 'input');
// Returns: { selector, element, strategy, fromCache }

// Self-heal a worker
const results = await detector.healWorker(tabId, 'chatgpt_web');

// Learn from user
detector.learnSelector('chatgpt_web', 'input', '#my-custom-selector');

// Get status for diagnostics
const status = detector.getStatus();
```

## WindowBridge Integration

```javascript
// Inside WindowBridgeSession
const inputSelector = await this.getSmartSelector('input');
// Tries hardcoded first, falls back to ElementDetector if fail

// On failure, trigger self-heal
if (operationFailed) {
    await this.selfHeal();
}
```

## Confidence System

| Action | Confidence Change |
|--------|-------------------|
| Selector succeeds | +0.05 (max 1.0) |
| Selector fails | -0.2 |
| User provides | Set to 1.0 |

Selector chỉ được dùng từ cache khi confidence > 0.7

## Storage

Cache được lưu vào `chrome.storage.local`:

```json
{
  "elementDetectorCache": {
    "chatgpt_web_input": {
      "selector": "#prompt-textarea",
      "strategy": "chatgpt_specific",
      "confidence": 0.95,
      "lastSuccess": 1702400000000,
      "usageCount": 42
    }
  }
}
```

---

*Version: 1.0*
*Created: 2025-12-12*
