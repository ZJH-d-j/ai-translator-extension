// 后台服务：统一处理 OpenAI 兼容协议的 API 调用

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v4-flash'
};

async function getConfig() {
  const cfg = await chrome.storage.sync.get(['baseUrl', 'apiKey', 'model']);
  return {
    baseUrl: (cfg.baseUrl || DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || DEFAULT_CONFIG.apiKey,
    model: cfg.model || DEFAULT_CONFIG.model
  };
}

// 调用 OpenAI 兼容的 chat/completions 接口
async function callAI(messages, maxTokens) {
  const { baseUrl, apiKey, model } = await getConfig();
  if (!apiKey) throw new Error('未配置 API Key，请先在设置页填写');

  const url = baseUrl.endsWith('/chat/completions') ? baseUrl : baseUrl + '/chat/completions';
  const body = { model, messages };
  if (maxTokens) body.max_tokens = maxTokens;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`API 请求失败 (${resp.status}): ${detail.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('API 返回内容为空');
  return content.trim();
}

function handleAsync(fn) {
  return (msg, sender, sendResponse) => {
    fn(msg).then(
      text => sendResponse({ ok: true, text }),
      err => sendResponse({ ok: false, error: err.message || String(err) })
    );
    return true; // 异步响应
  };
}

const handlers = {
  // 单段翻译：msg.text, msg.targetLang
  translate: msg => callAI([
    { role: 'system', content: `你是专业翻译引擎。把用户给出的文本翻译成${msg.targetLang}，只输出译文，不要解释，不要添加引号。` },
    { role: 'user', content: msg.text }
  ]),

  // 批量翻译（整页）：msg.items 为字符串数组，返回用 <|> 分隔的译文
  translateBatch: msg => callAI([
    {
      role: 'system',
      content: `你是专业翻译引擎。用户会给出多段用编号 <数字> 标记的文本，请把每一段翻译成${msg.targetLang}。
严格要求：
1. 保持原有编号格式 <数字> 不变，每段译文单独一行，编号与译文一一对应；
2. 只输出译文，不要解释；
3. 保留原文中的 HTML 标签和占位符不变。`
    },
    { role: 'user', content: msg.text }
  ], 8192),

  // 网页总结：msg.text 为正文
  summarize: msg => callAI([
    { role: 'system', content: `你是网页内容总结助手。请用${msg.lang}总结用户给出的网页正文，输出 3-6 个要点（用 - 开头），最后给出一句话总评。语言精炼。` },
    { role: 'user', content: msg.text }
  ]),

  // 测试连接
  testConnection: () => callAI([
    { role: 'user', content: '回复"连接成功"四个字即可。' }
  ])
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg.type];
  if (!handler) return false;
  return handleAsync(handler)(msg, sender, sendResponse);
});
