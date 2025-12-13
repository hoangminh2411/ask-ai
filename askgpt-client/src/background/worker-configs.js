/**
 * Worker Configuration System
 * ===========================
 * Defines all AI workers with their capabilities, strengths, and collaboration settings.
 * ChatGPT serves as the Main Worker (Central Brain) that coordinates all others.
 * 
 * Version: 1.0
 */

// ============================================
// WORKER STATUS ENUM
// ============================================
const WorkerStatus = {
    ONLINE: 'online',       // Worker is active and ready
    OFFLINE: 'offline',     // Worker is not enabled
    BUSY: 'busy',           // Worker is processing a task
    CONNECTING: 'connecting', // Worker is being initialized
    ERROR: 'error'          // Worker encountered an error
};

// ============================================
// WORKER ROLE TYPES
// ============================================
const WorkerRole = {
    MAIN: 'main',           // Central brain - receives all user requests first
    SPECIALIST: 'specialist' // Specialized worker - called by main worker when needed
};

// ============================================
// CAPABILITY TAGS
// ============================================
const Capabilities = {
    CODING: 'coding',
    ANALYSIS: 'analysis',
    CREATIVE_WRITING: 'creative_writing',
    MATH: 'math',
    REAL_TIME_DATA: 'real_time_data',
    WEB_SEARCH: 'web_search',
    IMAGE_ANALYSIS: 'image_analysis',
    IMAGE_GENERATION: 'image_generation',
    VIDEO_GENERATION: 'video_generation',
    MULTIMODAL: 'multimodal',
    LONG_CONTEXT: 'long_context',
    TWITTER_DATA: 'twitter_data',
    MICROSOFT_365: 'microsoft_365',
    CITATIONS: 'citations'
};

