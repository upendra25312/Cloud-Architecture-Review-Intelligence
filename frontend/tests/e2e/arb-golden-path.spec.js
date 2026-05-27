'use strict';

/**
 * C7 — ARB golden-path E2E smoke test.
 *
 * Flow: authenticate → create project → start review → upload doc →
 *       trigger extraction → poll until Review In Progress →
 *       verify findings (incl. "Why CARI says this" panel) →
 *       verify scorecard → download PPTX export.
 *
 * Runs against the live site. Creates a project with a [C7-TEST] prefix
 * so artefacts are identifiable and can be cleaned up manually if needed.
 *
 * Usage:
 *   npm --prefix frontend run test:e2e:golden-path
 */

const { chromium, test } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

// ── constants ──────────────────────────────────────────────────────────────

const BASE_URL = process.env.E2E_BASE_URL || 'https://thankful-pond-04383960f.7.azurestaticapps.net';
const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL || 'cari.pilot@outlook.com';
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD || '';
const SCREENSHOTS_DIR = process.env.E2E_SCREENSHOTS_DIR || 'c:\\tmp\\playwright-qa\\screenshots\\golden-path';

// Small plaintext architecture document — enough for the agent to produce findings
// without triggering a lengthy multi-document extraction run.
const UPLOAD_DOC_NAME = 'c7-test-architecture.txt';
const UPLOAD_DOC_CONTENT = `Architecture Review — C7 Test Submission

## Network Architecture
Hub-spoke topology planned but not yet deployed. No Azure Firewall configured.
No private endpoints configured for PaaS services. Public internet access enabled
on all storage accounts and SQL databases. No NSG rules in place on subnets.

## Identity & Access
No PIM configured for privileged roles. Break-glass accounts not documented.
No Conditional Access policies. MFA not enforced. No access review cadence.

## Security Controls
No Defender for Cloud. No Key Vault — secrets stored in app config as plaintext.
No encryption at rest policy. No certificate management process.

## Governance
No management group hierarchy. No RBAC model documented. No tagging policy.
No budget alerts. No compliance baseline.

## Operations
No central logging. No backup policy. No disaster recovery plan.
No monitoring alerts configured.
`;

const POLL_INTERVAL_MS = 30_000;
const POLL_MAX_ATTEMPTS = 20; // 10 minutes total

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
  } catch (_) {/* non-fatal */}
}

// ── selector helpers ───────────────────────────────────────────────────────

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

