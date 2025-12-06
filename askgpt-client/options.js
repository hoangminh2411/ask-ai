const providerSelect = document.getElementById('provider');
const apiGroup = document.getElementById('api-group');
const apiKeyInput = document.getElementById('apiKey');
const statusDiv = document.getElementById('status');

// 1. Load saved settings
chrome.storage.sync.get(['provider', 'geminiApiKey'], (items) => {
    if (items.provider) providerSelect.value = items.provider;
    if (items.geminiApiKey) apiKeyInput.value = items.geminiApiKey;
    toggleApiInput();
});

// 2. Show/hide API key input based on provider
providerSelect.addEventListener('change', toggleApiInput);

function toggleApiInput() {
    if (providerSelect.value === 'gemini_api') {
        apiGroup.style.display = 'block';
    } else {
        apiGroup.style.display = 'none';
    }
}

// 3. Save settings
document.getElementById('save').addEventListener('click', () => {
    const config = {
        provider: providerSelect.value,
        geminiApiKey: apiKeyInput.value.trim()
    };
    
    chrome.storage.sync.set(config, () => {
        statusDiv.innerText = "Saved successfully!";
        setTimeout(() => statusDiv.innerText = "", 2000);
        
        // Notify background to refresh connections
        chrome.runtime.sendMessage({ action: "config_updated" });
    });
});
