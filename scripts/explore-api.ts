/**
 * API Explorer — Discovers ALL endpoints from UTP+ Class platform
 * Usage: npx tsx scripts/explore-api.ts
 *
 * Navigates every major section of the SPA, intercepts ALL API calls,
 * saves JSON responses + screenshots for analysis.
 */
import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const STORAGE_PATH = path.resolve('data/storage-state.json');
const OUTPUT_DIR = path.resolve('data/exploration');
const SCREENSHOT_DIR = path.resolve('data/screenshots');

// Ensure output dirs exist
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const API_HOST = 'api-pao.utpxpedition.com';

interface CapturedCall {
  url: string;
  path: string;
  method: string;
  status: number;
  query: Record<string, string>;
  bodyPreview: unknown;
  timestamp: string;
}

async function main() {
  console.log('=== UTP+ API Explorer ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STORAGE_PATH,
    timezoneId: 'America/Lima',
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const capturedCalls: CapturedCall[] = [];
  const allEndpoints = new Map<string, { count: number; methods: Set<string>; sampleBody: unknown }>();

  // Intercept ALL API calls — not just known ones
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes(API_HOST)) return;

    const status = response.status();
    if (status < 200 || status >= 300) return;

    try {
      const urlObj = new URL(url);
      const apiPath = urlObj.pathname;
      const method = response.request().method();
      const query: Record<string, string> = {};
      urlObj.searchParams.forEach((v, k) => { query[k] = v; });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Not JSON
      }

      const call: CapturedCall = {
        url,
        path: apiPath,
        method,
        status,
        query,
        bodyPreview: body,
        timestamp: new Date().toISOString(),
      };
      capturedCalls.push(call);

      // Track unique endpoints
      const key = `${method} ${apiPath}`;
      if (!allEndpoints.has(key)) {
        allEndpoints.set(key, { count: 0, methods: new Set(), sampleBody: null });
      }
      const ep = allEndpoints.get(key)!;
      ep.count++;
      ep.methods.add(method);
      if (!ep.sampleBody && body) ep.sampleBody = body;

      console.log(`  [${method}] ${apiPath} (${status}) ${Array.isArray(body) ? `[${body.length} items]` : typeof body}`);
    } catch {
      // skip
    }
  });

  // === NAVIGATION SEQUENCE ===
  const pages = [
    { name: 'dashboard', url: 'https://class.utp.edu.pe/student/courses', wait: 5000 },
    { name: 'calendar', url: 'https://class.utp.edu.pe/student/calendar', wait: 5000 },
  ];

  for (const p of pages) {
    console.log(`\n--- Navigating to: ${p.name} (${p.url}) ---`);
    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch {
      console.log(`  (timeout on networkidle, continuing...)`);
    }
    await page.waitForTimeout(p.wait);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${p.name}.png`), fullPage: true });
    console.log(`  Screenshot saved: ${p.name}.png`);
  }

  // Try to find course links and visit the first one
  console.log('\n--- Discovering course detail pages ---');
  await page.goto('https://class.utp.edu.pe/student/courses', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const courseLinks = await page.$$eval(
    'a[href*="/student/courses/"][href*="/learnv2"]',
    (links) => links.map((a) => ({
      href: a.getAttribute('href') || '',
      text: a.textContent?.trim() || '',
    })),
  );
  console.log(`  Found ${courseLinks.length} course links`);

  // Visit first 2 courses to discover course-detail API endpoints
  for (let i = 0; i < Math.min(2, courseLinks.length); i++) {
    const link = courseLinks[i];
    const fullUrl = `https://class.utp.edu.pe${link.href}`;
    console.log(`\n--- Visiting course ${i + 1}: ${link.text.substring(0, 50)} ---`);
    console.log(`  URL: ${fullUrl}`);
    try {
      await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
    } catch {
      console.log('  (timeout, continuing...)');
    }
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `course-${i + 1}.png`), fullPage: true });

    // Try clicking on different week tabs/sections if present
    const weekLinks = await page.$$('a[href*="/week/"], [class*="week"]');
    console.log(`  Found ${weekLinks.length} week-related elements`);

    // Click on a specific activity link to see if there's grade/detail info
    const activityLinks = await page.$$eval(
      'a[href*="/learnv2/"]',
      (links) => links.slice(0, 3).map((a) => ({
        href: a.getAttribute('href') || '',
        text: a.textContent?.trim() || '',
      })),
    );
    console.log(`  Found ${activityLinks.length} activity links inside course`);
  }

  // Try notifications endpoint
  console.log('\n--- Checking notifications page ---');
  try {
    // Navigate to see if there's a notifications section
    const notifUrl = 'https://class.utp.edu.pe/student/notifications';
    await page.goto(notifUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'notifications.png`'), fullPage: true });
  } catch (e) {
    console.log('  No notifications page found');
  }

  // Try grades/qualifications page
  console.log('\n--- Checking grades page ---');
  try {
    const gradesUrl = 'https://class.utp.edu.pe/student/grades';
    await page.goto(gradesUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'grades.png'), fullPage: true });
  } catch {
    console.log('  No grades page found');
  }

  // Try profile page
  console.log('\n--- Checking profile ---');
  try {
    await page.goto('https://class.utp.edu.pe/student/profile', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'profile.png'), fullPage: true });
  } catch {
    console.log('  No profile page');
  }

  // === SAVE RESULTS ===
  console.log('\n\n=== RESULTS ===\n');

  // Summary
  const endpointSummary: Record<string, { count: number; methods: string[]; hasData: boolean }> = {};
  for (const [key, val] of allEndpoints) {
    endpointSummary[key] = {
      count: val.count,
      methods: [...val.methods],
      hasData: val.sampleBody !== null,
    };
    console.log(`  ${key} (${val.count}x) ${val.sampleBody ? 'HAS DATA' : 'no body'}`);
  }

  // Save full captured data
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'api-calls.json'),
    JSON.stringify(capturedCalls, null, 2),
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'endpoints-summary.json'),
    JSON.stringify(endpointSummary, null, 2),
  );

  // Save sample responses for each unique endpoint
  for (const call of capturedCalls) {
    if (call.bodyPreview) {
      const safeName = call.path.replace(/\//g, '_').replace(/^_/, '') + '.json';
      const filePath = path.join(OUTPUT_DIR, safeName);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(call.bodyPreview, null, 2));
      }
    }
  }

  console.log(`\nTotal API calls captured: ${capturedCalls.length}`);
  console.log(`Unique endpoints: ${allEndpoints.size}`);
  console.log(`\nResults saved to: ${OUTPUT_DIR}`);
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);

  // Save context state for future use
  await context.storageState({ path: STORAGE_PATH });
  console.log('\nSession state saved');

  await browser.close();
}

main().catch((err) => {
  console.error('Explorer failed:', err);
  process.exit(1);
});
