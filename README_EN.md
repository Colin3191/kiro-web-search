English | [中文](README.md)

# kiro-web-search

MCP server that exposes [Kiro](https://kiro.dev)'s built-in web search as a tool for Claude Code, Cursor, or any MCP-compatible client.

## Prerequisites

Install and log in to Kiro so that `~/.aws/sso/cache/kiro-auth-token.json` exists and is valid.

## Quick Start

```bash
npx @colin3191/kiro-web-search
```

## Claude Code Integration

Add to `~/.claude.json` (global) or `.claude/settings.json` (project-level):

```json
{
  "mcpServers": {
    "kiro-web-search": {
      "command": "npx",
      "args": ["@colin3191/kiro-web-search"]
    }
  }
}
```

## Available Tools

### web_search — Search the web

Returns titles, URLs, snippets, and publication dates.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query, max 200 characters |

### web_fetch — Fetch web page content

Fetches a URL and extracts readable content using Readability.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | HTTPS URL to fetch |
| `mode` | string | No | `"truncated"` (default, first 8KB), `"full"`, or `"selective"` |
| `searchPhrase` | string | No | Required when mode is `"selective"` |

## How It Works

Reads Kiro's auth token, calls Amazon Q Developer's `InvokeMCP` API to execute `web_search`, and returns formatted results over MCP stdio transport. `web_fetch` fetches pages locally via HTTP and extracts content using Readability.

Token refresh (Social and IdC) is handled automatically.

## Related Projects

- [kiro-proxy](https://github.com/Colin3191/kiro-proxy) — Proxy Kiro's bundled Claude models as OpenAI/Anthropic-compatible APIs for use with Claude Code