// ── authentication ─────────────────────────────────────────────────────────

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

  // Wait for Microsoft login page — wrap in try/catch so already-authed sessions don't throw
  try {
    await page.waitForURL(/login\.(microsoftonline|microsoft|live)\.com/, { timeout: 15000 });
  } catch (_) {
    if (page.url().includes('thankful-pond')) {
      pass('auth', 'already authenticated (redirected back to app)');
      return;
    }
  }

  // Only proceed if we're actually on the MS login page
  if (page.url().includes('login.')) {
    await shot(page, 'auth-ms-login');

    // Fill email
    const emailInput = await findVisible(page, ['input[type="email"]', 'input[name="loginfmt"]', '#i0116']);
    if (emailInput) {
      await emailInput.fill(LOGIN_EMAIL);
      await tryClick(page, ['input[type="submit"]', '#idSIButton9', 'button[type="submit"]'], 'auth-email-next');
      await page.waitForTimeout(5000);
      await shot(page, 'auth-after-email');
    }

    // Detect page type by URL AND body text — Microsoft updates their login UI frequently.
    // The FIDO/passkey page and Microsoft Authenticator push page both need to be navigated
    // through to reach the password field; they don't always have 'fido' in the URL.
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
      console.log(`  Detected intermediate auth page (passkey=${isPasskeyOrFido} authenticator=${isAuthenticatorPush}) — navigating to password method`);

      // For passkey/FIDO: wait for the WebAuthn rejection to surface the "another way" link
      if (isPasskeyOrFido) {
        try {
          await page.waitForFunction(() => {
            const b = document.body?.innerText || '';
            return b.includes("couldn't sign you in") || b.includes("Sign in another way") || b.includes("Other ways to sign in");
          }, { timeout: 15000 });
        } catch (_) { await page.waitForTimeout(5000); }
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

    // Fallback: only try "Use your password" if the password field isn't already visible
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

    // Fill password
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

    // Handle post-login prompts (Stay signed in, Consent, FIDO)
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

// ── poll extraction status ─────────────────────────────────────────────────

// Discover the API base URL the React app is actually using.
// The frontend uses NEXT_PUBLIC_API_URL to call the Azure Functions app DIRECTLY
// (bypassing SWA). We detect this by inspecting outgoing network requests the
// page has already made, then reuse the same base for poll requests.
// Falls back to '' (relative, goes through SWA) if no direct URL is found.
async function discoverApiBase(page, reviewId) {
  try {
    const apiBase = await page.evaluate(async (rid) => {
      // 1. Check performance resource entries for a fetch to /api/arb/ on a different origin.
      const entries = (window.performance?.getEntriesByType?.('resource') ?? [])
        .filter(e => e.name.includes('/api/arb/') && e.name.includes(rid));
      if (entries.length > 0) {
        const url = new URL(entries[0].name);
        const base = url.origin;
        if (base !== window.location.origin) return base;
      }
      // 2. Broader search: any /api/arb/ fetch on a different origin (e.g. uploads).
      const broad = (window.performance?.getEntriesByType?.('resource') ?? [])
        .filter(e => e.name.includes('/api/arb/'));
      for (const e of broad) {
        try {
          const url = new URL(e.name);
          if (url.origin !== window.location.origin) return url.origin;
        } catch { /* skip */ }
      }
      return '';
    }, reviewId);
    if (apiBase) console.log(`  [poll] using direct API base: ${apiBase}`);
    return apiBase;
  } catch (_) { return ''; }
}

async function pollExtractionComplete(page, reviewId, apiBase) {
  const TERMINAL_STATES = new Set([
    'Review In Progress',
    'Extraction Failed',
    'Decision Recorded',
  ]);
  const RUNNING_STATES = new Set([
    'Extraction Queued',
    'Extraction Running',
    'Evidence Ready',
  ]);

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    // Use the actual API base the React app uses (direct Functions URL if available,
    // relative SWA path otherwise). Include x-ms-client-principal for direct calls.
    let pollResult;
    try {
      pollResult = await page.evaluate(async ({ rid, base }) => {
        try {
          const fetchUrl = `${base}/api/arb/reviews/${rid}`;
          // For direct calls (non-SWA), inject the client principal from /.auth/me
          const extraHeaders = {};
          if (base) {
            try {
              const me = await fetch('/.auth/me', { credentials: 'same-origin', cache: 'no-store' });
              if (me.ok) {
                const meData = await me.json();
                const principal = meData?.clientPrincipal;
                if (principal) {
                  extraHeaders['x-ms-client-principal'] = btoa(JSON.stringify(principal));
                }
              }
            } catch { /* skip — will proceed without auth header */ }
          }
          const r = await fetch(fetchUrl, {
            credentials: base ? 'include' : 'same-origin',
            cache: 'no-store',
            headers: extraHeaders,
          });
          const text = await r.text().catch(() => '');
          if (!r.ok) {
            return { httpStatus: r.status, data: null, errorSnippet: text.slice(0, 300), fetchUrl };
          }
          try {
            return { httpStatus: r.status, data: JSON.parse(text), errorSnippet: null, fetchUrl };
          } catch {
            return { httpStatus: r.status, data: null, errorSnippet: `JSON parse failed: ${text.slice(0, 200)}`, fetchUrl };
          }
        } catch (e) {
          return { httpStatus: -1, data: null, errorSnippet: String(e), fetchUrl: 'unknown' };
        }
      }, { rid: reviewId, base: apiBase });
    } catch (evalErr) {
      pollResult = { httpStatus: -2, data: null, errorSnippet: `page.evaluate threw: ${evalErr?.message ?? evalErr}` };
    }

    const { httpStatus, data, errorSnippet, fetchUrl } = pollResult ?? {};

    // API returns { review: { workflowState: "..." } } — handle both wrapped and flat.
    const ws = (data?.review?.workflowState ?? data?.workflowState) ?? 'unknown';
    const statusTag = httpStatus != null ? ` [HTTP ${httpStatus}]` : '';
    const urlTag = attempt === 1 && fetchUrl ? ` url=${fetchUrl}` : '';
    const errorTag = errorSnippet ? ` | ${errorSnippet}` : '';
    console.log(`  [poll ${attempt}/${POLL_MAX_ATTEMPTS}]${statusTag}${urlTag} workflowState = ${ws}${errorTag}`);

    if (ws === 'Review In Progress') {
      pass('extraction-complete', `workflowState = ${ws} after ${attempt} poll(s)`);
      return true;
    }
    if (ws === 'Extraction Failed') {
      fail('extraction-complete', 'workflowState = Extraction Failed');
      return false;
    }
    if (!RUNNING_STATES.has(ws) && TERMINAL_STATES.has(ws)) {
      pass('extraction-complete', `terminal state ${ws}`);
      return true;
    }

    if (attempt < POLL_MAX_ATTEMPTS) {
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }
  }

  fail('extraction-complete', `timed out after ${POLL_MAX_ATTEMPTS} polls`);
  return false;
}

// ── main test ──────────────────────────────────────────────────────────────

async function runGoldenPath() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' C7 — ARB Golden Path E2E');
  console.log('═══════════════════════════════════════════════════════\n');

  const isCI = process.env.CI === 'true' || process.env.CI === '1';
  const browser = await chromium.launch({
    headless: isCI,
    slowMo: isCI ? 0 : 80,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
  });

  // Reject WebAuthn/passkey prompts so the test falls through to password auth
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
    // ── Step 1: Authenticate ─────────────────────────────────────────────
    console.log('\n── Step 1: Authenticate');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await authenticate(page);

    // ── Step 2: Create test project ─────────────────────────────────────
    console.log('\n── Step 2: Create test project');
    await page.goto(`${BASE_URL}/arb/projects`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, 'projects-page');

    await tryClick(page, [
      'button:has-text("New project")',
      'button:has-text("+ New project")',
      'button:has-text("Create your first project")',
    ], 'new-project-button');
    await page.waitForTimeout(1500);

    const projectName = `[C7-TEST] Golden Path ${Date.now()}`;

    // Use label-based selectors — the most reliable way to target the right field.
    // Placeholder-based selectors fail here because both inputs contain "Contoso".
    const nameInput = await findVisible(page, [
      'label:has-text("Project name") input',
      '.arb-modal-panel input[type="text"]',
    ]);
    if (nameInput) {
      await nameInput.fill(projectName);
      pass('project-name', projectName);
    } else {
      fail('project-name', 'name input not found');
    }

    const custInput = await findVisible(page, [
      'label:has-text("Customer name") input',
      'label:has-text("Customer") input',
    ]);
    if (custInput) {
      await custInput.fill('C7 Test Corp');
      pass('customer-name', 'C7 Test Corp');
    } else {
      fail('customer-name', 'customer input not found');
    }

    await shot(page, 'project-form-filled');

    // Wait for React to enable the submit button (both fields must be non-empty).
    // Scope to modal panel to avoid matching other submit buttons on the page.
    try {
      await page.locator('.arb-modal-panel button[type="submit"]:not([disabled])').waitFor({ state: 'visible', timeout: 5000 });
    } catch (_) { await shot(page, 'project-submit-still-disabled'); }

    await tryClick(page, [
      '.arb-modal-panel button[type="submit"]:not([disabled])',
      'button:has-text("Create project"):not([disabled])',
    ], 'submit-create-project');

    // App stays at /arb/projects after project creation — it just closes the modal
    // and refreshes the list. Wait for the modal backdrop to disappear, then
    // click "Open project →" for the newly created project.
    try {
      await page.locator('.arb-modal-backdrop').waitFor({ state: 'hidden', timeout: 8000 });
    } catch (_) { /* modal dismissed or never opened */ }
    await page.waitForTimeout(1000);
    await shot(page, 'project-created');

    const openProjectLink = await findVisible(page, [
      'a.primary-button:has-text("Open project")',
      'a:has-text("Open project")',
    ]);
    if (openProjectLink) {
      await openProjectLink.click();
      await page.waitForTimeout(2000);
      const projUrl = page.url();
      projUrl.includes('/arb/projects/view')
        ? pass('project-detail-page', projUrl)
        : warn('project-detail-page', `unexpected URL after Open project: ${projUrl}`);
    } else {
      warn('project-detail-page', 'Open project link not found — project may not have been created');
    }

    // ── Step 3: Navigate to /arb and fill project name ───────────────────
    console.log('\n── Step 3: Start new review');

    // From project view, "+ New review" links to /arb?newReview=1&projectId=...
    const newReviewLink = await findVisible(page, [
      'a:has-text("+ New review")',
      'a:has-text("New review")',
      'a[href*="newReview"]',
    ]);
    if (newReviewLink) {
      await newReviewLink.click();
      await page.waitForTimeout(2000);
    } else {
      warn('new-review-link', 'new review link not found — navigating to /arb directly');
      await page.goto(`${BASE_URL}/arb`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
    }
    await shot(page, 'arb-page');

    // /arb page requires project name to be filled before the start button is enabled.
    // Even when coming via ?newReview=1&projectId=..., the name field is NOT pre-filled.
    const arbNameInput = await findVisible(page, [
      'input[aria-label="Project name"]',
      'input[placeholder*="landing zone"]',
      'input[placeholder*="Contoso landing"]',
      '.arb-field-input',
    ]);
    if (arbNameInput) {
      await arbNameInput.fill(projectName);
      pass('arb-project-name', 'project name filled on /arb');
    }

    // ── Step 4: Upload document + start review ───────────────────────────
    console.log('\n── Step 4: Upload document');
    await shot(page, 'upload-page');

    // Create test document
    const tmpDir = 'c:\\tmp\\playwright-qa';
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpDocPath = path.join(tmpDir, UPLOAD_DOC_NAME);
    fs.writeFileSync(tmpDocPath, UPLOAD_DOC_CONTENT, 'utf8');

    // Select file — this changes arb-create-btn label to "...and upload files →"
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(tmpDocPath);
      await page.waitForTimeout(2000);
      pass('file-input', 'document selected');
      await shot(page, 'file-selected');
    } else {
      fail('file-input', 'file input not found on upload page');
    }

    // Wait for the start button to become enabled (project name set + file selected)
    try {
      await page.locator('button.arb-create-btn:not([disabled])').waitFor({ state: 'visible', timeout: 8000 });
    } catch (_) { await shot(page, 'arb-create-btn-still-disabled'); }

    // Click the start-review button. This creates the review, uploads the file,
    // and navigates to /arb/{reviewId}/upload. Use .arb-create-btn class selector
    // to avoid matching any other button on the page.
    const startClicked = await tryClick(page, [
      'button.arb-create-btn:not([disabled])',
    ], 'start-review');

    let reviewId = null;

    if (startClicked) {
      // Wait for navigation to /arb/{reviewId}/...
      try {
        await page.waitForURL(/\/arb\/[^/?#]{10,}(\/|$)/, { timeout: 30000 });
      } catch (_) { await page.waitForTimeout(5000); }
      await shot(page, 'after-start-review');
      pass('upload', 'review started and document submitted');
    }

    // Extract reviewId from the resulting URL.
    // The app uses two URL formats:
    //   /arb/{reviewId}/upload  (path-based — legacy)
    //   /arb?reviewId={reviewId}&step=upload  (query-param-based — current)
    const reviewUrl = page.url();
    const reviewIdMatch =
      reviewUrl.match(/\/arb\/([^/?#]{10,})/) ||
      reviewUrl.match(/[?&]reviewId=([^&#]+)/);
    if (reviewIdMatch && reviewIdMatch[1] !== 'projects') {
      reviewId = reviewIdMatch[1];
      pass('review-id', reviewId);
    } else {
      fail('review-id', `could not extract reviewId from URL: ${reviewUrl}`);
    }
    await shot(page, 'review-page');

    // ── Step 5: Trigger extraction ───────────────────────────────────────
    console.log('\n── Step 5: Trigger extraction');

    // Ensure we're on the upload step with the #run-automated-analysis section
    if (reviewId) {
      const curUrl = page.url();
      if (!curUrl.includes('step=upload') && !curUrl.includes('/upload')) {
        await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=upload`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
      }
    }

    // The "Start analysis →" button (class arb-cta-btn) requires TWO conditions:
    // 1. At least one file uploaded — done in Step 4
    // 2. Confidentiality checkbox checked — test must check it explicitly
    const confirmCheckbox = await findVisible(page, [
      'input[aria-label="Confirm uploaded files can be used for review extraction"]',
      '#run-automated-analysis input[type="checkbox"]',
      '.arb-inline-check input[type="checkbox"]',
    ]);
    if (confirmCheckbox) {
      const checked = await confirmCheckbox.isChecked();
      if (!checked) await confirmCheckbox.check();
      pass('confidentiality-confirm', 'confirmation checkbox checked');
    }
    await page.waitForTimeout(500);

    // Wait for the start-analysis button to become enabled
    try {
      await page.locator('button.arb-cta-btn:not([disabled])').waitFor({ state: 'visible', timeout: 5000 });
    } catch (_) { await shot(page, 'start-analysis-still-disabled'); }

    const extractionClicked = await tryClick(page, [
      'button.arb-cta-btn:not([disabled])',
      'button:has-text("Start analysis"):not([disabled])',
      'button:has-text("Retry analysis"):not([disabled])',
    ], 'trigger-extraction');
    if (extractionClicked) {
      pass('trigger-extraction', 'extraction button found and clicked');
    }
    await page.waitForTimeout(3000);
    await shot(page, 'extraction-triggered');
    console.log(`  [pre-poll] current page URL: ${page.url()}`);

    // Immediate API probe: reveals auth issues (401), missing review (404), or function errors (500).
    if (reviewId) {
      const probeBase = await discoverApiBase(page, reviewId);
      const probe = await page.evaluate(async ({ rid, probeBase: base }) => {
        const fetchUrl = `${base}/api/arb/reviews/${rid}`;
        try {
          const extraHeaders = {};
          if (base) {
            try {
              const me = await fetch('/.auth/me', { credentials: 'same-origin', cache: 'no-store' });
              if (me.ok) {
                const meData = await me.json();
                if (meData?.clientPrincipal) extraHeaders['x-ms-client-principal'] = btoa(JSON.stringify(meData.clientPrincipal));
              }
            } catch { /* skip */ }
          }
          const r = await fetch(fetchUrl, { credentials: base ? 'include' : 'same-origin', cache: 'no-store', headers: extraHeaders });
          const text = await r.text().catch(() => '');
          return { httpStatus: r.status, snippet: text.slice(0, 300), fetchUrl };
        } catch (e) { return { httpStatus: -1, snippet: String(e), fetchUrl }; }
      }, { rid: reviewId, probeBase }).catch((e) => ({ httpStatus: -2, snippet: String(e), fetchUrl: 'unknown' }));
      console.log(`  [pre-poll probe] HTTP ${probe.httpStatus} url=${probe.fetchUrl} — ${probe.snippet}`);
    }

    // ── Step 6: Poll until extraction completes ──────────────────────────
    console.log('\n── Step 6: Poll for extraction completion (up to 10 min)');
    if (!reviewId) {
      fail('poll-extraction', 'no reviewId — cannot poll');
    } else {
      // Discover the actual API base URL the React app uses (may be direct Functions URL
      // set via NEXT_PUBLIC_API_URL, bypassing SWA). Using the wrong base causes HTML 404.
      const apiBase = await discoverApiBase(page, reviewId);
      const extractionDone = await pollExtractionComplete(page, reviewId, apiBase);
      await shot(page, 'extraction-done');

      if (!extractionDone) {
        warn('extraction-check', 'extraction did not complete — skipping findings/scorecard/export checks');
      } else {
        // ── Step 7: Verify findings ────────────────────────────────────
        console.log('\n── Step 7: Verify findings page');
        await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=findings`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await shot(page, 'findings-page');

        // Check at least one finding exists in the list
        const findingItems = page.locator('[class*="findingItem"]');
        const findingCount = await findingItems.count();
        if (findingCount > 0) {
          pass('findings-list', `${findingCount} finding(s) rendered`);
        } else {
          fail('findings-list', 'no findings visible in list panel');
        }

        // Click first finding to open detail panel
        if (findingCount > 0) {
          await findingItems.first().click();
          await page.waitForTimeout(1500);
          await shot(page, 'finding-detail');

          // Verify "Why CARI says this" section (C6 feature)
          const whyToggle = await findVisible(page, [
            'button:has-text("Why CARI says this")',
            '[class*="whyToggle"]',
          ]);
          if (whyToggle) {
            pass('why-cari-section', 'toggle button visible in detail panel');
            // Click to expand and verify content appears
            await whyToggle.click();
            await page.waitForTimeout(800);
            const whyBody = await findVisible(page, ['[class*="whyBody"]']);
            if (whyBody) {
              pass('why-cari-expanded', '"Why CARI says this" panel expanded');
            } else {
              warn('why-cari-expanded', 'body not found after toggle click');
            }
          } else {
            warn('why-cari-section', '"Why CARI says this" toggle not found (C6)');
          }

          await shot(page, 'finding-detail-with-why');
        }

        // ── Step 8: Verify scorecard ───────────────────────────────────
        console.log('\n── Step 8: Verify scorecard page');
        await page.goto(`${BASE_URL}/arb?reviewId=${reviewId}&step=scorecard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await shot(page, 'scorecard-page');

        // Check overall score or hero metric is present
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
          warn('scorecard', 'score element not found — scorecard may use a different selector');
        }

        // ── Step 9: Download PPTX export ──────────────────────────────
        console.log('\n── Step 9: Download PPTX export');
        const exportBtn = await findVisible(page, [
          'button:has-text("Export")',
          'button:has-text("Download")',
          'button:has-text("Export PPTX")',
          'button:has-text("Download PPTX")',
          'a:has-text("Export")',
          'a:has-text("Download")',
          '[class*="exportBtn"]',
          '[class*="export-btn"]',
        ]);

        if (exportBtn) {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 60000 }),
            exportBtn.click(),
          ]);
          const suggestedFilename = download.suggestedFilename();
          pass('export-pptx', `download started: ${suggestedFilename}`);
          await download.cancel();
          await shot(page, 'export-triggered');
        } else {
          // Try navigating to the export section directly
          const exportSection = await findVisible(page, [
            'a[href*="export"]',
            'button:has-text("Presentation")',
          ]);
          if (exportSection) {
            warn('export-pptx', 'export button found via fallback — not a download button');
          } else {
            warn('export-pptx', 'no export button found on scorecard page');
          }
        }
      }
    }

  } catch (err) {
    fail('unexpected-error', err instanceof Error ? err.message : String(err));
    await shot(page, 'unexpected-error').catch(() => {});
  } finally {
    await browser.close();
  }

  // ── Final report ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' C7 Golden Path Results');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  PASS: ${R.pass.length}  |  WARN: ${R.warn.length}  |  FAIL: ${R.fail.length}`);
  if (R.warn.length) console.log('\nWarnings:\n' + R.warn.map(w => `  ⚠ ${w.key}: ${w.detail}`).join('\n'));
  if (R.fail.length) console.log('\nFailures:\n' + R.fail.map(f => `  ✗ ${f.key}: ${f.detail}`).join('\n'));
  console.log('═══════════════════════════════════════════════════════\n');
  if (R.fail.length > 0) {
    throw new Error(`${R.fail.length} golden-path check(s) failed: ${R.fail.map(f => f.key).join(', ')}`);
  }
}

test('C7 — ARB Golden Path E2E', async () => {
  await runGoldenPath();
}, 720000);
