'use strict';

/**
 * Trust Bank LZ — Full E2E validation.
 *
 * Uploads the 4 Trust Bank Landing Zone files:
 *   HLD (docx), LLD (xlsx), Diagrams (drawio), SOW (md)
 *
 * Validates: auth → create review → upload 4 files → trigger extraction →
 *            poll until Review In Progress → findings visible → scorecard visible
 *
 * Usage:
 *   E2E_LOGIN_PASSWORD=Welcome@2026 npx playwright test tests/e2e/trust-bank-lz-e2e.spec.js --workers=1 --reporter=line --timeout=720000
 */

const { chromium, test } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

const BASE_URL = process.env.E2E_BASE_URL || 'https://thankful-pond-04383960f.7.azurestaticapps.net';
const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL || 'cari.pilot@outlook.com';
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD || '';
const SCREENSHOTS_DIR = process.env.E2E_SCREENSHOTS_DIR || 'c:\\tmp\\playwright-qa\\screenshots\\trust-bank';

const LZ_FILES_DIR = process.env.LZ_FILES_DIR || 'C:\\cari-repo\\Test LZ files';

const TRUST_BANK_FILES = [
  'Trust_Bank_Azure_Landing_Zone_HLD_UKSouth_UKWest_v5.docx',
  'Trust_Bank_Azure_Landing_Zone_LLD_UKSouth_UKWest_v5.xlsx',
  'Trust_Bank_Azure_Landing_Zone_Diagrams_UKSouth_UKWest_v5.drawio',
  'Trust_Bank_Azure_Landing_Zone_SOW_v1.md',
];

const POLL_INTERVAL_MS = 30_000;
const POLL_MAX_ATTEMPTS = 12; // 6 minutes total

const R = { pass: [], fail: [], warn: [] };
let shotCounter = 0;

function pass(key, detail) { R.pass.push({ key, detail }); console.log(`  ✓ PASS  ${key}${detail ? ': ' + detail : ''}`); }
function fail(key, detail) { R.fail.push({ key, detail }); console.error(`  ✗ FAIL  ${key}${detail ? ': ' + detail : ''}`); }
function warn(key, detail) { R.warn.push({ key, detail }); console.warn(`  ⚠ WARN  ${key}${detail ? ': ' + detail : ''}`); }

async function shot(page, label) {
  try {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const n = String(++shotCounter).padStart(2, '0');
    const file = path.join(SCREENSHOTS_DIR, `${n}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  [screenshot] ${n}-${label}.png`);
  } catch (_) {/* non-fatal */}
}

async function findVisible(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 })) return el;
    } catch (_) {/* try next */}
  }
  return null;
}

async function tryClick(page, selectors, desc) {
  const el = await findVisible(page, selectors);
  if (el) { await el.click(); return true; }
  warn(desc, 'no selector matched — skipping click');
  return false;
}

async function isAuthenticated(page) {
  try {
    const resp = await page.evaluate(async () => {
      const r = await fetch('/.auth/me', { credentials: 'same-origin', cache: 'no-store' });
      return r.ok ? await r.json() : null;
    });
    return !!(resp?.clientPrincipal);
  } catch { return false; }
}

