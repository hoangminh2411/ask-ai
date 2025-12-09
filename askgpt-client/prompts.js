// Shared prompt registry for toolbar + sidepanel
window.ASKGPT_PROMPTS = [
  {
    id: "analyze-dom",
    label: "Phân tích UI (Agent)",
    icon: "icons/prompt-action.svg",
    surfaces: [],
    text: `Bạn là AI Automation Assistant. Nhiệm vụ: Phân tích sâu nội dung và cấu trúc trang web để giúp người dùng hiểu rõ và điều khiển nó.

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

### 2. � Gợi ý tìm hiểu (Discovery)
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
2. **Format:** \`[Tên(ID: <số>)](#ask-action-<số>)\`.`,
    description: "Phân tích cấu trúc trang để định hướng Automation."
  },
  {
    id: "explain",
    label: "Explain",
    icon: "icons/prompt-explain.svg",
    surfaces: ['toolbar', 'panel'],
    text: "You are a senior AI tutor. Explain the selection in concise bullet steps, then end with a 2-sentence takeaway.",
    description: "Explain in bullets and a short takeaway."
  },
  {
    id: "rewrite-en",
    label: "Rewrite",
    icon: "icons/prompt-polish.svg",
    surfaces: ['toolbar', 'panel'],
    text: "Rewrite this with clearer, polished English. Keep meaning and key terms intact; concise, natural tone.",
    description: "Rewrite with a polished, clear voice."
  },
  {
    id: "translate-vn",
    label: "Translate VN",
    icon: "icons/prompt-vi.svg",
    surfaces: ['toolbar', 'panel'],
    text: "Translate to Vietnamese with natural, concise wording. Keep important technical terms.",
    description: "Translate to Vietnamese."
  },
  {
    id: "translate-en",
    label: "Translate EN",
    icon: "icons/prompt-en.svg",
    surfaces: ['toolbar', 'panel'],
    text: "Translate to English with crisp, natural phrasing. Keep key terms intact.",
    description: "Translate to English."
  },
  {
    id: "summary",
    label: "TL;DR",
    icon: "icons/prompt-tldr.svg",
    surfaces: ['toolbar', 'panel'],
    text: `Hãy đóng vai một Chuyên gia Phân tích Nội dung (Senior Content Analyst). Nhiệm vụ của bạn là đọc nội dung trang web được cung cấp và viết một bản TÓM TẮT CHUYÊN SÂU (Comprehensive Summary).

CONTEXT (Page Content):
{{context}}

YÊU CẦU ĐẦU RA (Bắt buộc dùng Markdown):

### 1. 📝 Tổng quan (Overview)
*Viết một đoạn văn (khoảng 3-5 câu) tóm tắt bao quát nội dung chính của trang. Mục đích của trang là gì? Nó dành cho ai?*

### 2. 🔑 Điểm chính (Key Takeaways)
*Liệt kê 5-7 điểm quan trọng nhất, chi tiết và có giá trị:*
- **[Điểm 1]:** Giải thích chi tiết...
- **[Điểm 2]:** Giải thích chi tiết...
- ...

### 3. 💡 Phân tích sâu (Insights)
*Nếu là bài viết/tin tức:* Phân tích quan điểm, lập luận chính.
*Nếu là sản phẩm:* Phân tích ưu/nhược điểm hoặc tính năng nổi bật.

### 4. 📌 Kết luận
*1 câu chốt lại giá trị của nội dung này.*

### 5. ❓ Câu hỏi gợi ý (Discovery)
*Gợi ý 3 câu hỏi sâu để người dùng tìm hiểu thêm:*
- "Chi tiết về..."
- "So sánh với..."

LƯU Ý:
- KHÔNG viết quá ngắn. Hãy khai thác tối đa thông tin từ Context.
- Bỏ qua các thành phần điều hướng (menu, footer) vô nghĩa.
- Giọng văn: Chuyên nghiệp, khách quan, dễ hiểu.`,
    description: "Tóm tắt nội dung chính."
  },
  {
    id: "action",
    label: "Action Plan",
    icon: "icons/prompt-action.svg",
    surfaces: ['panel'],
    text: "Turn this into a short action plan: 3-6 steps, each with owner suggestion and expected output.",
    description: "Concise action plan."
  },
  {
    id: "qa",
    label: "Q&A",
    icon: "icons/prompt-qa.svg",
    surfaces: ['panel'],
    text: "List likely questions about this content with brief, confident answers.",
    description: "Quick Q&A."
  },
  {
    id: "image-search",
    label: "Find Images",
    icon: "icons/prompt-image.svg",
    surfaces: ['panel'],
    text: "Search Unsplash for high-quality images that fit the topic. Return 4-8 diverse options.",
    description: "Open Unsplash results for a keyword."
  }
];

// Rewrite style options for toolbox menu
window.ASKGPT_REWRITE_OPTIONS = [
  {
    id: "rewrite-polished",
    label: "Polished",
    icon: "icons/rewrite-polished.svg",
    text: "Rewrite the text in polished, natural, idiomatic English. Preserve the original meaning and all key terms. Ensure clarity, fluency, and conciseness."
  },
  {
    id: "rewrite-academic",
    label: "Academic (IELTS)",
    icon: "icons/rewrite-academic.svg",
    text: "Rewrite the text in clear, formal IELTS-style academic English. Use logical structure, precise vocabulary, and a balanced, objective tone. Ensure coherence, clarity, and strong argumentation."
  },
  {
    id: "rewrite-professional",
    label: "Professional",
    icon: "icons/rewrite-professional.svg",
    text: "Rewrite the text in concise, confident professional business English. Maintain a courteous, actionable, and results-oriented tone."
  },
  {
    id: "rewrite-shorten",
    label: "Shorten",
    icon: "icons/rewrite-shorten.svg",
    text: "Rewrite the text into a significantly shorter version while preserving the core meaning, essential facts, and key terminology."
  }
];