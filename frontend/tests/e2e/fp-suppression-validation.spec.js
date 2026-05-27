'use strict';

/**
 * FP-VAL — False-positive suppression validation.
 *
 * Creates a new review, uploads all 6 Contoso Financial Services Landing Zone
 * files, runs the automated assessment, then asserts:
 *
 *   1. NO boundary-control finding (hub-spoke topology is documented in
 *      Contoso_ALZ_Hub_Spoke_Network_Topology.drawio + contoso-alz-architecture.drawio)
 *
 *   2. NO runbook/operational-ownership finding (operational ownership is
 *      always Managed Services / Operations responsibility — never in scope
 *      for a PS Landing Zone design review)
 *
 * These two findings are the known false positives for Contoso LZ documents
 * and must be suppressed by both write-time (runAgent) and read-time
 * (arbGetFindings) suppression layers.
 */

const { chromium, test } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

// ── constants ──────────────────────────────────────────────────────────────

const BASE_URL = process.env.E2E_BASE_URL || 'https://thankful-pond-04383960f.7.azurestaticapps.net';
const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL || 'cari.pilot@outlook.com';
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD || '';
const SCREENSHOTS_DIR = process.env.E2E_SCREENSHOTS_DIR || 'c:\\tmp\\playwright-qa\\screenshots\\fp-validation';

// File resolution order:
//   1. FP_TEST_FILES_DIR env var (explicit override)
//   2. Real Contoso files on dev machine (gitignored, richer content)
//   3. Synthetic fixtures committed to repo (used in CI)
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'contoso-lz');
const LOCAL_FILES_DIR = 'c:\\cari-repo\\Test LZ files\\Contoso Financial Services';
function resolveFilesBase() {
  if (process.env.FP_TEST_FILES_DIR) return process.env.FP_TEST_FILES_DIR;
  // Prefer real files if they exist locally
  try {
    fs.accessSync(path.join(LOCAL_FILES_DIR, 'Contoso_ALZ_Hub_Spoke_Network_Topology.drawio'));
    return LOCAL_FILES_DIR;
  } catch (_) { /* not available — use fixtures */ }
  return FIXTURE_DIR;
}
const FILES_BASE = resolveFilesBase();
console.log(`  [files] using: ${FILES_BASE}`);

const UPLOAD_FILES = [
  path.join(FILES_BASE, 'Contoso_ALZ_High_Level_Design_v1.0.docx'),
  path.join(FILES_BASE, 'Contoso_ALZ_Hub_Spoke_Network_Topology.drawio'),
  path.join(FILES_BASE, 'Contoso_ALZ_Low_Level_Design_v1.0.xlsx'),
  path.join(FILES_BASE, 'Contoso_ALZ_Statement_of_Work_v1.0.docx'),
  path.join(FILES_BASE, 'contoso-alz-architecture.drawio'),
  path.join(FILES_BASE, 'contoso-alz-hld.png'),
];

const POLL_INTERVAL_MS = 30_000;
const POLL_MAX_ATTEMPTS = 20; // 10 minutes

// ── result tracking ────────────────────────────────────────────────────────

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
  } catch (_) {}
}

// ── selector helpers ───────────────────────────────────────────────────────

async function findVisible(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 })) return el;
    } catch (_) {}
  }
  return null;
}

async function tryClick(page, selectors, desc) {
  const el = await findVisible(page, selectors);
  if (el) { await el.click(); return true; }
  warn(desc, 'no selector matched — skipping');
  return false;
}

// ── authentication ─────────────────────────────────────────────────────────