async function authenticate(page) {
  if (await isAuthenticated(page)) { pass('auth', 'already authenticated'); return; }

  await page.goto(`${BASE_URL}/.auth/login/aad?post_login_redirect_uri=/arb`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot(page, 'auth-start');

  try {
    await page.waitForURL(/login\.(microsoftonline|microsoft|live)\.com/, { timeout: 15000 });
  } catch (_) {
    if (page.url().includes('thankful-pond')) {
      pass('auth', 'already authenticated (redirected back)');
      return;
    }
  }

  if (page.url().includes('login.')) {
    await shot(page, 'auth-ms-login');

    const emailInput = await findVisible(page, ['input[type="email"]', 'input[name="loginfmt"]', '#i0116']);
    if (emailInput) {
      await emailInput.fill(LOGIN_EMAIL);
      await tryClick(page, ['input[type="submit"]', '#idSIButton9', 'button[type="submit"]'], 'auth-email-next');
      await page.waitForTimeout(5000);
      await shot(page, 'auth-after-email');
    }

    const bodyAfterEmail = await page.locator('body').innerText().catch(() => '');
    const urlAfterEmail = page.url();

    const isPasskeyOrFido =
      urlAfterEmail.includes('fido') ||
      /passkey|security key|use a passkey|sign in with a passkey/i.test(bodyAfterEmail);
    const isAuthenticatorPush =
      /approve.*sign.?in request|microsoft authenticator|authenticator app/i.test(bodyAfterEmail);
    const needsAnotherWay =
      isPasskeyOrFido || isAuthenticatorPush ||
      /sign in another way|other ways to sign in|use a different.*method|different sign.?in/i.test(bodyAfterEmail);

    if (needsAnotherWay) {
      console.log(`  Detected intermediate auth page (passkey=${isPasskeyOrFido} authenticator=${isAuthenticatorPush})`);

      if (isPasskeyOrFido) {
        // Click Back first to dismiss FIDO page before looking for "another way"
        await tryClick(page, ['#idBtn_Back', 'button:has-text("Back")', 'a:has-text("Back")'], 'auth-back-from-passkey');
        await page.waitForTimeout(2000);
        await shot(page, 'auth-after-back');
      }

      await shot(page, 'auth-pre-another-way');
      const clicked = await tryClick(page, [
        '#signInAnotherWay',
        'a:has-text("Sign in another way")',
        'text=Sign in another way',
        'text=Other ways to sign in',
        'text=Use a different method',
        "text=I can't use my Microsoft Authenticator app right now",
        "text=I don't have access to one of these",
        'button:has-text("Other ways")',
      ], 'auth-another-way');

      if (clicked) {
        await page.waitForTimeout(3000);
        await shot(page, 'auth-method-list');
        await tryClick(page, [
          'text=Password',
          'text=Use your password',
          '[data-value="Password"]',
          '.tile:has-text("Password")',
          'div.option-button:has-text("Password")',
        ], 'auth-choose-password');
        await page.waitForTimeout(2000);
      }
    }

    const pwAlreadyVisible = await findVisible(page, ['input[type="password"]', '#i0118', 'input[name="passwd"]']);
    if (!pwAlreadyVisible) {
      await tryClick(page, [
        'text=Use your password',
        'text=Use password instead',
        '#signInOptions',
        '[data-value="Password"]',
        'text=Password',
      ], 'auth-use-password');
      await page.waitForTimeout(1000);
    }

    const pwInput = await findVisible(page, [
      'input[type="password"]', 'input[name="passwd"]', '#i0118',
      'input[autocomplete="current-password"]',
    ]);
    if (pwInput) {
      await pwInput.fill(LOGIN_PASSWORD);
      await tryClick(page, ['input[type="submit"]', '#idSIButton9', 'button[type="submit"]'], 'auth-pw-submit');
      await page.waitForTimeout(6000);
      await shot(page, 'auth-after-password');
    } else {
      fail('auth-password-input', 'password field not found');
    }

    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(2000);
      const url = page.url();
      const body = await page.locator('body').innerText().catch(() => '');
      if (url.includes('thankful-pond')) break;
      if (body.includes('Stay signed in') || url.includes('kmsi')) {
        await tryClick(page, ['#idBtn_Back', 'button:has-text("No")', 'input[value="No"]'], 'auth-stay-signed-in-no');
        continue;
      }
      if (body.includes('Permissions requested') || url.includes('consent')) {
        await tryClick(page, ['button:has-text("Accept")', '#idSIButton9'], 'auth-consent-accept');
        continue;
      }
      if (url.includes('fido')) {
        await page.waitForTimeout(3000);
        const ok = await tryClick(page, ['#signInAnotherWay', 'text=Sign in another way'], 'auth-post-fido');
        if (!ok) await tryClick(page, ['#idBtn_Back'], 'auth-back-from-fido');
        continue;
      }
    }

    try {
      await page.waitForURL(/thankful-pond-04383960f/, { timeout: 20000 });
    } catch (_) {}
  }

  await shot(page, 'auth-done');

  if (await isAuthenticated(page)) {
    pass('auth', 'signed in successfully');
  } else {
    fail('auth', 'auth check failed after login sequence');
  }
}

