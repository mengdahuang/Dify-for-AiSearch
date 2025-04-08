// 全局配置文件 - ChatGPT API版本
window.APP_CONFIG = {
    APP_NAME: 'TIDE AIQus',
    APP_LOGO: 'https://io.onenov.cn/file/202503022151313.png',
    APP_ICON: 'https://io.onenov.cn/file/202503022159026.ico',
    APP_TITLE: 'AI搜索',
    APP_SUB_TITLE: '没有广告，直达结果',
    APP_TIP: 'AI 驱动的搜索，提供更准确、更智能的结果',
    APP_DESCRIPTION: 'AI搜索是一款基于人工智能的搜索引擎，提供无广告、精准、高效的搜索体验。通过深度学习和自然语言处理技术，我们帮助用户快速找到真正有价值的信息，省去筛选广告和无关内容的时间。',
    APP_KEYWORDS: '人工智能搜索,AI搜索引擎,无广告搜索,智能检索,精准搜索,深度学习搜索,自然语言处理,信息检索,AI技术,搜索工具',
    FOOTER_COPYRIGHT: 'AI Search',
    ICP_RECORD: '',
    PUBLIC_SECURITY_FILING_NUMBER: '',
    APP_VERSION: '1.0.0',
    APP_URL: 'https://api.example.com/v1',  // Dify应用API地址 (非对话模式仍使用)
    APP_KEY: 'your-dify-app-key',           // Dify应用密钥 (非对话模式仍使用)
    SERPER_APIKEY: 'your-serper-api-key',     // Serper API密钥
    OPENAI_API_KEY: 'your-openai-api-key',    // OpenAI API密钥 (必填)
    OPENAI_API_URL: 'https://api.openai.com/v1', // OpenAI API地址
    SYSTEM_PROMPT: '你是一个有用的AI助手，请用中文回答问题', // 系统提示词
    // ChatGPT模型配置
    CHAT_MODELS: [
        { label: 'GPT-3.5', value: 'gpt-3.5-turbo', default: true },
        { label: 'GPT-4o', value: 'gpt-4o' },
        { label: 'GPT-4 Turbo', value: 'gpt-4-turbo-preview' },
        { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
        { label: 'Claude 3 Sonnet', value: 'claude-3-sonnet-20240229' },
        { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' }
    ],
    // 搜索选项配置
    SEARCH_OPTIONS: [
        { label: '全网', value: 'web', placeholder: '今天有什么可以帮你的？', default: true },
        { label: '资讯', value: 'news', placeholder: '了解一个新事物～' },
        { label: '学术', value: 'academic', placeholder: '想试试学术搜索吗？' },
        { label: '对话', value: 'chat', placeholder: '或者直接开始一个对话？' },
        { label: '写作', value: 'writing', placeholder: '需要写点什么呢？' },
        { label: '链接读取', value: 'link', placeholder: '尝试粘贴一个链接试试～' }
    ]
};