// ============================================
// WORKER CONFIGURATIONS
// ============================================
const WORKER_CONFIGS = {
    chatgpt_web: {
        id: 'chatgpt_web',
        name: 'ChatGPT',
        shortName: 'GPT',
        icon: '🤖',
        color: '#10a37f',
        url: 'https://chatgpt.com',
        matchUrl: 'https://chatgpt.com/*',

        // Worker Role & Status
        role: WorkerRole.MAIN,  // ChatGPT is the MAIN WORKER (brain)
        status: WorkerStatus.OFFLINE,
        enabled: false, // Default OFF - user must enable

        // Capabilities
        strengths: [
            Capabilities.CODING,
            Capabilities.ANALYSIS,
            Capabilities.CREATIVE_WRITING,
            Capabilities.MATH,
            Capabilities.LONG_CONTEXT
        ],
        weaknesses: [
            Capabilities.REAL_TIME_DATA,
            Capabilities.TWITTER_DATA
        ],

        capabilities: {
            web_browse: true,  // Can browse web with plugins
            file_upload: true,
            image_analysis: true,
            code_execution: true,
            plugins: ['dalle', 'browsing', 'code_interpreter']
        },

        // Collaboration settings
        canCollaborate: true,
        canDelegate: true,      // Can assign tasks to other workers
        canReceiveDelegation: false,  // Main worker doesn't receive delegations

        // Display settings
        displayOrder: 1,
        showInPanel: true,
        badges: ['Main Worker', 'Brain']
    },

    gemini_web: {
        id: 'gemini_web',
        name: 'Gemini',
        shortName: 'Gem',
        icon: '✨',
        color: '#4285f4',
        url: 'https://gemini.google.com/app',
        matchUrl: 'https://gemini.google.com/*',

        role: WorkerRole.SPECIALIST,
        status: WorkerStatus.OFFLINE,
        enabled: false, // Default OFF - user must enable

        strengths: [
            Capabilities.MULTIMODAL,
            Capabilities.LONG_CONTEXT,
            Capabilities.IMAGE_ANALYSIS,
            Capabilities.VIDEO_GENERATION,
            Capabilities.WEB_SEARCH
        ],
        weaknesses: [
            Capabilities.TWITTER_DATA
        ],

        capabilities: {
            web_browse: true,
            file_upload: true,
            image_analysis: true,
            image_generation: true,
            video_generation: true,
            google_integration: true
        },

        canCollaborate: true,
        canDelegate: false,
        canReceiveDelegation: true,

        displayOrder: 2,
        showInPanel: true,
        badges: ['Multimodal', 'Vision']
    },

    perplexity_web: {
        id: 'perplexity_web',
        name: 'Perplexity',
        shortName: 'Pplx',
        icon: '🔍',
        color: '#1fb8cd',
        url: 'https://www.perplexity.ai',
        matchUrl: 'https://www.perplexity.ai/*',

        role: WorkerRole.SPECIALIST,
        status: WorkerStatus.OFFLINE,
        enabled: false, // Default OFF - user must enable

        strengths: [
            Capabilities.REAL_TIME_DATA,
            Capabilities.WEB_SEARCH,
            Capabilities.CITATIONS,
            Capabilities.ANALYSIS
        ],
        weaknesses: [
            Capabilities.CODING,
            Capabilities.CREATIVE_WRITING,
            Capabilities.IMAGE_GENERATION
        ],

        capabilities: {
            web_browse: true,
            real_time_search: true,
            citations: true,
            news_access: true,
            file_upload: true
        },

        canCollaborate: true,
        canDelegate: false,
        canReceiveDelegation: true,

        displayOrder: 3,
        showInPanel: true,
        badges: ['Real-time', 'Search']
    },

    copilot_web: {
        id: 'copilot_web',
        name: 'Copilot',
        shortName: 'Cop',
        icon: '🚀',
        color: '#0078d4',
        url: 'https://copilot.microsoft.com',
        matchUrl: 'https://copilot.microsoft.com/*',

        role: WorkerRole.SPECIALIST,
        status: WorkerStatus.OFFLINE,
        enabled: false,  // Disabled by default, user can enable

        strengths: [
            Capabilities.MICROSOFT_365,
            Capabilities.CODING,
            Capabilities.WEB_SEARCH,
            Capabilities.IMAGE_GENERATION
        ],
        weaknesses: [
            Capabilities.TWITTER_DATA,
            Capabilities.VIDEO_GENERATION
        ],

        capabilities: {
            web_browse: true,
            microsoft_365: true,
            image_generation: true,  // DALL-E 3
            windows_integration: true
        },

        canCollaborate: true,
        canDelegate: false,
        canReceiveDelegation: true,

        displayOrder: 4,
        showInPanel: true,
        badges: ['Microsoft', 'Office']
    },

    grok_web: {
        id: 'grok_web',
        name: 'Grok',
        shortName: 'Grok',
        icon: '𝕏',
        color: '#000000',
        url: 'https://grok.x.ai',
        matchUrl: 'https://grok.x.ai/*',

        role: WorkerRole.SPECIALIST,
        status: WorkerStatus.OFFLINE,
        enabled: false,  // Disabled by default

        strengths: [
            Capabilities.TWITTER_DATA,
            Capabilities.REAL_TIME_DATA,
            Capabilities.CREATIVE_WRITING
        ],
        weaknesses: [
            Capabilities.CODING,
            Capabilities.LONG_CONTEXT,
            Capabilities.IMAGE_GENERATION
        ],

        capabilities: {
            twitter_access: true,
            real_time_trends: true,
            web_browse: true
        },

        canCollaborate: true,
        canDelegate: false,
        canReceiveDelegation: true,

        displayOrder: 5,
        showInPanel: true,
        badges: ['Twitter/X', 'Trends']
    }
};

// ============================================
// MAIN WORKER SYSTEM PROMPT
// ============================================
const MAIN_WORKER_SYSTEM_PROMPT = `
You are the MAIN WORKER (Central Brain) of an AI Assistant system called "AI Supporter".

## YOUR ROLE:
- You receive all user requests first
- Analyze what capabilities are needed to fulfill the request
- Decide if YOU can handle it OR if you need help from other specialist workers
- Coordinate multi-step tasks involving multiple workers
- Synthesize final responses when tasks involve multiple workers

## AVAILABLE SPECIALIST WORKERS:

1. **Gemini** (ID: gemini_web)
   - Strengths: Multimodal (images, video), Large context window, Google ecosystem
   - Use for: Image analysis, video creation, long documents, Google services

2. **Perplexity** (ID: perplexity_web) 
   - Strengths: Real-time web search, Current news & data, Citations & sources
   - Use for: Stock prices, weather, news, current events, fact-checking with sources

3. **Grok** (ID: grok_web)
   - Strengths: Twitter/X data access, Real-time trends, Witty responses
   - Use for: Social media trends, Twitter content, viral topics

4. **Copilot** (ID: copilot_web)
   - Strengths: Microsoft 365 integration, Windows integration, DALL-E
   - Use for: Office documents, Microsoft ecosystem tasks, image generation

## RESPONSE BEHAVIOR:

### If you CAN handle the task yourself:
Just respond normally with your answer.

### If you NEED another worker's help:
Include this JSON block in your response:

\`\`\`delegate
{
  "action": "delegate",
  "target_worker": "perplexity_web",
  "reason": "Need real-time stock data that I don't have access to",
  "query": "Current VNM stock price Vietnam today",
  "context": "User wants to know the stock price"
}
\`\`\`

After the delegation result comes back, I will synthesize the final answer for the user.

### If you need MULTIPLE workers sequentially:

\`\`\`pipeline
{
  "action": "pipeline",
  "steps": [
    {"worker": "perplexity_web", "task": "Search for current data about X"},
    {"worker": "gemini_web", "task": "Create visualization of the data"},
    {"worker": "self", "task": "Summarize and present to user"}
  ]
}
\`\`\`

## IMPORTANT RULES:
1. Always try to help the user first with your own capabilities
2. Only delegate when the task truly requires another worker's specialty
3. Be transparent about delegation - tell the user you're getting help
4. When delegating, provide clear context and specific queries
5. Always synthesize and present the final answer yourself
`;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get worker by ID
 */
