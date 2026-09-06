// 内容脚本：划词翻译、全页翻译、网页总结的页面侧实现

(() => {
  if (window.__aiTransLoaded) return;
  window.__aiTransLoaded = true;

  const ROOT_CLASS = 'ai-trans-root';
  let selectBtn = null;   // 划词浮动按钮
  let resultPanel = null; // 结果浮层
  let progressBar = null; // 全页翻译进度条
  let pageTranslated = false;
  const translatedSpans = [];

  // ---------- 工具 ----------

  // 根据用户语言设置和文本内容确定翻译方向
  // 自动模式下：文本已是目标语言时做中英互译兜底
  async function resolveDirection(sample) {
    const cfg = await chrome.storage.sync.get(['sourceLang', 'targetLang']);
    const source = cfg.sourceLang || 'auto';
    const target = cfg.targetLang || '中文';
    if (source !== 'auto') return { sourceLang: source, targetLang: target };
    const isZh = /[一-龥]/.test(sample);
    if (target === '中文' && isZh) return { sourceLang: 'auto', targetLang: '英语' };
    if (target === '英语' && !isZh) return { sourceLang: 'auto', targetLang: '中文' };
    return { sourceLang: 'auto', targetLang: target };
  }

  function recordHistory(type, source, result) {
    sendMessage({ type: 'addHistory', entry: { type, source, result } });
  }

  function sendMessage(msg) {
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

  function removeEl(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ---------- 划词翻译 ----------

  function showSelectButton(x, y, text) {
    hideSelectUI();
    selectBtn = document.createElement('div');
    selectBtn.className = ROOT_CLASS + ' ai-trans-select-btn';
    selectBtn.textContent = '译';
    selectBtn.style.left = x + 'px';
    selectBtn.style.top = (y + 12) + 'px';
    // 用 mousedown 阻止点击时选区被清掉
    selectBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      translateSelection(text, x, y);
    });
    document.documentElement.appendChild(selectBtn);
  }

  function hideSelectUI() {
    removeEl(selectBtn);
    selectBtn = null;
  }

  async function translateSelection(text, x, y) {
    hideSelectUI();
    showResultPanel('翻译中…', x, y);
    const dir = await resolveDirection(text);
    const resp = await sendMessage({ type: 'translate', text, sourceLang: dir.sourceLang, targetLang: dir.targetLang });
    if (resp.ok) {
      showResultPanel(resp.text, x, y, text);
      recordHistory('划词翻译', text.slice(0, 200), resp.text.slice(0, 500));
    } else {
      showResultPanel('翻译失败：' + resp.error, x, y, text, true);
    }
  }

  function showResultPanel(content, x, y, original, isError) {
    removeEl(resultPanel);
    resultPanel = document.createElement('div');
    resultPanel.className = ROOT_CLASS + ' ai-trans-panel';

    const header = document.createElement('div');
    header.className = 'ai-trans-panel-header';
    header.innerHTML = '<span class="ai-trans-panel-title">AI 翻译</span><span class="ai-trans-panel-close">×</span>';
    header.querySelector('.ai-trans-panel-close').addEventListener('mousedown', e => {
      e.preventDefault();
      removeEl(resultPanel);
      resultPanel = null;
    });

    const bodyEl = document.createElement('div');
    bodyEl.className = 'ai-trans-panel-body' + (isError ? ' ai-trans-error' : '');
    if (original) {
      const orig = document.createElement('div');
      orig.className = 'ai-trans-panel-original';
      orig.textContent = original;
      bodyEl.appendChild(orig);
    }
    const result = document.createElement('div');
    result.className = 'ai-trans-panel-result';
    result.textContent = content;
    bodyEl.appendChild(result);

    resultPanel.appendChild(header);
    resultPanel.appendChild(bodyEl);

    // 防止超出视口右侧
    const maxX = window.innerWidth - 340;
    resultPanel.style.left = Math.max(8, Math.min(x, maxX)) + 'px';
    resultPanel.style.top = (y + 12) + 'px';
    document.documentElement.appendChild(resultPanel);
  }

  document.addEventListener('mouseup', e => {
    if (e.target.closest && e.target.closest('.' + ROOT_CLASS)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text.length >= 2 && text.length <= 2000) {
        showSelectButton(e.clientX, e.clientY, text);
      } else {
        hideSelectUI();
      }
    }, 10);
  });

  document.addEventListener('mousedown', e => {
    if (selectBtn && e.target !== selectBtn) hideSelectUI();
    if (resultPanel && !resultPanel.contains(e.target)) {
      removeEl(resultPanel);
      resultPanel = null;
    }
  });

  // ---------- 全页翻译 ----------

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'INPUT', 'SELECT', 'OPTION', 'SVG']);

  function collectTextNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue;
        if (!text || text.trim().length < 2) return NodeFilter.FILTER_REJECT;
        const el = node.parentElement;
        if (!el || SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.closest('.' + ROOT_CLASS)) return NodeFilter.FILTER_REJECT;
        // 跳过纯数字/符号
        if (!/[a-zA-Z一-鿿]/.test(text)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  // 按长度把文本节点分批
  function makeBatches(nodes, maxLen) {
    const batches = [];
    let current = [];
    let len = 0;
    for (const node of nodes) {
      const t = node.nodeValue.trim();
      if (len + t.length > maxLen && current.length) {
        batches.push(current);
        current = [];
        len = 0;
      }
      current.push(node);
      len += t.length;
    }
    if (current.length) batches.push(current);
    return batches;
  }

  // 解析 <1>译文 <2>译文 格式的批量返回
  function parseBatchResult(text, count) {
    const map = {};
    const re = /<(\d+)>([\s\S]*?)(?=<\d+>|$)/g;
    let m;
    while ((m = re.exec(text))) {
      map[Number(m[1])] = m[2].trim();
    }
    return map;
  }

  function showProgress(text, pct) {
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.className = ROOT_CLASS + ' ai-trans-progress';
      document.documentElement.appendChild(progressBar);
    }
    progressBar.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = text + (pct != null ? ` ${Math.round(pct * 100)}%` : '');
    progressBar.appendChild(label);
    if (pct != null && pct >= 1) {
      const restore = document.createElement('button');
      restore.className = 'ai-trans-restore-btn';
      restore.textContent = '还原原文';
      restore.addEventListener('click', restorePage);
      progressBar.appendChild(restore);
    }
  }

  function restorePage() {
    translatedSpans.forEach(s => removeEl(s));
    translatedSpans.length = 0;
    removeEl(progressBar);
    progressBar = null;
    pageTranslated = false;
  }

  async function translatePage() {
    if (pageTranslated) return;
    pageTranslated = true;

    const nodes = collectTextNodes();
    if (!nodes.length) {
      showProgress('未找到可翻译内容', 1);
      return;
    }

    // 目标语言：按用户设置，自动模式下页面主体是中文则译成英文，反之译成中文
    const pageText = nodes.slice(0, 50).map(n => n.nodeValue).join('');
    const dir = await resolveDirection(pageText);
    const targetLang = dir.targetLang;

    const batches = makeBatches(nodes, 4000);
    showProgress('正在翻译…', 0);

    // 多批次并行请求，显著减少等待时间；单批失败不影响其他批次
    let done = 0, failed = 0;
    async function runBatch(batch) {
      const numbered = batch.map((n, idx) => `<${idx + 1}>${n.nodeValue.trim()}`).join('\n');
      try {
        const resp = await sendMessage({ type: 'translateBatch', text: numbered, targetLang });
        if (!resp.ok) throw new Error(resp.error);
        const map = parseBatchResult(resp.text, batch.length);
        batch.forEach((node, idx) => {
          const trans = map[idx + 1];
          if (!trans || !node.parentNode) return;
          const span = document.createElement('span');
          span.className = ROOT_CLASS + ' ai-trans-inline';
          span.textContent = trans;
          node.parentNode.insertBefore(span, node.nextSibling);
          translatedSpans.push(span);
        });
      } catch (err) {
        failed++;
      }
      done++;
      showProgress('正在翻译…', done / batches.length);
    }

    const CONCURRENCY = 4;
    const queue = [...batches];
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      async () => { while (queue.length) await runBatch(queue.shift()); }
    );
    await Promise.all(workers);

    showProgress(failed ? `翻译完成（${failed} 个批次失败，相应段落保留原文）` : '翻译完成', 1);
    if (failed < batches.length) {
      recordHistory('全页翻译', `${location.hostname}（${nodes.length} 段）`, `译为${targetLang}`);
    }
  }

  // ---------- 网页总结 ----------

  function getPageMainText() {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,svg,nav,footer,header,.' + ROOT_CLASS).forEach(el => el.remove());
    return (clone.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 6000);
  }

  async function summarizePage() {
    showSummaryPanel('正在生成总结…', true);
    const text = getPageMainText();
    if (text.length < 50) {
      showSummaryPanel('页面内容太少，无法总结');
      return;
    }
    const resp = await sendMessage({ type: 'summarize', text, lang: '中文' });
    showSummaryPanel(resp.ok ? resp.text : '总结失败：' + resp.error);
    if (resp.ok) recordHistory('网页总结', document.title, resp.text.slice(0, 500));
  }

  let summaryPanel = null;

  function showSummaryPanel(content, loading) {
    removeEl(summaryPanel);
    summaryPanel = document.createElement('div');
    summaryPanel.className = ROOT_CLASS + ' ai-trans-summary';

    const header = document.createElement('div');
    header.className = 'ai-trans-panel-header';
    header.innerHTML = '<span class="ai-trans-panel-title">网页总结</span><span class="ai-trans-panel-close">×</span>';
    header.querySelector('.ai-trans-panel-close').addEventListener('click', () => {
      removeEl(summaryPanel);
      summaryPanel = null;
    });

    const bodyEl = document.createElement('div');
    bodyEl.className = 'ai-trans-summary-body' + (loading ? ' ai-trans-loading' : '');
    bodyEl.textContent = content;

    summaryPanel.appendChild(header);
    summaryPanel.appendChild(bodyEl);
    document.documentElement.appendChild(summaryPanel);
  }

  // ---------- 消息入口（来自 popup） ----------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'translatePage') {
      translatePage();
      sendResponse({ ok: true });
    } else if (msg.type === 'restorePage') {
      restorePage();
      sendResponse({ ok: true });
    } else if (msg.type === 'summarizePage') {
      summarizePage();
      sendResponse({ ok: true });
    } else if (msg.type === 'ping') {
      sendResponse({ ok: true, pageTranslated });
    }
    return false;
  });

  // 测试钩子：供自动化测试在隔离世界中调用
  window.__aiTransTest = { translatePage, restorePage, summarizePage };
})();
