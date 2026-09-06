// Popup 逻辑：全页翻译 / 网页总结 / 快速翻译 / 设置入口

const $ = id => document.getElementById(id);

function setStatus(text, isError) {
  const el = $('status');
  el.textContent = text || '';
  el.className = 'status' + (isError ? ' error' : '');
}

function sendToBackground(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, resp => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(resp || { ok: false, error: '无响应' });
      }
    });
  });
}

// 向当前标签页的内容脚本发消息；若脚本未注入（如刷新前打开的页面），先注入再重试
async function sendToActiveTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('找不到当前标签页');
  if (/^(chrome|edge|about|chrome-extension):/.test(tab.url || '')) {
    throw new Error('浏览器内置页面不支持此功能');
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    // 内容脚本可能未注入，手动注入后重试
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['src/content/content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/content.js'] });
    return await chrome.tabs.sendMessage(tab.id, msg);
  }
}

function detectTargetLang(text) {
  return /[一-龥]/.test(text) ? '英语' : '中文';
}

async function checkConfig() {
  const cfg = await chrome.storage.sync.get(['apiKey']);
  $('configWarning').classList.toggle('hidden', !!cfg.apiKey);
}

async function withBusy(btn, fn) {
  btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    btn.disabled = false;
  }
}

$('translatePageBtn').addEventListener('click', () => withBusy($('translatePageBtn'), async () => {
  setStatus('正在翻译页面…');
  await sendToActiveTab({ type: 'translatePage' });
  setStatus('翻译任务已开始，请查看页面顶部进度');
  setTimeout(() => window.close(), 600);
}));

$('summarizePageBtn').addEventListener('click', () => withBusy($('summarizePageBtn'), async () => {
  setStatus('正在生成总结…');
  await sendToActiveTab({ type: 'summarizePage' });
  setStatus('总结面板已在页面右侧打开');
  setTimeout(() => window.close(), 600);
}));

$('quickTranslateBtn').addEventListener('click', () => withBusy($('quickTranslateBtn'), async () => {
  const text = $('quickInput').value.trim();
  const result = $('quickResult');
  if (!text) {
    setStatus('请输入要翻译的文本', true);
    return;
  }
  setStatus('翻译中…');
  result.classList.add('hidden');
  const resp = await sendToBackground({ type: 'translate', text, targetLang: detectTargetLang(text) });
  result.classList.remove('hidden');
  result.classList.toggle('error', !resp.ok);
  result.textContent = resp.ok ? resp.text : '翻译失败：' + resp.error;
  setStatus(resp.ok ? '' : resp.error, !resp.ok);
}));

$('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('goSettings').addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

checkConfig();
