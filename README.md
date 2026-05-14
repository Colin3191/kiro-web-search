[English](README_EN.md) | 中文

# kiro-web-search

将 [Kiro](https://kiro.dev) 内置的联网搜索能力封装为 CLI 工具，可在终端直接使用，也可通过 Skill 让 AI 编程助手自动调用。

## 前提

需要先安装并登录 Kiro，确保 `~/.aws/sso/cache/kiro-auth-token.json` 存在且未过期。

## 安装

```bash
# 安装 CLI
npm install -g kiro-web-search
```

安装 Skill（二选一）：

**方法 1：** 复制下面这句话发给你的 Agent，让它自己安装：

```
请从 https://raw.githubusercontent.com/Colin3191/kiro-web-search/main/skills/kiro-web-search/SKILL.md 下载并保存到你的 skills 目录
```

**方法 2：** 通过 npx skills 安装：

```bash
npx skills add colin3191/kiro-web-search
```

## CLI 用法

```bash
# 搜索
kiro-web-search search "今日A股行情"
kiro-web-search search "React 19 features" --json

# 帮助
kiro-web-search --help
kiro-web-search --version
```

## 子命令

### search — 搜索网页

返回标题、URL、摘要和发布时间。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `<query>` | string | 是 | 搜索关键词，最多 200 字符 |
| `--json` | flag | 否 | 输出原始 JSON 格式 |

## 工作原理

读取 Kiro 的认证令牌，调用 Amazon Q Developer 的 `InvokeMCP` API 执行搜索，将结果格式化输出到终端。

令牌刷新（Social 和 IdC）自动处理。

## 相关项目

- [kiro-proxy](https://github.com/Colin3191/kiro-proxy) — 将 Kiro 订阅内含的 Claude 模型代理为 OpenAI/Anthropic 兼容 API，可直接用于 Claude Code
