import { MCPMethod } from '@aws/codewhisperer-streaming-client';
import { invokeRemoteMCP, formatSearchResults } from './core.js';
import { webFetch } from './web-fetch.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const HELP = `kiro-web-search v${pkg.version}

Usage:
  kiro-web-search search <query> [--json]
  kiro-web-search fetch <url> [--mode truncated|full|selective] [--phrase "..."]
  kiro-web-search --help, -h           Show this help
  kiro-web-search --version, -v        Show version

Examples:
  kiro-web-search search "今日A股行情"
  kiro-web-search search "React 19 features" --json
  kiro-web-search fetch https://example.com
  kiro-web-search fetch https://example.com --mode full
  kiro-web-search fetch https://example.com --mode selective --phrase "关键内容"
`;

function parseArgs(args) {
  const result = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        result[key] = true;
      } else {
        result[key] = next;
        i++;
      }
    } else if (arg.startsWith('-')) {
      result[arg.slice(1)] = true;
    } else {
      result._.push(arg);
    }
  }
  return result;
}

async function handleSearch(args) {
  const parsed = parseArgs(args);
  const query = parsed._.slice(1).join(' ');
  if (!query) {
    console.error('Error: search query is required\n\nUsage: kiro-web-search search <query>');
    process.exit(1);
  }
  if (query.length > 200) {
    console.error('Error: query must be 200 characters or less');
    process.exit(1);
  }

  const result = await invokeRemoteMCP(MCPMethod.TOOLS_CALL, { name: 'web_search', arguments: { query } });

  if (parsed.json) {
    const textContent = result?.content?.find(c => c.type === 'text');
    console.log(textContent?.text || JSON.stringify(result, null, 2));
  } else {
    console.log(formatSearchResults(result));
  }
}

async function handleFetch(args) {
  const parsed = parseArgs(args);
  const url = parsed._[1];
  if (!url) {
    console.error('Error: URL is required\n\nUsage: kiro-web-search fetch <url> [--mode truncated|full|selective] [--phrase "..."]');
    process.exit(1);
  }

  const mode = parsed.mode || 'truncated';
  const searchPhrase = parsed.phrase;

  if (mode === 'selective' && !searchPhrase) {
    console.error('Error: --phrase is required when using selective mode');
    process.exit(1);
  }

  const result = await webFetch({ url, mode, searchPhrase });
  console.log(result);
}

export async function runCli(args) {
  const command = args[0];

  try {
    if (!command || command === '--help' || command === '-h') {
      console.log(HELP);
    } else if (command === '--version' || command === '-v') {
      console.log(pkg.version);
    } else if (command === 'search') {
      await handleSearch(args);
    } else if (command === 'fetch') {
      await handleFetch(args);
    } else {
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
