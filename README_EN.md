English | [中文](README.md)

# kiro-web-search

CLI tool that exposes [Kiro](https://kiro.dev)'s built-in web search capability for use in the terminal or automatically via AI coding agents with Skill.

## Prerequisites

Install and log in to Kiro so that `~/.aws/sso/cache/kiro-auth-token.json` exists and is valid.

## Installation

```bash
# Install CLI
npm install -g kiro-web-search
```

Install Skill (pick one):

**Option 1:** Copy the following message to your Agent and let it install:

```
Please download https://raw.githubusercontent.com/Colin3191/kiro-web-search/main/skills/kiro-web-search/SKILL.md and save it to your skills directory
```

**Option 2:** Via npx skills:

```bash
npx skills add colin3191/kiro-web-search
```

## CLI Usage

```bash
# Search
kiro-web-search search "latest React news"
kiro-web-search search "React 19 features" --json

# Help
kiro-web-search --help
kiro-web-search --version
```

## Commands

### search — Search the web

Returns titles, URLs, snippets, and publication dates.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<query>` | string | Yes | Search query, max 200 characters |
| `--json` | flag | No | Output raw JSON format |

## How It Works

Reads Kiro's auth token, calls Amazon Q Developer's `InvokeMCP` API to execute searches, and outputs formatted results to the terminal.

Token refresh (Social and IdC) is handled automatically.

## Related Projects

- [kiro-proxy](https://github.com/Colin3191/kiro-proxy) — Proxy Kiro's bundled Claude models as OpenAI/Anthropic-compatible APIs for use with Claude Code
