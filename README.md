# AI 网页翻译（Edge / Chrome 扩展）

基于 OpenAI 兼容协议的网页翻译插件，支持全页翻译、划词翻译和网页总结。

## 功能

- **全页翻译**：一键翻译整个网页，译文以蓝色显示在原文下方，可随时还原
- **划词翻译**：选中文字后点击"译"按钮，弹出译文浮层（自动识别中英文互译）
- **网页总结**：提取正文并在页面右侧生成要点总结
- **快速翻译**：popup 内置翻译输入框

## 安装

1. 打开 Edge，访问 `edge://extensions/`
2. 打开左侧"开发人员模式"
3. 点击"加载解压缩的扩展"，选择本项目目录

## 配置

首次使用请点击扩展图标 → 右上角 ⚙ 进入设置页，填写：

- **Base URL**：如 `https://api.deepseek.com`（可带 `/v1`，自动拼接 `/chat/completions`）
- **API Key**：你的密钥
- **模型**：如 `deepseek-v4-flash`

任何兼容 OpenAI Chat Completions 协议的服务均可使用。

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `manifest.json` | 扩展清单（MV3） |
| `src/background/background.js` | Service Worker，统一处理 API 调用 |
| `src/content/content.js` / `content.css` | 页面侧：划词、全页翻译、总结面板 |
| `src/popup/popup.html` / `popup.js` / `popup.css` | 弹窗：功能入口与快速翻译 |
| `src/options/options.html` / `options.js` | 设置页：Base URL / API Key / 模型 |
