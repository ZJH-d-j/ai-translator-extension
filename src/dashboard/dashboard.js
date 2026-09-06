// 管理面板逻辑：API 配置 / 语言设置 / token 统计 / 历史记录

const $ = id => document.getElementById(id);

const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  sourceLang: 'auto',
  targetLang: '中文'
};

function setStatus(id, text, type) {
  const el = $(id);
  el.textContent = text || '';
  el.className = 'status' + (type ? ' ' + type : '');
}

// ---------- API 配置 ----------

async function loadConfig() {
  const cfg = await chrome.storage.sync.get(['baseUrl', 'apiKey', 'model']);
  $('baseUrl').value = cfg.baseUrl || DEFAULTS.baseUrl;
  $('apiKey').value = cfg.apiKey || '';
  $('model').value = cfg.model || DEFAULTS.model;
}

async function saveConfig(showOk) {
  await chrome.storage.sync.set({
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim()
  });
  if (showOk) setStatus('apiStatus', '已保存', 'ok');
}

$('saveBtn').addEventListener('click', () => saveConfig(true));

$('testBtn').addEventListener('click', async () => {
  const btn = $('testBtn');
  btn.disabled = true;
  setStatus('apiStatus', '正在测试连接…');
  try {
    await saveConfig(false);
    const resp = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'testConnection' }, r => {
        resolve(chrome.runtime.lastError
          ? { ok: false, error: chrome.runtime.lastError.message }
          : r || { ok: false, error: '无响应' });
      });
    });
    setStatus('apiStatus', resp.ok ? '连接成功：' + resp.text.slice(0, 50) : '连接失败：' + resp.error,
      resp.ok ? 'ok' : 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------- 语言设置 ----------

async function loadLang() {
  const cfg = await chrome.storage.sync.get(['sourceLang', 'targetLang']);
  $('sourceLang').value = cfg.sourceLang || DEFAULTS.sourceLang;
  $('targetLang').value = cfg.targetLang || DEFAULTS.targetLang;
}

$('saveLangBtn').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    sourceLang: $('sourceLang').value,
    targetLang: $('targetLang').value
  });
  setStatus('langStatus', '已保存', 'ok');
});

// ---------- Token 统计 ----------

async function loadStats() {
  const { tokenStats = { prompt: 0, completion: 0, total: 0, count: 0 } } =
    await chrome.storage.local.get('tokenStats');
  $('statTotal').textContent = tokenStats.total.toLocaleString();
  $('statPrompt').textContent = tokenStats.prompt.toLocaleString();
  $('statCompletion').textContent = tokenStats.completion.toLocaleString();
  $('statCount').textContent = tokenStats.count.toLocaleString();
}

$('resetStatsBtn').addEventListener('click', async () => {
  await chrome.storage.local.set({ tokenStats: { prompt: 0, completion: 0, total: 0, count: 0 } });
  loadStats();
});

// ---------- 历史记录 ----------

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get('history');
  const list = $('historyList');
  if (!history.length) {
    list.innerHTML = '<div class="history-empty">暂无翻译记录</div>';
    return;
  }
  list.innerHTML = history.map(h => `
    <div class="history-item">
      <div class="history-meta">
        <span class="history-type">${escapeHtml(h.type || '翻译')}</span>
        <span class="history-time">${formatTime(h.time)}</span>
      </div>
      <div class="history-source">${escapeHtml(h.source || '')}</div>
      <div class="history-result">${escapeHtml(h.result || '')}</div>
    </div>
  `).join('');
}

$('clearHistoryBtn').addEventListener('click', async () => {
  await chrome.storage.local.set({ history: [] });
  loadHistory();
});

// 页面打开期间，数据变化时实时刷新统计和历史
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tokenStats) loadStats();
  if (area === 'local' && changes.history) loadHistory();
});

loadConfig();
loadLang();
loadStats();
loadHistory();
