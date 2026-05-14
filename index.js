#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CodeWhispererStreaming, InvokeMCPCommand, MCPMethod } from '@aws/codewhisperer-streaming-client';
import crypto from 'crypto';
import os from 'os';
import { z } from 'zod';
import { getAccessToken } from './token-reader.js';
import { webFetch } from './web-fetch.js';

const KIRO_VERSION = process.env.KIRO_VERSION || '0.11.107';
const REGION_ENDPOINTS = {
  'us-east-1': 'https://q.us-east-1.amazonaws.com',
  'eu-west-1': 'https://q.eu-west-1.amazonaws.com',
  'ap-southeast-1': 'https://q.ap-southeast-1.amazonaws.com',
  'ap-northeast-1': 'https://q.ap-northeast-1.amazonaws.com',
  'eu-central-1': 'https://q.eu-central-1.amazonaws.com',
};

function regionFromArn(arn) {
  if (!arn) return null;
  const parts = arn.split(':');
  return parts.length >= 4 ? parts[3] : null;
}

let cachedClient = null;
let cachedToken = null;

function getClient(accessToken, { profileArn, authMethod } = {}) {
  if (cachedClient && cachedToken === accessToken) return cachedClient;

  const region = regionFromArn(profileArn) || 'us-east-1';
  const endpoint = REGION_ENDPOINTS[region] || `https://q.${region}.amazonaws.com`;

  const client = new CodeWhispererStreaming({
    region, endpoint,
    token: { token: accessToken },
    customUserAgent: `KiroIDE ${KIRO_VERSION} ${os.hostname()}`,
  });

  client.middlewareStack.add(
    (next) => async (args) => {
      args.request.headers = { ...args.request.headers, 'x-amzn-codewhisperer-optout': 'true' };
      return next(args);
    },
    { step: 'build', name: 'optOutHeader' }
  );
  if (authMethod === 'external_idp') {
    client.middlewareStack.add(
      (next) => async (args) => {
        args.request.headers = { ...args.request.headers, TokenType: 'EXTERNAL_IDP' };
        return next(args);
      },
      { step: 'build', name: 'tokenTypeHeader' }
    );
  }

  cachedClient = client;
  cachedToken = accessToken;
  return client;
}

async function invokeRemoteMCP(method, params) {
  const tokenData = await getAccessToken();
  const client = getClient(tokenData.accessToken, tokenData);

  const command = new InvokeMCPCommand({
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    profileArn: tokenData.profileArn,
    params,
  });

  const response = await client.send(command);
  if (response.error) {
    throw new Error(`MCP ${method} failed (code ${response.error.code}): ${response.error.message}`);
  }
  return response.result;
}

function formatSearchResults(result) {
  if (!result?.content) return 'No results found.';
  const textContent = result.content.find(c => c.type === 'text');
  if (!textContent?.text) return 'No results found.';
  try {
    const parsed = JSON.parse(textContent.text);
    if (!Array.isArray(parsed.results)) return textContent.text;
    return parsed.results.map(r => {
      const parts = [`## ${r.title || 'Untitled'}`];
      if (r.url) parts.push(`URL: ${r.url}`);
      if (r.snippet) parts.push(r.snippet);
      if (r.publishedDate) parts.push(`Published: ${r.publishedDate}`);
      return parts.join('\n');
    }).join('\n\n---\n\n');
  } catch {
    return textContent.text;
  }
}

const WEB_SEARCH_DESCRIPTION = `Search the web for current information. Returns results including title, URL, snippet, and publishedDate. Query must be 200 characters or less.`;

const WEB_FETCH_DESCRIPTION = `Fetch and extract readable content from a URL. Supports HTML (via Readability) and plain text. Only HTTPS URLs without query parameters are allowed.`;

const server = new McpServer(
  { name: 'kiro-web-search', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.registerTool(
  'web_search',
  {
    description: WEB_SEARCH_DESCRIPTION,
    inputSchema: {
      query: z.string().describe('The search query to execute. Must be 200 characters or less.'),
    },
  },
  async ({ query }) => {
    try {
      const result = await invokeRemoteMCP(MCPMethod.TOOLS_CALL, { name: 'web_search', arguments: { query } });
      return { content: [{ type: 'text', text: formatSearchResults(result) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `web_search failed: ${err.message}` }], isError: true };
    }
  },
);

server.registerTool(
  'web_fetch',
  {
    description: WEB_FETCH_DESCRIPTION,
    inputSchema: {
      url: z.string().describe('Complete HTTPS URL to fetch (no query parameters or fragments).'),
      mode: z.enum(['full', 'truncated', 'selective']).default('truncated').optional()
        .describe('Fetch mode: "truncated" (default, first 8KB), "full" (up to 10MB), "selective" (only matching sections).'),
      searchPhrase: z.string().optional()
        .describe('Required for selective mode. Only sections containing this phrase will be returned.'),
    },
  },
  async ({ url, mode, searchPhrase }) => {
    try {
      const result = await webFetch({ url, mode, searchPhrase });
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `web_fetch failed: ${err.message}` }], isError: true };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
