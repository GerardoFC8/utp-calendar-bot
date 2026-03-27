import type { Page, BrowserContext } from 'playwright';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { SELECTORS } from './selectors.js';
import { saveSession, takeScreenshot } from './browser.js';

export async function login(page: Page, context: BrowserContext): Promise<void> {
  const loginUrl = config.UTP_BASE_URL;
  logger.info({ url: loginUrl }, 'Navigating to login page');

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Wait for the login form to render (SPA)
  // The platform might redirect to Microsoft SSO
  const currentUrl = page.url();
  logger.info({ currentUrl }, 'Login page loaded');

  // Check if already logged in (saved session still valid)
  // Case 1: Already on dashboard (/student/*)
  // Case 2: OAuth callback — URL has fragment with auth code (#state=...&code=...)
  const isOnDashboard = currentUrl.startsWith(config.UTP_BASE_URL) && currentUrl.includes('/student/');
  const isOAuthCallback = currentUrl.startsWith(config.UTP_BASE_URL) && (currentUrl.includes('#code=') || currentUrl.includes('&code='));

  if (isOnDashboard || isOAuthCallback) {
    logger.info({ reason: isOnDashboard ? 'on dashboard' : 'oauth callback' }, 'Already logged in. Skipping login flow.');

    // If OAuth callback, wait for SPA to process the code and navigate to dashboard
    if (isOAuthCallback) {
      try {
        await page.waitForURL(/\/student\//, { timeout: 15_000 });
        logger.info({ url: page.url() }, 'SPA navigated to dashboard after OAuth callback');
      } catch {
        logger.warn('SPA did not navigate after OAuth callback, continuing anyway');
      }
    }

    await saveSession(context);
    return;
  }

  if (currentUrl.includes('microsoftonline.com') || currentUrl.includes('login.microsoft')) {
    await handleMicrosoftSSO(page);
  } else if (currentUrl.includes('sso.utp.edu.pe') || currentUrl.includes('realms/')) {
    await handleKeycloakSSO(page);
  } else {
    await handleDirectLogin(page);
  }

  // Verify login succeeded — primary: URL must be back on UTP+ domain
  try {
    await page.waitForURL(new RegExp(config.UTP_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 20_000 });
    logger.info({ url: page.url() }, 'Login redirect confirmed — back on UTP+');
  } catch {
    const onUtpDomain = page.url().startsWith(config.UTP_BASE_URL);
    if (!onUtpDomain) {
      await takeScreenshot(page, 'login-failed');
      throw new Error(
        'Login verification failed. Not redirected back to UTP+. ' +
        'Check screenshots in data/screenshots/'
      );
    }
    logger.info({ url: page.url() }, 'Already on UTP+ domain, continuing');
  }

  // Secondary: wait for SPA dashboard content (non-fatal if missing)
  try {
    await page.waitForSelector(SELECTORS.loggedInIndicator, { timeout: 10_000 });
    logger.info('Dashboard content found — login successful');
  } catch {
    logger.warn(
      { url: page.url() },
      'loggedInIndicator not found — SPA may use different selectors. ' +
      'Update SELECTORS.loggedInIndicator if scraping fails later.'
    );
  }

  // Save session for reuse
  await saveSession(context);
}

async function handleDirectLogin(page: Page): Promise<void> {
  logger.info('Attempting direct login');

  // Wait for form fields
  const usernameField = await page.waitForSelector(SELECTORS.usernameField, { timeout: 15_000 });
  if (!usernameField) {
    await takeScreenshot(page, 'no-username-field');
    throw new Error('Username field not found. Update SELECTORS.usernameField');
  }

  await usernameField.fill(config.UTP_USERNAME);

  const passwordField = await page.waitForSelector(SELECTORS.passwordField, { timeout: 5_000 });
  if (!passwordField) {
    await takeScreenshot(page, 'no-password-field');
    throw new Error('Password field not found. Update SELECTORS.passwordField');
  }

  await passwordField.fill(config.UTP_PASSWORD);

  // Submit
  const submitBtn = await page.waitForSelector(SELECTORS.submitButton, { timeout: 5_000 });
  if (submitBtn) {
    await submitBtn.click();
  } else {
    // Try pressing Enter as fallback
    await page.keyboard.press('Enter');
  }

  // Wait for navigation/SPA route change
  await page.waitForTimeout(3_000);
}

async function handleKeycloakSSO(page: Page): Promise<void> {
  logger.info({ url: page.url() }, 'Detected Keycloak SSO flow');

  // Wait for Keycloak form — 15s to account for the redirect chain
  try {
    await page.waitForSelector(SELECTORS.kcLoginForm, { timeout: 15_000 });
  } catch {
    await takeScreenshot(page, 'keycloak-form-not-found');
    throw new Error(
      'Keycloak login form (#kc-form-login) not found. ' +
      'The SSO provider may have changed. Check screenshots.'
    );
  }

  // Fill username
  const usernameField = await page.waitForSelector(SELECTORS.kcUsernameField, { timeout: 5_000 });
  if (!usernameField) {
    await takeScreenshot(page, 'keycloak-no-username');
    throw new Error('Keycloak username field (#username) not found');
  }
  await usernameField.fill(config.UTP_USERNAME);
  logger.debug('Keycloak username filled');

  // Fill password
  const passwordField = await page.waitForSelector(SELECTORS.kcPasswordField, { timeout: 5_000 });
  if (!passwordField) {
    await takeScreenshot(page, 'keycloak-no-password');
    throw new Error('Keycloak password field (#password) not found');
  }
  await passwordField.fill(config.UTP_PASSWORD);
  logger.debug('Keycloak password filled');

  // Submit via #kc-login button
  const submitBtn = await page.waitForSelector(SELECTORS.kcSubmitButton, { timeout: 5_000 });
  if (submitBtn) {
    await submitBtn.click();
    logger.debug('Keycloak submit button clicked');
  } else {
    await passwordField.press('Enter');
    logger.debug('Keycloak: pressed Enter as submit fallback');
  }

  // Wait for Keycloak to validate and redirect back to class.utp.edu.pe
  try {
    await page.waitForURL(new RegExp(config.UTP_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 20_000 });
    logger.info({ url: page.url() }, 'Keycloak SSO: redirected back to UTP+');
  } catch {
    // Check if there's a Keycloak error message visible
    const errorEl = await page.$(SELECTORS.kcErrorMessage);
    if (errorEl) {
      const errorText = await errorEl.textContent();
      await takeScreenshot(page, 'keycloak-login-error');
      throw new Error(`Keycloak login error: ${errorText?.trim() ?? 'Unknown error'}`);
    }

    await takeScreenshot(page, 'keycloak-no-redirect');
    throw new Error(
      'Keycloak SSO: no redirect back to UTP+ after login. ' +
      'Check credentials and screenshots.'
    );
  }
}

async function handleMicrosoftSSO(page: Page): Promise<void> {
  logger.info('Detected Microsoft SSO flow');

  // Microsoft login - email/username
  const emailField = await page.waitForSelector('input[type="email"], input[name="loginfmt"]', {
    timeout: 10_000,
  });
  if (emailField) {
    await emailField.fill(config.UTP_USERNAME);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForTimeout(2_000);
  }

  // Password step
  const passwordField = await page.waitForSelector('input[type="password"], input[name="passwd"]', {
    timeout: 10_000,
  });
  if (passwordField) {
    await passwordField.fill(config.UTP_PASSWORD);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForTimeout(3_000);
  }

  // "Stay signed in?" prompt
  try {
    const staySignedIn = await page.waitForSelector('input[type="submit"][value="Yes"], #idSIButton9', {
      timeout: 5_000,
    });
    if (staySignedIn) {
      await staySignedIn.click();
      await page.waitForTimeout(2_000);
    }
  } catch {
    logger.info('No "Stay signed in" prompt detected');
  }

  // Wait for redirect back to UTP+
  await page.waitForURL(`${config.UTP_BASE_URL}/**`, { timeout: 15_000 });
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(config.UTP_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const indicator = await page.$(SELECTORS.loggedInIndicator);
    return indicator !== null;
  } catch {
    return false;
  }
}
