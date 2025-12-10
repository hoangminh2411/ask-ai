# Window Communication Bridge - Tài liệu Hướng dẫn

## 📋 Tổng quan

**Window Communication Bridge** là một lớp trừu tượng (abstraction layer) được thiết kế để xử lý việc giao tiếp với các window/tab automation một cách ổn định và đáng tin cậy. Nó giải quyết các vấn đề phổ biến khi tự động hóa tương tác với các trang web như ChatGPT, Gemini, v.v.

## 🎯 Vấn đề được giải quyết

| Vấn đề | Giải pháp |
|--------|-----------|
| Race conditions (gửi trước khi sẵn sàng) | Health check + Window ready verification |
| Phát hiện hoàn thành không chính xác | Multi-signal stability detection |
| Timeout cố định | Adaptive waiting với exponential backoff |
| Không có retry mechanism | Automatic retry với configurable attempts |
| State phân tán | Centralized state machine |

## 🏗️ Kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│                    Controller (v2.0)                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │            WindowBridgeSession                   │   │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐    │   │
│  │  │ Health  │  │ State   │  │   Retry      │    │   │
│  │  │ Check   │→ │ Machine │→ │   Mechanism  │    │   │
│  │  └─────────┘  └─────────┘  └──────────────┘    │   │
│  │       ↓            ↓             ↓              │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │       Stability Detection               │   │   │
│  │  │  (Multiple Signals + Debounce)          │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
│              ↓                     ↓                    │
│     ┌──────────────┐      ┌──────────────────┐         │
│     │ Window       │      │ ChatGPT Observer │         │
│     │ Manager      │      │ (v2.0)           │         │
│     └──────────────┘      └──────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

## 📦 Các File

### Background Scripts
- `src/background/window-bridge.js` - Core bridge implementation
- `src/background/controller.js` - Updated để sử dụng Bridge

### Content Scripts
- `src/content/chatgpt-observer.js` - Enhanced stability detection

## 🚀 Cách sử dụng

### 1. Sử dụng cơ bản (Recommended)

```javascript
// Trong background script
const session = self.ASKGPT_BG.createBridgeSession('chatgpt_web', port);

try {
    const response = await session.execute("Hello, how are you?", {
        maxRetries: 2,
        responseTimeout: 120000  // 2 phút
    });
    
    console.log('Response:', response.html);
    console.log('Metrics:', session.metrics);
} catch (error) {
    console.error('Failed:', error);
}
```

### 2. Quick API

```javascript
// One-liner cho các trường hợp đơn giản
const response = await self.ASKGPT_BG.sendAndWait('chatgpt_web', "Xin chào", port);
```

### 3. Custom Configuration

```javascript
const session = self.ASKGPT_BG.createBridgeSession('chatgpt_web', port);

// Override config
session.config.stabilityThreshold = 3000;  // 3 giây
session.config.maxRetries = 5;

const response = await session.execute(query);
```

## ⚙️ Configuration Options

| Option | Default | Mô tả |
|--------|---------|-------|
| `maxRetries` | 3 | Số lần retry tối đa |
| `baseRetryDelay` | 500ms | Delay cơ bản giữa các retry |
| `maxRetryDelay` | 5000ms | Delay tối đa giữa các retry |
| `healthCheckTimeout` | 10000ms | Timeout cho health check |
| `responseTimeout` | 60000ms | Timeout chờ response |
| `stabilityThreshold` | 2000ms | Thời gian không đổi = stable |
| `pollInterval` | 500ms | Interval giữa các poll |

## 🔄 State Machine

```
IDLE → PREPARING → WINDOW_READY → SENDING → WAITING_RESPONSE
                                                    ↓
                ERROR ← ← ← ← ← ← ← ← ← ← RESPONSE_STREAMING
                                                    ↓
                                          RESPONSE_COMPLETE
```

## 🎛️ Provider Configs

Bridge hỗ trợ nhiều provider với config riêng:

### ChatGPT Web
```javascript
{
    selectors: {
        input: '#prompt-textarea',
        sendButton: '[data-testid="send-button"]',
        stopButton: '[data-testid="stop-button"]',
        response: '.markdown',
        streamingIndicator: '.result-streaming'
    },
    responseTimeout: 120000  // ChatGPT có thể chậm
}
```

### Gemini Web
```javascript
{
    selectors: {
        input: 'div[contenteditable="true"]',
        sendButton: '.send-button',
        response: '.model-response-text'
    }
}
```

## 🔧 Thêm Provider Mới

```javascript
// Thêm vào PROVIDER_CONFIGS trong window-bridge.js
PROVIDER_CONFIGS.new_provider = {
    selectors: {
        input: 'YOUR_INPUT_SELECTOR',
        sendButton: 'YOUR_SEND_BUTTON_SELECTOR',
        stopButton: 'YOUR_STOP_BUTTON_SELECTOR',
        response: 'YOUR_RESPONSE_SELECTOR',
        streamingIndicator: 'YOUR_STREAMING_SELECTOR'
    },
    checks: {
        isReady: (doc) => {
            // Return true if page is ready
        },
        isStreaming: (doc) => {
            // Return true if generating
        },
        isComplete: (doc) => {
            // Return true if done
        }
    },
    responseTimeout: 60000
};
```

## 🐛 Debugging

### Enable Debug Logs

Trong `chatgpt-observer.js`:
```javascript
const CONFIG = {
    DEBUG: true  // Set to true
};
```

### Monitor State Changes

```javascript
// Trong sidepanel hoặc popup
chrome.runtime.sendMessage({ action: "askgpt_get_bridge_status" }, (status) => {
    console.log('Bridge Status:', status);
});
```

## 📊 Metrics

Sau mỗi session, có thể xem metrics:

```javascript
const response = await session.execute(query);
console.log({
    healthCheckDuration: session.metrics.healthCheckDuration,
    sendDuration: session.metrics.sendDuration,
    responseDuration: session.metrics.responseDuration,
    totalDuration: session.metrics.totalDuration
});
```

## 🔄 Fallback Behavior

Nếu Bridge thất bại, controller sẽ tự động fallback về legacy method:

```javascript
// Trong controller.js
if (useBridge) {
    try {
        // Thử Bridge trước
        await session.execute(query);
    } catch (error) {
        // Fallback về legacy
        safePost({ status: 'progress', message: 'Retrying with alternative method...' });
        // ... legacy code
    }
}
```

## ⚡ Tips & Best Practices

1. **Luôn set timeout hợp lý** - ChatGPT có thể mất 30s+ cho câu trả lời dài
2. **Sử dụng retry** - Network có thể không ổn định
3. **Monitor metrics** - Để phát hiện vấn đề sớm
4. **Test với nhiều loại câu hỏi** - Ngắn, dài, code, v.v.

## 🆕 Changelog

### v1.0 (Initial)
- State machine implementation
- Health check system
- Retry mechanism với exponential backoff
- Multi-signal stability detection
- Fallback to legacy method
