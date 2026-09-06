// 设置页逻辑：保存 / 读取 / 测试连接

const $ = id => document.getElementById(id);

const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash'
};

function setStatus(text, type) {
  const el = $('status');
  el.textContent = text || '';
  el.className = 'status' + (type ? ' ' + type : '');
}

async function load() {
  const cfg = await chrome.storage.sync.get(['baseUrl', 'apiKey', 'model']);
  $('baseUrl').value = cfg.baseUrl || DEFAULTS.baseUrl;
  $('apiKey').value = cfg.apiKey || '';
  $('model').value = cfg.model || DEFAULTS.model;
}

async function save(showOk) {
  await chrome.storage.sync.set({
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim()
  });
  if (showOk) setStatus('已保存', 'ok');
}

$('saveBtn').addEventListener('click', () => save(true));

$('testBtn').addEventListener('click', async () => {
  const btn = $('testBtn');
  btn.disabled = true;
  setStatus('正在测试连接…');
  try {
    await save(false);
    const resp = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'testConnection' }, r => {
        resolve(chrome.runtime.lastError
          ? { ok: false, error: chrome.runtime.lastError.message }
          : r || { ok: false, error: '无响应' });
      });
    });
    setStatus(resp.ok ? '连接成功：' + resp.text.slice(0, 50) : '连接失败：' + resp.error,
      resp.ok ? 'ok' : 'error');
  } finally {
    btn.disabled = false;
  }
});

load();
