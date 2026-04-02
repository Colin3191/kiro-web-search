import axios from 'axios';
import axiosRetry from 'axios-retry';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const FETCH_TIMEOUT = 30000;
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB
const TRUNCATED_SIZE = 8 * 1024; // 8KB
const USER_AGENT = 'KiroIDE';

const client = axios.create({
  timeout: FETCH_TIMEOUT,
  maxRedirects: 5,
  maxContentLength: MAX_CONTENT_SIZE,
  maxBodyLength: MAX_CONTENT_SIZE,
  validateStatus: s => s >= 200 && s < 300,
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
  },
  decompress: true,
});

axiosRetry(client, {
  retries: 1,
  retryCondition: (err) => {
    if (err.response && err.response.status >= 400 && err.response.status < 500) return false;
    return axiosRetry.isNetworkOrIdempotentRequestError(err) || (err.response?.status >= 500 && err.response?.status < 600);
  },
  retryDelay: axiosRetry.exponentialDelay,
});

class WebFetchTimeoutError extends Error {
  constructor(ms) { super(`Request timeout after ${ms}ms`); this.name = 'WebFetchTimeoutError'; }
}
class WebFetchContentTooLargeError extends Error {
  constructor(max) { super(`Content too large: exceeds maximum of ${max} bytes`); this.name = 'WebFetchContentTooLargeError'; }
}
class WebFetchHttpError extends Error {
  constructor(status, statusText) { super(`HTTP ${status}: ${statusText}`); this.name = 'WebFetchHttpError'; this.statusCode = status; }
}
class WebFetchNetworkError extends Error {
  constructor(msg, code) { super(`Network error: ${msg}`); this.name = 'WebFetchNetworkError'; this.code = code; }
}
class WebFetchUnsupportedContentTypeError extends Error {
  constructor(ct) { super(`Unsupported content type: ${ct}. Supported types: text/*, application/xhtml+xml, application/xml, application/json.`); this.name = 'WebFetchUnsupportedContentTypeError'; this.contentType = ct; }
}
class WebFetchUnsafeRedirectError extends Error {
  constructor(url) { super(`Redirect to unsafe URL: ${url}`); this.name = 'WebFetchUnsafeRedirectError'; this.redirectUrl = url; }
}
class WebFetchInvalidInputError extends Error {
  constructor(msg) { super(msg); this.name = 'WebFetchInvalidInputError'; }
}