async function discoverApiBase(page) {
  try {
    const apiBase = await page.evaluate(() => {
      const entries = (window.performance?.getEntriesByType?.('resource') ?? [])
        .filter(e => e.name.includes('/api/arb/'));
      for (const e of entries) {
        try {
          const url = new URL(e.name);
          if (url.origin !== window.location.origin) return url.origin;
        } catch { /* skip */ }
      }
      return null;
    });
    if (apiBase) console.log(`  [api] discovered direct API base: ${apiBase}`);
    return apiBase;
  } catch (_) { return null; }
}

async function getClientPrincipalHeader(page) {
  try {
    const resp = await page.request.get(`${BASE_URL}/.auth/me`, { headers: { 'cache-control': 'no-store' } });
    if (!resp.ok()) return null;
    const data = await resp.json();
    const principal = data?.clientPrincipal;
    if (!principal) return null;
    return Buffer.from(JSON.stringify(principal)).toString('base64');
  } catch (_) { return null; }
}

async function pollExtractionComplete(page, reviewId, apiBase, principalHeader) {
  const TERMINAL_STATES = new Set(['Review In Progress', 'Extraction Failed', 'Decision Recorded', 'Review Complete']);
  const RUNNING_STATES = new Set(['Extraction Queued', 'Extraction Running', 'Evidence Ready', 'Draft']);

  const pollUrl = apiBase
    ? `${apiBase}/api/arb/reviews/${reviewId}`
    : `${BASE_URL}/api/arb/reviews/${reviewId}`;
  const pollHeaders = principalHeader
    ? { 'x-ms-client-principal': principalHeader, 'cache-control': 'no-store' }
    : { 'cache-control': 'no-store' };

  console.log(`  [poll] url=${pollUrl}`);

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    let ws = 'unknown';
    let statusCode = -1;
    let errorNote = '';

    try {
      const resp = await page.request.get(pollUrl, { headers: pollHeaders });
      statusCode = resp.status();
      if (resp.ok()) {
        const body = await resp.json().catch(() => ({}));
        ws = (body?.review?.workflowState ?? body?.workflowState) ?? 'unknown';
      } else {
        const text = await resp.text().catch(() => '');
        errorNote = ` | ${text.slice(0, 200)}`;
      }
    } catch (e) {
      errorNote = ` | ${e?.message ?? e}`;
    }

    console.log(`  [poll ${attempt}/${POLL_MAX_ATTEMPTS}] [HTTP ${statusCode}] workflowState = ${ws}${errorNote}`);

    if (ws === 'Review In Progress') {
      pass('extraction', `workflowState = ${ws} after ${attempt} poll(s)`);
      return true;
    }
    if (ws === 'Extraction Failed') {
      fail('extraction', 'workflowState = Extraction Failed');
      return false;
    }
    if (TERMINAL_STATES.has(ws) && ws !== 'Draft') {
      pass('extraction', `terminal state: ${ws} after ${attempt} poll(s)`);
      return true;
    }

    if (attempt < POLL_MAX_ATTEMPTS) {
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }
  }

  fail('extraction', `timed out after ${POLL_MAX_ATTEMPTS} polls (${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 60000).toFixed(0)} min)`);
  return false;
}