async function isAuthenticated(page) {
  try {
    const resp = await page.request.get(`${BASE_URL}/.auth/me`, { headers: { 'cache-control': 'no-store' } });
    if (!resp.ok()) return false;
    const data = await resp.json();
    return !!(data?.clientPrincipal);
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
    if (page.url().includes('thankful-pond')) { pass('auth', 'already authenticated'); return; }
  }

  if (page.url().includes('login.')) {
    const emailInput = await findVisible(page, ['input[type="email"]', 'input[name="loginfmt"]', '#i0116']);
    if (emailInput) {
      await emailInput.fill(LOGIN_EMAIL);
      await tryClick(page, ['input[type="submit"]', '#idSIButton9', 'button[type="submit"]'], 'auth-email-next');
      await page.waitForTimeout(5000);
      await shot(page, 'auth-after-email');
    }

    const bodyAfterEmail = await page.locator('body').innerText().catch(() => '');
    const urlAfterEmail = page.url();
    const isPasskeyOrFido = urlAfterEmail.includes('fido') || /passkey|security key|use a passkey/i.test(bodyAfterEmail);
    const isAuthenticatorPush = /approve.*sign.?in request|microsoft authenticator/i.test(bodyAfterEmail);
    const needsAnotherWay = isPasskeyOrFido || isAuthenticatorPush ||
      /sign in another way|other ways to sign in/i.test(bodyAfterEmail);

    if (needsAnotherWay) {
      console.log(`  Detected intermediate auth page — navigating to password method`);
      if (isPasskeyOrFido) {
        // On the "Face, fingerprint, PIN or security key" screen, click Back to get
        // to the method-selection screen rather than waiting for auto-failure.
        const backClicked = await tryClick(page, [
          'button:has-text("Back")', 'input[value="Back"]', '#idBtn_Back',
        ], 'auth-fido-back');
        if (backClicked) {
          await page.waitForTimeout(3000);
        } else {
          // Fallback: wait for it to auto-fail and show error/another-way link
          try {
            await page.waitForFunction(() => {
              const b = document.body?.innerText || '';
              return b.includes("couldn't sign you in") || b.includes("Sign in another way");
            }, { timeout: 15000 });
          } catch (_) { await page.waitForTimeout(5000); }
        }
      }
      await shot(page, 'auth-pre-another-way');
      const clicked = await tryClick(page, [
        '#signInAnotherWay', 'a:has-text("Sign in another way")', 'text=Sign in another way',
        'text=Other ways to sign in', "text=I can't use my Microsoft Authenticator app right now",
        "text=I don't have access to one of these",
      ], 'auth-another-way');
      if (clicked) {
        await page.waitForTimeout(3000);
        await tryClick(page, ['text=Password', 'text=Use your password', '[data-value="Password"]',
          '.tile:has-text("Password")', 'div.option-button:has-text("Password")'], 'auth-choose-password');
        await page.waitForTimeout(2000);
      }
    }

    const pwAlreadyVisible = await findVisible(page, ['input[type="password"]', '#i0118', 'input[name="passwd"]']);
    if (!pwAlreadyVisible) {
      await tryClick(page, ['text=Use your password', 'text=Use password instead', '#signInOptions',
        '[data-value="Password"]'], 'auth-use-password');
      await page.waitForTimeout(1000);
    }

    const pwInput = await findVisible(page, ['input[type="password"]', 'input[name="passwd"]', '#i0118',
      'input[autocomplete="current-password"]']);
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
        await tryClick(page, ['#idBtn_Back', 'button:has-text("No")', 'input[value="No"]'], 'auth-stay');
        continue;
      }
      if (body.includes('Permissions requested') || url.includes('consent')) {
        await tryClick(page, ['button:has-text("Accept")', '#idSIButton9'], 'auth-consent');
        continue;
      }
    }

    try { await page.waitForURL(/thankful-pond-04383960f/, { timeout: 20000 }); } catch (_) {}
  }

  await shot(page, 'auth-done');
  if (await isAuthenticated(page)) {
    pass('auth', 'signed in successfully');
  } else {
    fail('auth', 'auth check failed after login sequence');
  }
}

// ── API helpers ────────────────────────────────────────────────────────────

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

// ── poll extraction ────────────────────────────────────────────────────────