function stripQueryParameters(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.host}${u.pathname}`; }
  catch { return url; }
}

function isValidUrl(url) {
  try { return new URL(url).protocol === 'https:'; }
  catch { return false; }
}

const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);
const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'text/xml', 'application/xml', 'application/json']);

function parseMimeType(ct) { return ct.split(';')[0].trim().toLowerCase(); }
function isSupportedContentType(ct) {
  const mime = parseMimeType(ct);
  return HTML_TYPES.has(mime) || TEXT_TYPES.has(mime) || mime.startsWith('text/');
}
function isHtmlContentType(ct) { return HTML_TYPES.has(parseMimeType(ct)); }

function extractHtmlContent(html) {
  try {
    const dom = new JSDOM(html);
    const article = new Readability(dom.window.document).parse();
    if (!article) return 'Could not extract readable content from this webpage.';
    const text = article.textContent || '';
    return article.title ? `${article.title}\n\n${text}` : text;
  } catch { return 'Error extracting content from webpage.'; }
}

function selectiveExtractHtml(html, phrase) {
  try {
    const dom = new JSDOM(html);
    const article = new Readability(dom.window.document).parse();
    let text;
    if (article) {
      text = article.textContent || '';
    } else {
      const doc = dom.window.document;
      doc.querySelectorAll('script, style, noscript, nav, header, footer, aside').forEach(el => el.remove());
      text = doc.body.textContent || '';
    }
    return selectiveFromText(text, phrase);
  } catch (err) {
    return { content: `Error in selective extraction: ${err.message}`, matchCount: 0 };
  }
}

function selectiveFromText(text, phrase) {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const lower = phrase.toLowerCase();
  const maxMatches = 10;
  const contextLines = 30;

  const matchIndices = lines
    .map((l, i) => l.toLowerCase().includes(lower) ? i : -1)
    .filter(i => i !== -1)
    .slice(0, maxMatches);

  if (matchIndices.length === 0) {
    return { content: `No matches found for phrase: "${phrase}"\n\nTip: Try a different search phrase or use 'full' mode.`, matchCount: 0 };
  }

  const result = [];
  let lastEnd = -1;
  for (const idx of matchIndices) {
    const start = Math.max(0, idx - contextLines);
    const end = Math.min(lines.length - 1, idx + contextLines);
    if (start > lastEnd + 1 && result.length > 0) result.push('\n...\n');
    const from = Math.max(start, lastEnd + 1);
    result.push(...lines.slice(from, end + 1));
    lastEnd = end;
  }

  const truncated = matchIndices.length >= maxMatches;
  const prefix = truncated ? `[Showing first ${maxMatches} matches]\n\n` : '';
  return { content: `${prefix}${result.join('\n')}`, matchCount: matchIndices.length };
}

function truncateContent(text, maxSize) {
  if (Buffer.byteLength(text, 'utf8') <= maxSize) return { content: text, truncated: false };
  const half = Math.floor(maxSize / 2);
  return { content: text.slice(0, half), truncated: true };
}

function formatResult(r) {
  const lines = [`Fetched content from: ${r.url}`, `Size: ${r.contentLength} bytes`];
  if (r.truncated) lines.push(`Mode: Truncated (first ${TRUNCATED_SIZE / 1024}KB only)`);
  if (r.matchCount !== undefined) lines.push(`Mode: Selective (${r.matchCount} matches found)`);
  lines.push('', 'Content:', '---', r.content);
  return lines.join('\n');
}

export async function webFetch({ url: rawUrl, mode = 'truncated', searchPhrase }) {
  const url = stripQueryParameters(rawUrl);
  if (!isValidUrl(url)) throw new WebFetchInvalidInputError('Invalid or unsafe URL. Only https URLs are allowed.');
  if (mode === 'selective' && !searchPhrase) throw new WebFetchInvalidInputError('searchPhrase is required when using selective mode.');

  const maxSize = mode === 'truncated' ? TRUNCATED_SIZE : MAX_CONTENT_SIZE;

  let res;
  try {
    res = await client.get(url, { responseType: 'text' });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') throw new WebFetchTimeoutError(FETCH_TIMEOUT);
      if (err.code === 'ERR_BAD_REQUEST' && err.message.includes('maxContentLength')) throw new WebFetchContentTooLargeError(MAX_CONTENT_SIZE);
      if (err.response) throw new WebFetchHttpError(err.response.status, err.response.statusText);
      throw new WebFetchNetworkError(err.message, err.code);
    }
    throw err;
  }

  const finalUrl = res.request?.res?.responseUrl || res.config.url || url;
  if (!isValidUrl(finalUrl)) throw new WebFetchUnsafeRedirectError(finalUrl);

  const contentType = String(res.headers['content-type'] || '');
  if (!isSupportedContentType(contentType)) throw new WebFetchUnsupportedContentTypeError(contentType);

  const html = res.data;
  const isHtml = isHtmlContentType(contentType);
  let content, matchCount;

  if (mode === 'selective' && searchPhrase) {
    if (isHtml) {
      const r = selectiveExtractHtml(html, searchPhrase);
      content = r.content; matchCount = r.matchCount;
    } else {
      const r = selectiveFromText(html, searchPhrase);
      content = r.content; matchCount = r.matchCount;
    }
  } else {
    content = isHtml ? extractHtmlContent(html) : html;
  }

  const t = truncateContent(content, maxSize);
  content = t.content;

  return formatResult({
    url, contentLength: Buffer.byteLength(content, 'utf8'),
    truncated: t.truncated, matchCount, content,
  });
}