function getWorker(workerId) {
    return WORKER_CONFIGS[workerId] || null;
}

/**
 * Get the main worker config
 */
function getMainWorker() {
    return Object.values(WORKER_CONFIGS).find(w => w.role === WorkerRole.MAIN);
}

/**
 * Get all specialist workers
 */
function getSpecialistWorkers() {
    return Object.values(WORKER_CONFIGS).filter(w => w.role === WorkerRole.SPECIALIST);
}

/**
 * Get all enabled workers
 */
function getEnabledWorkers() {
    return Object.values(WORKER_CONFIGS).filter(w => w.enabled);
}

/**
 * Get all workers sorted by display order
 */
function getAllWorkersSorted() {
    return Object.values(WORKER_CONFIGS).sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Find best worker for a specific capability
 */
function findBestWorkerForCapability(capability) {
    const workers = Object.values(WORKER_CONFIGS)
        .filter(w => w.enabled && w.strengths.includes(capability))
        .sort((a, b) => {
            // Main worker has lower priority for delegation
            if (a.role === WorkerRole.MAIN) return 1;
            if (b.role === WorkerRole.MAIN) return -1;
            return a.displayOrder - b.displayOrder;
        });

    return workers[0] || null;
}

/**
 * Check if a task needs delegation based on keywords
 */
function analyzeTaskForDelegation(taskText) {
    const lowerText = taskText.toLowerCase();

    const delegationSignals = {
        perplexity_web: [
            'giá cổ phiếu', 'stock price', 'giá vàng', 'gold price',
            'thời tiết', 'weather', 'tin tức', 'news', 'hôm nay', 'today',
            'hiện tại', 'current', 'real-time', 'mới nhất', 'latest'
        ],
        gemini_web: [
            'tạo video', 'create video', 'phân tích ảnh', 'analyze image',
            'hình ảnh', 'image', 'video', 'multimodal', 'google'
        ],
        grok_web: [
            'twitter', 'tweet', 'x.com', 'trending', 'viral',
            'social media', 'mạng xã hội'
        ],
        copilot_web: [
            'microsoft', 'office', 'word', 'excel', 'powerpoint',
            'windows', 'outlook'
        ]
    };

    for (const [workerId, signals] of Object.entries(delegationSignals)) {
        for (const signal of signals) {
            if (lowerText.includes(signal)) {
                return {
                    shouldDelegate: true,
                    targetWorker: workerId,
                    matchedSignal: signal
                };
            }
        }
    }

    return { shouldDelegate: false, targetWorker: null, matchedSignal: null };
}

// ============================================
// EXPORT TO GLOBAL (Service Worker)
// ============================================
self.ASKGPT_WORKERS = {
    WORKER_CONFIGS,
    WorkerStatus,
    WorkerRole,
    Capabilities,
    MAIN_WORKER_SYSTEM_PROMPT,

    // Utility functions
    getWorker,
    getMainWorker,
    getSpecialistWorkers,
    getEnabledWorkers,
    getAllWorkersSorted,
    findBestWorkerForCapability,
    analyzeTaskForDelegation
};

console.log('[WorkerConfigs] Loaded', Object.keys(WORKER_CONFIGS).length, 'workers');
