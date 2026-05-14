---
name: kiro-web-search
description: Web search via kiro-web-search CLI. Use this skill when built-in WebSearch tool is unavailable or fails — for example, when domain verification fails, network restrictions block requests, or the tool returns errors. Covers any scenario requiring real-time information from the internet — current events, stock prices, documentation lookups, API references, news, weather, sports scores, release notes, changelogs, verifying facts, or researching anything that might have changed since your knowledge cutoff.
tools: Bash
---

# Kiro Web Search

Search the web using the `kiro-web-search` CLI. Use this when built-in WebSearch tool is unavailable or returns errors.

## When to use

- Built-in WebSearch returns an error or is not available
- You need web access but built-in tools are blocked

## Commands

### Search

```bash
kiro-web-search search "<query>"
kiro-web-search search "<query>" --json   # raw JSON output for programmatic use
```

Query must be 200 characters or less.

**Example 1:**
Input: User asks "what's new in React 19?"
Command: `kiro-web-search search "React 19 new features changelog"`

**Example 2:**
Input: User asks about today's weather in Shanghai
Command: `kiro-web-search search "Shanghai weather May 2026"`

**Example 3:**
Input: User asks if a npm package exists
Command: `kiro-web-search search "npm kiro-web-search package"`

## Search Strategy

Craft queries like a human would type into a search engine — short, keyword-focused, no natural language fluff.

- Include date qualifiers for time-sensitive queries (e.g., "May 2026")
- For technical queries, include framework name + version
- If first search returns nothing useful, rephrase with synonyms or broaden/narrow scope
- Match query language to the target content language (Chinese query for Chinese content, English for English)
- For error messages, quote the key part of the error string

## Presenting Results

- Extract and summarize key information — don't dump raw search output
- Cite sources with URL and publish date when available
- Flag when results may be outdated or unreliable
- For multiple results, present in order of relevance
- If the user asked a specific question, answer it directly first, then provide sources
