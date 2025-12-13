# Worker Response Standard

## Mục đích
Định nghĩa chuẩn phản hồi từ workers để sidepanel có thể hiển thị rõ ràng:
- **Worker nào** đã trả lời
- **Thời gian** phản hồi
- **Delegation info** nếu được chuyển tiếp từ worker khác

## Response Format

```javascript
{
  status: 'success' | 'progress' | 'error' | 'delegation',
  
  // WORKER IDENTITY (Required for success)
  worker: {
    id: 'chatgpt_web',          // Worker ID
    name: 'ChatGPT',            // Display name
    shortName: 'GPT',           // Short name
    icon: '🤖',                 // Emoji icon
    color: '#10a37f'            // Theme color
  },
  
  // Response content
  answer: string,               // HTML/Markdown response
  
  // METADATA (Optional)
  meta: {
    responseTime: 1234,         // Response time in ms
    delegatedFrom: 'chatgpt_web' // If delegated from another worker
  }
}
```

## UI Display

### Bot Message với Worker Header

```
┌──────────────────────────────────────────────┐
│ 🤖 ChatGPT                         1.2s  🔊  │
├──────────────────────────────────────────────┤
│ Response content here...                     │
│                                              │
└──────────────────────────────────────────────┘
```

### Delegation Case

```
┌──────────────────────────────────────────────┐
│ 🔍 Perplexity   via ChatGPT       2.5s  🔊  │
├──────────────────────────────────────────────┤
│ Real-time search results...                  │
│                                              │
└──────────────────────────────────────────────┘
```

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.sp-worker-header` | Container for worker identity row |
| `.sp-worker-badge` | Badge with icon + name |
| `.sp-worker-badge-icon` | Emoji icon |
| `.sp-worker-badge-name` | Worker name text |
| `.sp-response-time` | Response time display |
| `.sp-delegated-badge` | "via X" delegation badge |
| `.sp-bubble-content` | Content container (separate from header) |

## CSS Variables

| Variable | Usage |
|----------|-------|
| `--worker-color` | Dynamic color from worker config |

## Files Modified

1. **`src/background/window-bridge.js`**
   - `notifySuccess()` now includes worker identity info

2. **`sidepanel.js`**
   - `handlePortMessage()` extracts and passes worker info
   - `appendBotMessage()` renders worker header

3. **`sidepanel.css`**
   - New styles for `.sp-worker-header`, `.sp-worker-badge`, etc.

## Next Steps

1. ~~**Parallel Execution**: When worker is busy, find another available worker~~ ✅ DONE
2. ~~**Worker Status Tracking**: Real-time busy/idle state in worker manager~~ ✅ DONE
3. ~~**Load Balancing**: Route requests to least-busy worker~~ ✅ DONE

---

## Parallel Execution (NEW)

### Smart @Mention Parsing

**Independent Tasks** - mỗi worker nhận task riêng:
```
@gemini: phân tích hình ảnh này @chatgpt: tóm tắt nội dung
```
→ Gemini nhận "phân tích hình ảnh này"
→ ChatGPT nhận "tóm tắt nội dung"

**Shared Task** - tất cả workers nhận cùng task:
```
@gemini @perplexity what is the weather today?
```
→ Cả Gemini và Perplexity đều nhận "what is the weather today?"

### Parse Logic
- Có dấu `:` sau `@worker` → Independent task
- Không có `:` → Shared task

### Busy Worker Fallback
When a requested worker is busy:
1. System checks `workerManager.isWorkerBusy(workerId)`
2. If busy, calls `workerManager.getAvailableWorker([workerId])`
3. Uses alternative worker if available
4. Shows message: "X is busy, using Y instead..."

### Busy Indicator UI
- Avatar có spinning border màu vàng (#f59e0b)
- Pulse animation khi đang xử lý
- Worker panel hiện "⚡ Processing..." với task preview

### CSS Classes
| Class | Purpose |
|-------|---------|
| `.sp-parallel-responses` | Container for multiple responses |
| `.sp-parallel-response` | Individual worker response card |
| `.sp-task-preview` | Task hint trong header (independent tasks) |
| `.sp-avatar.busy` | Avatar với spinning loader |

---
*Created: 2025-12-12*
*Updated: 2025-12-12 - Added smart parsing, busy indicator, tools & sequences*

---

## /Tool Commands (NEW)

Execute special tools that automatically extract page content:

| Command | Description |
|---------|-------------|
| `/summary` | Summarize current page |
| `/analyze` | Analyze page in detail |
| `/extract` | Extract key information (dates, names, facts) |
| `/translate` | Translate page content |
| `/explain` | Explain content simply |
| `/code` | Review code on the page |

### Usage Examples
```
/summary @gemini
/analyze
/extract @perplexity focus on prices
```

### How it works
1. Detects `/tool` in query
2. Extracts current page content (title, URL, text)
3. Builds prompt: `[Tool prompt] + [Page content] + [User query]`
4. Sends to specified worker (or default)

---

## Sequence Execution (Pipeline)

Chain workers together - output of one becomes input for next:

```
@gemini > @chatgpt: analyze and summarize this
```

### Flow
```
    ┌──────────┐      ┌──────────┐
    │ ✨ Gemini │  →   │ 🤖 ChatGPT│
    │ (Step 1) │      │ (Step 2) │
    └──────────┘      └──────────┘
         │                  │
    [Analysis]         [Summary]
         └──────────────────┘
                  ↓
           Final Result
```

### UI Features
- Pipeline visualization with step badges
- Progress indicator per step: "Step 1/3: Gemini..."
- Collapsible intermediate results
- Final result highlighted with ✨ badge

### Combined: /Tool + Sequence

```
/summary @chatgpt > @gemini
```

**Flow:**
1. Extract page content
2. ChatGPT receives: `[Summary prompt] + [Page content]`
3. ChatGPT's output → Gemini
4. Final result from Gemini

This is **very powerful** for workflows like:
- `/analyze @gemini > @chatgpt: simplify for beginners`
- `/extract @perplexity > @chatgpt: make a table`
