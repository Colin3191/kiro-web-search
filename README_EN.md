English | [中文](README.md)

# kiro-web-search

CLI tool that exposes [Kiro](https://kiro.dev)'s built-in web search capability for use in the terminal or automatically via AI coding agents with Skill.

## Prerequisites

Install and log in to Kiro so that `~/.aws/sso/cache/kiro-auth-token.json` exists and is valid.

## Installation

```bash
# Install CLI
npm install -g kiro-web-search

# Install Skill
npx skills add colin3191/kiro-web-search
```

## CLI Usage

```bash
# Search
kiro-web-search search "latest React news"
kiro-web-search search "React 19 features" --json

# Fetch web page
kiro-web-search fetch https://example.com
kiro-web-search fetch https://example.com --mode full
kiro-web-search fetch https://example.com --mode selective --phrase "target content"

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

### fetch — Fetch web page content

Fetch and extract readable content from a URL using Readability.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<url>` | string | Yes | Complete HTTPS URL (no query parameters) |
| `--mode` | string | No | `truncated` (default, first 8KB), `full` (up to 10MB), `selective` (matching sections only) |
| `--phrase` | string | No | Required for selective mode. Only sections containing this phrase are returned |

## How It Works

Reads Kiro's auth token, calls Amazon Q Developer's `InvokeMCP` API to execute searches, and outputs formatted results to the terminal.

Token refresh (Social and IdC) is handled automatically.

## Related Projects

- [kiro-proxy](https://github.com/Colin3191/kiro-proxy) — Proxy Kiro's bundled Claude models as OpenAI/Anthropic-compatible APIs for use with Claude Code