async function pollExtractionComplete(page, reviewId, apiBase, principalHeader) {
  const TERMINAL = new Set(['Review In Progress', 'Extraction Failed', 'Decision Recorded']);
  const RUNNING = new Set(['Extraction Queued', 'Extraction Running', 'Evidence Ready']);

  const pollUrl = apiBase
    ? `${apiBase}/api/arb/reviews/${reviewId}`
    : `${BASE_URL}/api/arb/reviews/${reviewId}`;
  const headers = principalHeader
    ? { 'x-ms-client-principal': principalHeader, 'cache-control': 'no-store' }
    : { 'cache-control': 'no-store' };

  console.log(`  [poll] url=${pollUrl} auth=${principalHeader ? 'yes' : 'no'}`);

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    let ws = 'unknown'; let statusCode = -1; let note = '';
    try {
      const resp = await page.request.get(pollUrl, { headers });
      statusCode = resp.status();
      if (resp.ok()) {
        const body = await resp.json().catch(() => ({}));
        ws = (body?.review?.workflowState ?? body?.workflowState) ?? 'unknown';
      } else {
        note = ` | ${(await resp.text().catch(() => '')).slice(0, 200)}`;
      }
    } catch (e) { note = ` | ${e?.message ?? e}`; }
    console.log(`  [poll ${attempt}/${POLL_MAX_ATTEMPTS}] [HTTP ${statusCode}] workflowState=${ws}${note}`);
    if (ws === 'Review In Progress') { pass('extraction', `done after ${attempt} poll(s)`); return true; }
    if (ws === 'Extraction Failed') { fail('extraction', 'state=Extraction Failed'); return false; }
    if (!RUNNING.has(ws) && TERMINAL.has(ws)) { pass('extraction', `terminal state: ${ws}`); return true; }
    if (attempt < POLL_MAX_ATTEMPTS) await page.waitForTimeout(POLL_INTERVAL_MS);
  }
  fail('extraction', `timed out after ${POLL_MAX_ATTEMPTS} polls`);
  return false;
}

// ── main test ──────────────────────────────────────────────────────────────

