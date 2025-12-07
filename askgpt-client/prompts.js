// Shared prompt registry for toolbar + sidepanel
window.ASKGPT_PROMPTS = [
  {
    id: "explain",
    label: "Explain",
    icon: "icons/prompt-explain.svg",
    surfaces: ['toolbar', 'panel'],
    text: "You are a senior AI tutor. Explain the selection in concise bullet steps, then end with a 2-sentence takeaway.",
    description: "Explain in bullets and a short takeaway."
  },
  {
    id: "polish-en",
    label: "Polish EN",
    icon: "icons/prompt-polish.svg",
    surfaces: ['toolbar', 'panel'],
    text: "Rewrite this in fluent, concise English. Keep technical terms accurate and tone professional.",
    description: "Polish to fluent, concise English."
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
    text: "Summarize the core facts into 3-5 crisp bullets. Lead with the most important points and quantify if possible.",
    description: "Short bullet summary (3-5)."
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
