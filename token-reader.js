import fs from 'fs';
import path from 'path';
import os from 'os';

const SSO_CACHE_DIR = path.join(os.homedir(), '.aws', 'sso', 'cache');
const KIRO_TOKEN_FILE = 'kiro-auth-token.json';
const SOCIAL_REFRESH_URL = 'https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const KIRO_PROFILE_PATHS = [
  path.join(os.homedir(), 'Library', 'Application Support', 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'profile.json'),
  path.join(os.homedir(), '.config', 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'profile.json'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'Kiro', 'User', 'globalStorage', 'kiro.kiroagent', 'profile.json'),
];

let cachedToken = null;
let refreshPromise = null;

function readKiroToken() {
  const tokenPath = path.join(SSO_CACHE_DIR, KIRO_TOKEN_FILE);
  if (!fs.existsSync(tokenPath)) return null;
  try { return JSON.parse(fs.readFileSync(tokenPath, 'utf8')); } catch { return null; }
}

function writeKiroToken(tokenData) {
  try {
    const tokenPath = path.join(SSO_CACHE_DIR, KIRO_TOKEN_FILE);
    fs.mkdirSync(SSO_CACHE_DIR, { recursive: true });
    fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
  } catch {}
}

function readKiroProfile() {
  for (const p of KIRO_PROFILE_PATHS) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  }
  return null;
}

function readClientRegistration(clientIdHash) {
  if (!clientIdHash) return null;
  try {
    const fp = path.join(SSO_CACHE_DIR, `${clientIdHash}.json`);
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {}
  return null;
}

function isTokenExpired(t) {
  if (!t?.expiresAt) return true;
  return new Date(t.expiresAt).getTime() < Date.now() + REFRESH_BUFFER_MS;
}

async function refreshSocialToken(tokenData) {
  const res = await fetch(SOCIAL_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokenData.refreshToken }),
  });
  if (!res.ok) throw new Error(`Social token refresh failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expiresIn || 3600) * 1000).toISOString();
  return { ...tokenData, accessToken: data.accessToken, ...(data.refreshToken && { refreshToken: data.refreshToken }), ...(data.profileArn && { profileArn: data.profileArn }), expiresAt };
}

async function refreshIdCToken(tokenData) {
  const clientReg = readClientRegistration(tokenData.clientIdHash);
  if (!clientReg?.clientId || !clientReg?.clientSecret) {
    throw new Error('IdC refresh failed: no valid client registration. Please re-login in Kiro.');
  }
  const region = tokenData.region || 'us-east-1';
  const res = await fetch(`https://oidc.${region}.amazonaws.com/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: clientReg.clientId, clientSecret: clientReg.clientSecret, grantType: 'refresh_token', refreshToken: tokenData.refreshToken }),
  });
  if (!res.ok) throw new Error(`IdC token refresh failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expiresIn || 3600) * 1000).toISOString();
  return { ...tokenData, accessToken: data.accessToken, ...(data.refreshToken && { refreshToken: data.refreshToken }), expiresAt };
}

function enrichWithProfile(tokenData) {
  if (!tokenData.profileArn) {
    const profile = readKiroProfile();
    if (profile?.arn) tokenData.profileArn = profile.arn;
  }
  return tokenData;
}

export async function getAccessToken() {
  if (cachedToken && !isTokenExpired(cachedToken)) return cachedToken;

  let tokenData = readKiroToken();
  if (!tokenData?.accessToken) throw new Error('No token found. Please login in Kiro first.');

  if (!isTokenExpired(tokenData)) {
    cachedToken = enrichWithProfile(tokenData);
    return cachedToken;
  }

  if (!tokenData.refreshToken) throw new Error('Token expired and no refreshToken. Please re-login in Kiro.');

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const method = tokenData.authMethod;
      let newToken;
      if (method === 'social' || method === 'Social') newToken = await refreshSocialToken(tokenData);
      else if (method === 'IdC' || method === 'idc') newToken = await refreshIdCToken(tokenData);
      else throw new Error(`Unknown auth method: ${method}`);
      const enriched = enrichWithProfile(newToken);
      writeKiroToken(enriched);
      cachedToken = enriched;
      return enriched;
    } catch (err) {
      if (tokenData.expiresAt && new Date(tokenData.expiresAt) > new Date()) {
        cachedToken = enrichWithProfile(tokenData);
        return cachedToken;
      }
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
