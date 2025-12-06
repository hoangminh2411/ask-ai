// Gemini API handler
async function handleGeminiAPI(port, query, apiKey) {
    if (!apiKey) throw new Error("Chưa nhập API Key.");
    port.postMessage({ status: 'progress', message: "Đang gửi API..." });
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: query }] }] })
        });
        if (!response.ok) throw new Error("API Error: " + response.statusText);
        const data = await response.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (answer) port.postMessage({ status: 'success', answer: answer });
        else throw new Error("No response");
    } catch (e) { throw e; }
}

self.ASKGPT_BG = Object.assign(self.ASKGPT_BG || {}, {
    handleGeminiAPI
});
