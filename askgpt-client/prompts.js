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