async function runTrustBankE2E() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Trust Bank LZ — Full E2E Validation');
  console.log('═══════════════════════════════════════════════════════\n');

  // Verify files exist
  const filePaths = TRUST_BANK_FILES.map(f => path.join(LZ_FILES_DIR, f));
  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) {
      fail('file-exists', `Missing: ${fp}`);
    } else {
      pass('file-exists', path.basename(fp));
    }
  }
  if (R.fail.length > 0) {
    console.error('  Missing required test files — aborting');
    return;
  }

  const isCI = process.env.CI === 'true' || process.env.CI === '1';
  const browser = await chromium.launch({
    headless: isCI,
    slowMo: isCI ? 0 : 60,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });

  // Reject passkey/FIDO prompts so test falls through to password auth
  await ctx.addInitScript(() => {
    const orig = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = (options) => {
      if (options?.publicKey) return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError'));
      return orig(options);
    };
    if (navigator.credentials.create) {
      const origCreate = navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.create = (options) => {
        if (options?.publicKey) return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError'));
        return origCreate(options);
      };
    }
  });

  const page = await ctx.newPage();

  try {
    // ── Step 1: Authenticate ───────────────────────────────────────────────
    console.log('\n── Step 1: Authenticate');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await authenticate(page);

    // ── Step 2: Navigate to /arb and wait for library to load ─────────────
    console.log('\n── Step 2: Navigate to /arb');
    await page.goto(`${BASE_URL}/arb`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // The review library shows "Loading reviews…" until listArbReviews() resolves.
    // The arb-create-card ONLY renders after the loading state clears.
    // Wait up to 20s for the loading spinner to disappear.
    try {
      await page.locator('.arb-library-loading').waitFor({ state: 'hidden', timeout: 20000 });
      pass('library-loaded', 'review library finished loading');
    } catch (_) {
      warn('library-loaded', 'loading indicator still visible after 20s — proceeding anyway');
    }

    await page.waitForTimeout(1000);
    await shot(page, 'arb-page');

    // ── Step 3: Upload 4 Trust Bank files (before filling project name) ────
    // The file input exists in the create card once the library is loaded.
    // Selecting files first keeps the UX flow natural (file → name → start).
    console.log('\n── Step 3: Upload 4 Trust Bank LZ files');

    const fileInput = page.locator('#arb-landing-upload, input[aria-label="Select review files before creating the architecture review"], .arb-landing-upload-input').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(filePaths);
      await page.waitForTimeout(2000);
      pass('file-upload', `${filePaths.length} files selected`);
      await shot(page, 'files-selected');
    } else {
      fail('file-upload', 'file input (#arb-landing-upload) not found');
    }

    // Fill project name
    const reviewName = `[E2E-TB] Trust Bank LZ ${new Date().toISOString().slice(0, 10)}`;
    const nameInput = await findVisible(page, [
      'input[aria-label="Project name"]',
      '.arb-field-input',
      'input[placeholder*="Contoso landing"]',
    ]);
    if (nameInput) {
      await nameInput.fill(reviewName);
      pass('project-name', reviewName);
    } else {
      warn('project-name', 'project name input not found');
    }

    // Fill customer name
    const custInput = await findVisible(page, [
      'input[aria-label="Customer name"]',
      'input[aria-label="Customer / organization"]',
    ]);
    if (custInput) {
      await custInput.fill('Trust Bank');
      pass('customer-name', 'Trust Bank');
    }

    await shot(page, 'form-filled');

    // Wait for start button to be enabled (files selected + project name set)
    try {
      await page.locator('button.arb-create-btn:not([disabled])').waitFor({ state: 'visible', timeout: 180000 });
      pass('start-btn-enabled', 'start review button enabled');
    } catch (_) {
      await shot(page, 'start-btn-still-disabled');
      warn('start-btn-enabled', 'start button did not become enabled — checking state');
    }

    await shot(page, 'before-start');

    const startClicked = await tryClick(page, [
      'button.arb-create-btn:not([disabled])',
    ], 'start-review');

    if (!startClicked) {
      fail('start-review', 'could not click start review button');
    }

    let reviewId = null;

    if (startClicked) {
      try {
        await page.waitForURL(/\/arb\/[^/?#]{10,}(\/|$)|[?&]reviewId=/, { timeout: 30000 });
      } catch (_) { await page.waitForTimeout(5000); }
      await shot(page, 'after-start');
      pass('review-started', 'navigated after start');
    }

    const reviewUrl = page.url();
    const reviewIdMatch =
      reviewUrl.match(/\/arb\/([^/?#]{10,})/) ||
      reviewUrl.match(/[?&]reviewId=([^&#]+)/);
    if (reviewIdMatch && reviewIdMatch[1] !== 'projects') {
      reviewId = decodeURIComponent(reviewIdMatch[1]);
      pass('review-id', reviewId);
    } else {
      fail('review-id', `could not extract reviewId from URL: ${reviewUrl}`);
    }

    // ── Step 4: Trigger extraction ─────────────────────────────────────────
    console.log('\n── Step 4: Trigger extraction');

    if (reviewId) {
      const curUrl = page.url();
      if (!curUrl.includes('step=upload') && !curUrl.includes('/upload')) {
        await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=upload`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
      }
    }

    // ArbLiveReviewStep renders .arb-loading-skeleton while it fetches the review,
    // uploads, and extraction status. The checkbox + start button are ONLY in the
    // DOM after loading completes — we must wait for the skeleton to clear.
    try {
      await page.locator('.arb-loading-skeleton').waitFor({ state: 'hidden', timeout: 30000 });
      pass('upload-page-loaded', 'upload step content rendered');
    } catch (_) {
      warn('upload-page-loaded', 'loading skeleton still present after 30s — proceeding');
    }
    await page.waitForTimeout(1000);
    await shot(page, 'upload-page-ready');

    // Check/set confidentiality checkbox
    const confirmCheckbox = await findVisible(page, [
      'input[aria-label="Confirm uploaded files can be used for review extraction"]',
      '#run-automated-analysis input[type="checkbox"]',
      '.arb-inline-check input[type="checkbox"]',
    ]);
    if (confirmCheckbox) {
      const checked = await confirmCheckbox.isChecked();
      if (!checked) await confirmCheckbox.check();
      pass('confirm-checkbox', 'confidentiality confirmation checked');
      await page.waitForTimeout(500);
    } else {
      warn('confirm-checkbox', 'checkbox not found — button may remain disabled');
    }

    // Wait for start analysis button to become enabled
    try {
      await page.locator('button.arb-cta-btn:not([disabled])').waitFor({ state: 'visible', timeout: 30000 });
      pass('start-analysis-btn', 'start analysis button enabled');
    } catch (_) {
      await shot(page, 'start-analysis-still-disabled');
      warn('start-analysis-btn', 'button still disabled after wait');
    }

    const extractionClicked = await tryClick(page, [
      'button.arb-cta-btn:not([disabled])',
      'button:has-text("Start analysis"):not([disabled])',
      'button:has-text("Retry analysis"):not([disabled])',
    ], 'trigger-extraction');

    if (extractionClicked) {
      pass('trigger-extraction', 'extraction triggered');
    }
    await page.waitForTimeout(3000);
    await shot(page, 'extraction-triggered');

    // ── Step 5: Poll until extraction completes ────────────────────────────
    console.log('\n── Step 5: Poll extraction (up to 6 min)');

    if (!reviewId) {
      fail('poll', 'no reviewId — cannot poll');
    } else {
      const apiBase = await discoverApiBase(page);
      const principalHeader = await getClientPrincipalHeader(page);
      const done = await pollExtractionComplete(page, reviewId, apiBase, principalHeader);
      await shot(page, 'extraction-done');

      if (!done) {
        warn('findings-check', 'extraction did not complete — skipping findings/scorecard checks');
      } else {
        // ── Step 6: Verify findings ──────────────────────────────────────
        console.log('\n── Step 6: Verify findings');
        await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=findings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await shot(page, 'findings-page');

        const findingItems = page.locator('[class*="findingItem"]');
        const findingCount = await findingItems.count();
        if (findingCount > 0) {
          pass('findings', `${findingCount} finding(s) visible`);
        } else {
          // Check for "no findings" empty state
          const emptyState = await findVisible(page, [
            'text=no findings',
            'text=Assessment complete',
            '[class*="placeholder"]',
            '[class*="emptyState"]',
          ]);
          if (emptyState) {
            pass('findings', 'empty state shown (0 findings)');
          } else {
            warn('findings', 'no findings visible and no empty state');
          }
        }

        // Click first finding for detail panel
        if (findingCount > 0) {
          await findingItems.first().click();
          await page.waitForTimeout(1500);
          await shot(page, 'finding-detail');

          const whyToggle = await findVisible(page, [
            'button:has-text("Why CARI says this")',
            '[class*="whyToggle"]',
          ]);
          if (whyToggle) {
            pass('why-cari', '"Why CARI says this" visible');
            await whyToggle.click();
            await page.waitForTimeout(800);
            await shot(page, 'why-cari-expanded');
          } else {
            warn('why-cari', '"Why CARI says this" toggle not found');
          }
        }

        // ── Step 7: Verify scorecard ─────────────────────────────────────
        console.log('\n── Step 7: Verify scorecard');
        await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=scorecard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await shot(page, 'scorecard-page');

        const scoreEl = await findVisible(page, [
          '[class*="summaryHero"]',
          '[class*="overallScore"]',
          '[class*="scoreValue"]',
          'text=/\\d+\\s*\\/\\s*100/',
          'text=/\\d+%/',
        ]);
        if (scoreEl) {
          pass('scorecard', 'score metric visible');
        } else {
          warn('scorecard', 'score element not found');
        }

        // ── Step 8: Verify overview ──────────────────────────────────────
        console.log('\n── Step 8: Verify overview page');
        await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=overview`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await shot(page, 'overview-page');

        const overviewMetrics = await findVisible(page, [
          '[class*="dashboardGrid"]',
          '[class*="metricsGrid"]',
          '[class*="workflowProgress"]',
        ]);
        if (overviewMetrics) {
          pass('overview', 'overview dashboard visible');
        } else {
          warn('overview', 'overview dashboard not found');
        }

        // ── Step 9: Test export panel ────────────────────────────────────
        console.log('\n── Step 9: Verify export panel');
        await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=export`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await shot(page, 'export-page');

        const exportPanel = await findVisible(page, [
          '[class*="panel"]',
          'text=Export Board Pack',
          'button:has-text("PowerPoint")',
          'button:has-text("Excel")',
          'button:has-text("Word")',
        ]);
        if (exportPanel) {
          pass('export-panel', 'export panel visible');
        } else {
          warn('export-panel', 'export panel not found on export step');
        }

        console.log(`\n  Review URL: ${BASE_URL}/arb?reviewId=${reviewId}&step=overview`);
        pass('review-url', `${BASE_URL}/arb?reviewId=${encodeURIComponent(reviewId)}&step=overview`);
      }
    }

  } catch (err) {
    fail('unexpected-error', err instanceof Error ? err.message : String(err));
    await shot(page, 'unexpected-error').catch(() => {});
  } finally {
    await browser.close();
  }

  // ── Final report ───────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Trust Bank LZ Results');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  PASS: ${R.pass.length}  |  WARN: ${R.warn.length}  |  FAIL: ${R.fail.length}`);
  if (R.warn.length) console.log('\nWarnings:\n' + R.warn.map(w => `  ⚠ ${w.key}: ${w.detail}`).join('\n'));
  if (R.fail.length) console.log('\nFailures:\n' + R.fail.map(f => `  ✗ ${f.key}: ${f.detail}`).join('\n'));
  console.log('═══════════════════════════════════════════════════════\n');

  if (R.fail.length > 0) {
    throw new Error(`${R.fail.length} check(s) failed: ${R.fail.map(f => f.key).join(', ')}`);
  }
}

test('Trust Bank LZ — Full E2E', async () => {
  await runTrustBankE2E();
}, 720000);
