import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { existsSync } from 'node:fs';
import { logger } from '../logger.js';

const STORAGE_STATE_PATH = './data/storage-state.json';

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-setuid-sandbox',
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function createBrowser(): Promise<Browser> {
  const browser = await chromium.launch({
    headless: true,
    args: BROWSER_ARGS,
  });
  logger.info('Browser launched');
  return browser;
}

export async function createContext(browser: Browser): Promise<BrowserContext> {
  const contextOptions: Parameters<Browser['newContext']>[0] = {
    viewport: { width: 1280, height: 720 },
    userAgent: USER_AGENT,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  };

  // Load saved session if available
  if (existsSync(STORAGE_STATE_PATH)) {
    try {
      contextOptions.storageState = STORAGE_STATE_PATH;
      logger.info('Loading saved session state');
    } catch (error) {
      logger.warn({ error }, 'Failed to load storage state, starting fresh');
    }
  }

  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(30_000);

  return context;
}

export async function withBrowser<T>(
  callback: (page: Page, context: BrowserContext) => Promise<T>
): Promise<T> {
  let browser: Browser | null = null;

  try {
    browser = await createBrowser();
    const context = await createContext(browser);
    const page = await context.newPage();

    const result = await callback(page, context);

    return result;
  } catch (error) {
    logger.error({ error }, 'Browser operation failed');
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

export async function saveSession(context: BrowserContext): Promise<void> {
  try {
    await context.storageState({ path: STORAGE_STATE_PATH });
    logger.info('Session state saved');
  } catch (error) {
    logger.warn({ error }, 'Failed to save session state');
  }
}

export async function takeScreenshot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `./data/screenshots/${name}.png`, fullPage: true });
    logger.info({ name }, 'Screenshot saved');
  } catch (error) {
    logger.warn({ error, name }, 'Failed to save screenshot');
  }
}
