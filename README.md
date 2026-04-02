[English](README_EN.md) | 中文

# kiro-web-search

将 [Kiro](https://kiro.dev) 内置的联网搜索能力封装为 MCP server，可在 Claude Code、Cursor 或任何兼容 MCP 的客户端中使用。

## 前提

需要先安装并登录 Kiro，确保 `~/.aws/sso/cache/kiro-auth-token.json` 存在且未过期。

## 快速开始

在 `~/.claude.json`（全局）或 `.claude/settings.json`（项目级）中添加：

```json
{
  "mcpServers": {
    "kiro-web-search": {
      "command": "npx",
      "args": ["-y", "@colin3191/kiro-web-search"]
    }
  }
}
```

## 可用工具

### web_search — 搜索网页

返回标题、URL、摘要和发布时间。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 搜索关键词，最多 200 字符 |

### web_fetch — 抓取网页内容

抓取指定 URL 的页面并用 Readability 提取正文。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | 是 | HTTPS URL |
| `mode` | string | 否 | `"truncated"`（默认，前 8KB）、`"full"` 或 `"selective"` |
| `searchPhrase` | string | 否 | 仅在 mode 为 `"selective"` 时必填 |

## 工作原理

读取 Kiro 的认证令牌，调用 Amazon Q Developer 的 `InvokeMCP` API 执行 `web_search`，通过 MCP stdio 传输返回格式化结果。`web_fetch` 在本地通过 HTTP 请求抓取页面并提取正文。

令牌刷新（Social 和 IdC）自动处理。

## 相关项目

- [kiro-proxy](https://github.com/Colin3191/kiro-proxy) — 将 Kiro 订阅内含的 Claude 模型代理为 OpenAI/Anthropic 兼容 API，可直接用于 Claude Code
