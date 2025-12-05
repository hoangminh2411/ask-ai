const providerSelect = document.getElementById('provider');
const apiGroup = document.getElementById('api-group');
const apiKeyInput = document.getElementById('apiKey');
const statusDiv = document.getElementById('status');

// 1. Load setting cũ
chrome.storage.sync.get(['provider', 'geminiApiKey'], (items) => {
    if (items.provider) providerSelect.value = items.provider;
    if (items.geminiApiKey) apiKeyInput.value = items.geminiApiKey;
    toggleApiInput();
});

// 2. Ẩn hiện ô nhập Key
providerSelect.addEventListener('change', toggleApiInput);

function toggleApiInput() {
    if (providerSelect.value === 'gemini_api') {
        apiGroup.style.display = 'block';
    } else {
        apiGroup.style.display = 'none';
    }
}

// 3. Lưu setting
document.getElementById('save').addEventListener('click', () => {
    const config = {
        provider: providerSelect.value,
        geminiApiKey: apiKeyInput.value.trim()
    };
    
    chrome.storage.sync.set(config, () => {
        statusDiv.innerText = "✅ Đã lưu thành công!";
        setTimeout(() => statusDiv.innerText = "", 2000);
        
        // Gửi tin nhắn báo background reset kết nối
        chrome.runtime.sendMessage({ action: "config_updated" });
    });
});