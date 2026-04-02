#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CodeWhispererStreaming, InvokeMCPCommand, MCPMethod } from '@aws/codewhisperer-streaming-client';
import crypto from 'crypto';
import os from 'os';
import { z } from 'zod';
import { getAccessToken } from './token-reader.js';

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

const WEB_SEARCH_DESCRIPTION = `WebSearch looks up information that is outside the model's training data or cannot be reliably inferred from the current codebase/context.
    Tool perform basic compliance wrt content licensing and restriction.
    As an agent you are responsible for adhering to compliance and attribution requirements
    IMPORTANT: The snippets often contain enough information to answer questions - only use web_
    fetch if you need more detailed content from a specific webpage.

    ## When to Use
    - When the user asks for current or up-to-date information (e.g., pricing, versions, technical specs) or explicitly requests a web search.
    - When verifying information that may have changed recently, or when the user provides a specific URL to inspect.

    ## When NOT to Use
    - When the question involves basic concepts, historical facts, or well-established programming syntax/technical documentation.
    - When the topic does not require current or evolving information.
    - If the query concerns non-coding topics (e.g., news, current affairs, religion, economics, society). You must not invoke this tool.

    For any code-related tasks, follow this order:
    1. Search within the repository (if tools are available) and check if it can be inferred from existing code or documentation.
    2. Use this tool only if still unresolved and the library/data is likely new/unseen.

    ## Content Compliance Requirements
    You MUST adhere to strict licensing restrictions and attribution requirements when using search results:

    ### Attribution Requirements
    - ALWAYS provide inline links to original sources using format: [description](url)
    - If not possible to provide inline link, add sources at the end of file
    - Ensure attribution is visible and accessible

    ### Verbatim Reproduction Limits
    - NEVER reproduce more than 30 consecutive words from any single source
    - Track word count per source to ensure compliance
    - Always paraphrase and summarize rather than quote directly
    - Add compliance note when the content from the source is rephrased: "Content was rephrased for compliance with licensing restrictions"

    ### Content Modification Guidelines
    - You MAY paraphrase, summarize, and reformat content
    - You MUST NOT materially change the underlying substance or meaning
    - Preserve factual accuracy while condensing information
    - Avoid altering core arguments, data, or conclusions

    ## Usage Details
    - Query MUST be 200 characters or fewer. Queries more than 200 characters are not supported.
    - You may rephrase user queries to improve search effectiveness
    - You can make multiple queries to gather comprehensive information
    - Consider breaking complex questions into focused searches
    - Refine queries based on initial results if needed

    ## Output Usage
    - Prioritize latest published sources based on publishedDate
    - Prefer official documentation to blogs and news posts
    - Use domain information to assess source authority and reliability

    ## Error Handling
    - If unable to comply with content restrictions, explain limitations to user
    - Suggest alternative approaches when content cannot be reproduced
    - Prioritize compliance over completeness when conflicts arise
    - If the request fails with a ValidationException indicating the query exceeds maximum length, retry with a trimmed query of 200 characters or less

    ## Output
    The tool returns search results with:
    - title: The title of the web page
    - url: The URL of the web page
    - snippet: A brief excerpt from the web page
    - publishedDate: The date the web page was published
    - isPublicDomain: Whether the web page is in the public domain
    - id: The unique identifier of the web page
    - domain: The domain of the web page`;

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

const transport = new StdioServerTransport();
await server.connect(transport);
