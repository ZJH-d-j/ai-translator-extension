// 后台服务：统一处理 OpenAI 兼容协议的 API 调用、token 统计与历史记录

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

// 调用 OpenAI 兼容的 chat/completions 接口，返回 { text, usage }
async function callAI(messages, maxTokens) {
  const { baseUrl, apiKey, model } = await getConfig();
  if (!apiKey) throw new Error('未配置 API Key，请先在管理面板填写');

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
  return { text: content.trim(), usage: data.usage || null };
}

// 累计 token 消耗
async function addTokenUsage(usage) {
  if (!usage) return;
  const { tokenStats = { prompt: 0, completion: 0, total: 0, count: 0 } } =
    await chrome.storage.local.get('tokenStats');
  tokenStats.prompt += usage.prompt_tokens || 0;
  tokenStats.completion += usage.completion_tokens || 0;
  tokenStats.total += usage.total_tokens || 0;
  tokenStats.count += 1;
  await chrome.storage.local.set({ tokenStats });
}

// 追加历史记录（最多保留 100 条，新的在前）
async function addHistoryEntry(entry) {
  const { history = [] } = await chrome.storage.local.get('history');
  history.unshift({ time: Date.now(), ...entry });
  if (history.length > 100) history.length = 100;
  await chrome.storage.local.set({ history });
}

// 调用 AI 并累计 token
async function run(messages, maxTokens) {
  const { text, usage } = await callAI(messages, maxTokens);
  await addTokenUsage(usage);
  return text;
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
  // 单段翻译：msg.text, msg.sourceLang('auto' 或语言名), msg.targetLang
  translate: msg => {
    const source = msg.sourceLang && msg.sourceLang !== 'auto'
      ? `以下${msg.sourceLang}文本` : '用户给出的文本（自动识别语言）';
    return run([
      { role: 'system', content: `你是专业翻译引擎。把${source}翻译成${msg.targetLang}，只输出译文，不要解释，不要添加引号。` },
      { role: 'user', content: msg.text }
    ]);
  },

  // 批量翻译（整页）：msg.text 为 <编号>文本 列表
  translateBatch: msg => run([
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

  // 网页总结：msg.text 为正文，msg.lang 为输出语言
  summarize: msg => run([
    { role: 'system', content: `你是网页内容总结助手。请用${msg.lang}总结用户给出的网页正文，输出 3-6 个要点（用 - 开头），最后给出一句话总评。语言精炼。` },
    { role: 'user', content: msg.text }
  ]),

  // 测试连接
  testConnection: () => run([
    { role: 'user', content: '回复"连接成功"四个字即可。' }
  ]),

  // 记录历史：msg.entry = { type, source, result }
  addHistory: msg => addHistoryEntry(msg.entry)
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg.type];
  if (!handler) return false;
  return handleAsync(handler)(msg, sender, sendResponse);
});
