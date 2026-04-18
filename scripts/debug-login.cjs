/* eslint-disable */
// Standalone diagnostic script — runs with plain node (no tsx/TypeScript needed).
// Use inside the production Docker container OR locally.
//
// Usage (local):
//   node scripts/debug-login.cjs                    # headed (needs display)
//   HEADLESS=true node scripts/debug-login.cjs      # headless
//
// Usage (inside VPS container — headless only):
//   docker exec <container> node /app/scripts/debug-login.cjs
//
// Output: JSON report saved to ./data/network-debug-<timestamp>.json
// The ./data dir is a mounted volume in production, so the report is
// accessible from the host at the volume path.

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('node:fs');
const path = require('node:path');

chromium.use(StealthPlugin());

const HEADLESS = process.env.HEADLESS !== 'false';
const URL = process.env.UTP_BASE_URL || 'https://class.utp.edu.pe';
const WAIT_MS = Number(process.env.WAIT_MS || 25000);
const OUT_DIR = process.env.OUT_DIR || path.resolve(process.cwd(), 'data');

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const stamp = ts();
  const outJson = path.join(OUT_DIR, `network-debug-${stamp}.json`);
  const outPng = path.join(OUT_DIR, `network-debug-${stamp}.png`);

  console.log(`[debug] headless=${HEADLESS} target=${URL}`);
  console.log(`[debug] report will be saved to ${outJson}`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  });

  const page = await context.newPage();

  const requests = [];
  const navigations = [];
  const consoleErrors = [];
  const pageErrors = [];

  page.on('request', (req) => {
    requests.push({
      phase: 'request',
      t: Date.now(),
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      headers: req.headers(),
      postData: req.postData() ? req.postData().slice(0, 2000) : null,
    });
  });

  page.on('response', async (res) => {
    const entry = {
      phase: 'response',
      t: Date.now(),
      status: res.status(),
      url: res.url(),
      method: res.request().method(),
      resourceType: res.request().resourceType(),
      headers: res.headers(),
      fromCache: res.fromCache ? res.fromCache() : undefined,
    };
    // Capture body for text/json responses that look relevant (dynatrace, auth, sso)
    try {
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      const url = res.url();
      const relevant =
        url.includes('dynatrace') ||
        url.includes('auth') ||
        url.includes('sso.utp.edu.pe') ||
        url.includes('/realms/') ||
        url.includes('cloudflare') ||
        url.includes('datadome');
      if (relevant && (ct.includes('json') || ct.includes('text') || ct.includes('javascript'))) {
        const buf = await res.body().catch(() => null);
        if (buf) entry.body = buf.toString('utf8').slice(0, 3000);
      }
    } catch {}
    requests.push(entry);
  });

  page.on('requestfailed', (req) => {
    requests.push({
      phase: 'requestfailed',
      t: Date.now(),
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      failure: req.failure()?.errorText,
    });
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const nav = { t: Date.now(), url: frame.url() };
      navigations.push(nav);
      console.log(`[nav] ${nav.url}`);
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const entry = { t: Date.now(), type: msg.type(), text: msg.text() };
      consoleErrors.push(entry);
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push({ t: Date.now(), message: err.message, stack: err.stack });
    console.log(`[page-error] ${err.message}`);
  });

  console.log(`[debug] goto ${URL}`);
  const start = Date.now();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (err) {
    console.log(`[debug] goto failed: ${err.message}`);
  }
  console.log(`[debug] after goto, url=${page.url()}`);

  console.log(`[debug] waiting ${WAIT_MS}ms for redirect/behavior...`);
  await page.waitForTimeout(WAIT_MS);

  const finalUrl = page.url();
  const title = await page.title().catch(() => '(no title)');
  const bodyText = await page
    .evaluate(() => document.body?.innerText?.slice(0, 1000) ?? '(no body)')
    .catch(() => '(eval failed)');
  const htmlLen = await page
    .evaluate(() => document.documentElement.outerHTML.length)
    .catch(() => -1);

  // Environment fingerprint from INSIDE the page
  const envProbe = await page
    .evaluate(() => ({
      userAgent: navigator.userAgent,
      webdriver: navigator.webdriver,
      languages: navigator.languages,
      plugins: navigator.plugins ? navigator.plugins.length : -1,
      hasChrome: typeof window.chrome !== 'undefined',
      platform: navigator.platform,
      vendor: navigator.vendor,
      cookieEnabled: navigator.cookieEnabled,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      screen: { w: screen.width, h: screen.height, cd: screen.colorDepth },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }))
    .catch((err) => ({ evalError: err.message }));

  console.log(`[debug] final url=${finalUrl}`);
  console.log(`[debug] title=${title}`);
  console.log(`[debug] redirected=${finalUrl !== URL + '/' && finalUrl !== URL}`);
  console.log(`[debug] htmlLen=${htmlLen}`);
  console.log(`[debug] body snippet:\n${bodyText.slice(0, 400)}`);

  try {
    await page.screenshot({ path: outPng, fullPage: true });
    console.log(`[debug] screenshot saved: ${outPng}`);
  } catch (err) {
    console.log(`[debug] screenshot failed: ${err.message}`);
  }

  const report = {
    meta: {
      startedAt: new Date(start).toISOString(),
      durationMs: Date.now() - start,
      headless: HEADLESS,
      target: URL,
      finalUrl,
      redirected: finalUrl !== URL + '/' && finalUrl !== URL,
      title,
      htmlLen,
      bodyText: bodyText.slice(0, 2000),
    },
    envProbe,
    navigations,
    pageErrors,
    consoleErrors: consoleErrors.slice(0, 200),
    network: requests, // full list
    summary: summarize(requests),
  };

  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log(`[debug] report saved: ${outJson} (${fs.statSync(outJson).size} bytes)`);
  console.log(`[debug] summary:`, JSON.stringify(report.summary, null, 2));

  await browser.close();
}

function summarize(requests) {
  const out = {
    totalRequests: 0,
    totalResponses: 0,
    totalFailed: 0,
    byStatus: {},
    byHost: {},
    suspicious: [],
  };
  for (const e of requests) {
    if (e.phase === 'request') out.totalRequests++;
    if (e.phase === 'response') {
      out.totalResponses++;
      const s = String(e.status);
      out.byStatus[s] = (out.byStatus[s] || 0) + 1;
      try {
        const host = new URL(e.url).host;
        out.byHost[host] = (out.byHost[host] || 0) + 1;
      } catch {}
    }
    if (e.phase === 'requestfailed') {
      out.totalFailed++;
      out.suspicious.push({ url: e.url, failure: e.failure });
    }
    if (e.phase === 'response' && (e.status === 403 || e.status === 401 || e.status === 429 || e.status >= 500)) {
      out.suspicious.push({ url: e.url, status: e.status });
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