async function runFpValidation() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' FP-VAL — False-Positive Suppression Validation');
  console.log(' Contoso Financial Services Landing Zone (6 files)');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('  Files:');
  UPLOAD_FILES.forEach(f => console.log(`    • ${path.basename(f)}`));
  console.log('');

  const isCI = process.env.CI === 'true' || process.env.CI === '1';
  const browser = await chromium.launch({
    headless: isCI,
    slowMo: isCI ? 0 : 60,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });

  await ctx.addInitScript(() => {
    const orig = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = (opts) => {
      if (opts?.publicKey) return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError'));
      return orig(opts);
    };
    if (navigator.credentials.create) {
      const origCreate = navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.create = (opts) => {
        if (opts?.publicKey) return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError'));
        return origCreate(opts);
      };
    }
  });

  const page = await ctx.newPage();

  try {
    // ── Step 1: Authenticate ─────────────────────────────────────────────
    console.log('\n── Step 1: Authenticate');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await authenticate(page);

    // ── Step 2: Navigate to /arb ─────────────────────────────────────────
    console.log('\n── Step 2: Navigate to /arb and fill review name');
    await page.goto(`${BASE_URL}/arb`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, 'arb-page');

    const reviewName = `[FP-VAL] Contoso FS LZ ${Date.now()}`;
    const nameInput = await findVisible(page, [
      'input[aria-label="Project name"]',
      'input[placeholder*="landing zone"]',
      'input[placeholder*="Contoso"]',
      '.arb-field-input',
    ]);
    if (nameInput) {
      await nameInput.fill(reviewName);
      pass('review-name', reviewName);
    } else {
      warn('review-name', 'name input not found — proceeding');
    }

    // ── Step 3: Upload all 6 files ───────────────────────────────────────
    console.log('\n── Step 3: Upload 6 Contoso Financial Services files');
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(UPLOAD_FILES);
      await page.waitForTimeout(2000);
      pass('file-upload', `${UPLOAD_FILES.length} files selected`);
      await shot(page, 'files-selected');
    } else {
      fail('file-upload', 'file input not found');
    }

    try {
      await page.locator('button.arb-create-btn:not([disabled])').waitFor({ state: 'visible', timeout: 10000 });
    } catch (_) { await shot(page, 'start-btn-disabled'); }

    const startClicked = await tryClick(page, ['button.arb-create-btn:not([disabled])'], 'start-review');
    let reviewId = null;

    if (startClicked) {
      try {
        await page.waitForURL(/\/arb\/[^/?#]{10,}(\/|$)|[?&]reviewId=/, { timeout: 30000 });
      } catch (_) { await page.waitForTimeout(5000); }
      await shot(page, 'after-start');
      pass('review-started', 'review created and files submitted');
    } else {
      fail('review-started', 'start button not found/click failed');
    }

    const reviewUrl = page.url();
    const m = reviewUrl.match(/\/arb\/([^/?#]{10,})/) || reviewUrl.match(/[?&]reviewId=([^&#]+)/);
    if (m && m[1] !== 'projects') {
      reviewId = m[1];
      pass('review-id', reviewId);
    } else {
      fail('review-id', `cannot extract reviewId from: ${reviewUrl}`);
    }

    // ── Step 4: Trigger extraction ───────────────────────────────────────
    console.log('\n── Step 4: Trigger extraction + assessment');
    if (reviewId) {
      // Always navigate to upload step so we see the CTA button.
      // After file submission the app stays on the upload step, but the URL
      // might include a hash or extra params — navigate explicitly to be safe.
      await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=upload`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    const checkbox = await findVisible(page, [
      'input[aria-label="Confirm uploaded files can be used for review extraction"]',
      '#run-automated-analysis input[type="checkbox"]',
      '.arb-inline-check input[type="checkbox"]',
    ]);
    if (checkbox) {
      if (!await checkbox.isChecked()) await checkbox.check();
      pass('confirm-checkbox', 'checked');
    }
    await page.waitForTimeout(500);

    // With 6 files (docx, drawio, xlsx, png) extraction can take up to 3 min.
    // Wait up to 3 minutes for extraction to complete and CTA button to become enabled.
    console.log('  [wait] waiting up to 3 min for extraction to complete + CTA to enable...');
    try {
      await page.locator('button.arb-cta-btn:not([disabled])').waitFor({ state: 'visible', timeout: 180000 });
    } catch (_) { await shot(page, 'cta-btn-still-disabled'); }

    const triggered = await tryClick(page, [
      'button.arb-cta-btn:not([disabled])',
      'button:has-text("Start analysis"):not([disabled])',
    ], 'trigger-extraction');
    if (triggered) pass('trigger-extraction', 'extraction started');
    await page.waitForTimeout(3000);
    await shot(page, 'extraction-triggered');

    // ── Step 5: Poll until extraction + assessment complete ───────────────
    console.log('\n── Step 5: Poll for completion (up to 10 min)');
    if (!reviewId) {
      fail('poll', 'no reviewId — cannot poll');
    } else {
      const apiBase = await discoverApiBase(page);
      const principalHeader = await getClientPrincipalHeader(page);
      const done = await pollExtractionComplete(page, reviewId, apiBase, principalHeader);
      await shot(page, 'extraction-done');

      if (!done) {
        fail('assessment', 'extraction/assessment did not complete');
      } else {
        // ── Step 6: Fetch findings and validate ──────────────────────────
        console.log('\n── Step 6: Fetch findings and validate false-positive suppression');

        const apiBase2 = await discoverApiBase(page);
        const ph2 = await getClientPrincipalHeader(page);
        const findingsUrl = apiBase2
          ? `${apiBase2}/api/arb/reviews/${reviewId}/findings`
          : `${BASE_URL}/api/arb/reviews/${reviewId}/findings`;
        const fHeaders = ph2
          ? { 'x-ms-client-principal': ph2, 'cache-control': 'no-store' }
          : { 'cache-control': 'no-store' };

        console.log(`  [findings] GET ${findingsUrl}`);
        const fResp = await page.request.get(findingsUrl, { headers: fHeaders });
        console.log(`  [findings] HTTP ${fResp.status()}`);

        if (!fResp.ok()) {
          const text = await fResp.text().catch(() => '');
          fail('findings-fetch', `HTTP ${fResp.status()}: ${text.slice(0, 200)}`);
        } else {
          const body = await fResp.json();
          const findings = body?.findings ?? [];
          pass('findings-fetch', `${findings.length} finding(s) returned by API`);

          console.log('\n  All findings in API response:');
          findings.forEach((f, i) => {
            console.log(`  [${i + 1}] source=${f.source ?? 'llm'} sev=${f.severity} | "${f.title}"`);
          });
          console.log('');

          // ── ASSERTION 1: No boundary-control false positive ────────────
          // Uploaded Contoso_ALZ_Hub_Spoke_Network_Topology.drawio + contoso-alz-architecture.drawio
          // explicitly document the hub-spoke pattern. Any "boundary control" finding is a false positive.
          const BOUNDARY_CONTROL_RE = [/boundary.control/i, /not yet explicit/i];
          const boundaryFPs = findings.filter(f =>
            BOUNDARY_CONTROL_RE.some(re => re.test(f.title ?? '') || re.test(f.findingStatement ?? ''))
          );
          if (boundaryFPs.length === 0) {
            pass('no-boundary-control-fp',
              'boundary-control finding correctly suppressed — hub-spoke is documented in uploaded files');
          } else {
            fail('no-boundary-control-fp',
              `boundary-control finding NOT suppressed: ${boundaryFPs.map(f => `"${f.title}"`).join('; ')} ` +
              '— Contoso_ALZ_Hub_Spoke_Network_Topology.drawio + contoso-alz-architecture.drawio evidence hub-spoke topology');
          }

          // ── ASSERTION 2: No runbook/operational-ownership false positive ─
          // Operational/runbook ownership is always Managed Services / Operations scope,
          // never in scope for PS Landing Zone design reviews.
          const OPS_RE = [
            /runbook\s+ownership/i, /operational\s+ownership/i, /runbook\s+owner/i,
            /incident\s+ownership/i, /deployment\s+ownership/i, /ownership\s+needs\s+clarif/i,
          ];
          const opsFPs = findings.filter(f =>
            OPS_RE.some(re => re.test(f.title ?? '') || re.test(f.findingStatement ?? ''))
          );
          if (opsFPs.length === 0) {
            pass('no-ops-ownership-fp',
              'runbook/operational-ownership finding correctly suppressed — operational ownership is out of PS design review scope');
          } else {
            fail('no-ops-ownership-fp',
              `OPS ownership finding NOT suppressed: ${opsFPs.map(f => `"${f.title}"`).join('; ')} ` +
              '— this is always Managed Services/Operations responsibility');
          }

          // ── ASSERTION 3: At least some findings returned ─────────────────
          if (findings.length > 0) {
            pass('has-legitimate-findings', `${findings.length} finding(s) present — agent ran and produced output`);
          } else {
            warn('has-legitimate-findings',
              'zero findings returned — either all findings were false positives (suppressed) ' +
              'or the agent produced no output. Check assessment logs.');
          }

          // Navigate to findings page for visual verification screenshot
          await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=findings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);
          await shot(page, 'findings-page');
        }
      }
    }

  } catch (err) {
    fail('unexpected-error', err instanceof Error ? err.message : String(err));
    await shot(page, 'error').catch(() => {});
  } finally {
    await browser.close();
  }

  // ── Final report ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' FP-VAL Results');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  PASS: ${R.pass.length}  |  WARN: ${R.warn.length}  |  FAIL: ${R.fail.length}`);
  if (R.warn.length) console.log('\nWarnings:\n' + R.warn.map(w => `  ⚠ ${w.key}: ${w.detail}`).join('\n'));
  if (R.fail.length) console.log('\nFailures:\n' + R.fail.map(f => `  ✗ ${f.key}: ${f.detail}`).join('\n'));
  console.log('═══════════════════════════════════════════════════════\n');

  if (R.fail.length > 0) {
    throw new Error(`${R.fail.length} FP-VAL check(s) failed: ${R.fail.map(f => f.key).join(', ')}`);
  }
}

test('FP-VAL — False-Positive Suppression: Contoso Financial Services LZ', async () => {
  await runFpValidation();
}, 720000);
