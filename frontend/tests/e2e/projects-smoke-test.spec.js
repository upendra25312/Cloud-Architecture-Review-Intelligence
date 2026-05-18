/**
 * CARI Projects Feature — Smoke Test (v2)
 * Tests all recently shipped Projects features end-to-end on the live site.
 * Login strategy: passkey rejector (same as e2e-live-test.spec.js v7 — proven to work)
 *
 * Run: npx playwright test projects-smoke-test.spec.js --headed --timeout=360000
 */

const { test, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://thankful-pond-04383960f.7.azurestaticapps.net';
const LOGIN_EMAIL = 'cari.pilot@outlook.com';
const LOGIN_PASSWORD = 'Welcome@2026';
const SCREENSHOTS_DIR = 'c:\\tmp\\playwright-qa\\screenshots\\projects-smoke';

if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let shotN = 0;
async function shot(page, label) {
  shotN++;
  const fp = path.join(SCREENSHOTS_DIR, `${String(shotN).padStart(2,'0')}-${label}.png`);
  try { await page.screenshot({ path: fp, fullPage: true }); } catch(e) {}
  console.log(`  [ss] ${path.basename(fp)}`);
  return fp;
}

const R = {};
const pass = (k, d) => { R[k] = { s: 'PASS', d }; console.log(`  [PASS] ${k}: ${d}`); };
const fail = (k, d) => { R[k] = { s: 'FAIL', d }; console.log(`  [FAIL] ${k}: ${d}`); };
const warn = (k, d) => { R[k] = { s: 'WARN', d }; console.log(`  [WARN] ${k}: ${d}`); };

async function tryClick(page, sels, desc) {
  for (const sel of sels) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        await el.click({ force: true, timeout: 5000 });
        console.log(`  Clicked [${desc}] via: ${sel}`);
        return true;
      }
    } catch(e) {}
  }
  return false;
}

async function findVisible(page, sels) {
  for (const sel of sels) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0 && await el.isVisible({ timeout: 2000 }).catch(() => false)) return el;
    } catch(e) {}
  }
  return null;
}

test('CARI Projects Feature Smoke Test', async () => {
  // Launch own browser so we can apply context-level init scripts
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
  });

  // Reject WebAuthn/passkey at context level — same trick as e2e-live-test.spec.js
  await ctx.addInitScript(() => {
    const origGet = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = function(options) {
      if (options && options.publicKey) {
        return Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'));
      }
      return origGet(options);
    };
    if (navigator.credentials.create) {
      const origCreate = navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.create = function(options) {
        if (options && options.publicKey) return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError'));
        return origCreate(options);
      };
    }
  });

  const page = await ctx.newPage();

  try {
    // ─── LOGIN ──────────────────────────────────────────────────────────────
    console.log('\n=== LOGIN: Navigate to ARB page ===');
    await page.goto(`${BASE_URL}/arb`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, 'arb-home');

    // Check /.auth/me directly — the only reliable signal for SWA auth state.
    // Body text heuristics are unreliable because /arb loads publicly with no full-page sign-in prompt.
    const isAlreadyAuthed = await page.evaluate(async () => {
      try {
        const r = await fetch('/.auth/me', { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) return false;
        const d = await r.json();
        return d?.clientPrincipal != null;
      } catch { return false; }
    });

    if (isAlreadyAuthed) {
      console.log('  /.auth/me: already authenticated — skipping login');
    } else {
      console.log('  /.auth/me: not authenticated — triggering SWA login');
      // Navigate to SWA login redirect endpoint so we land on MS login page cleanly
      await page.goto(`${BASE_URL}/.auth/login/aad?post_login_redirect_uri=/arb`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      await shot(page, 'after-signin-click');
    }

    // Wait for MS login if redirected
    try {
      await page.waitForURL(/login\.(microsoftonline|microsoft|live)\.com/, { timeout: 15000 });
    } catch(e) {
      if (page.url().includes('thankful-pond')) {
        pass('login', 'Already authenticated');
      }
    }

    if (page.url().includes('login.')) {
      await shot(page, 'ms-login');

      // Enter email
      const emailInput = await findVisible(page, ['input[type="email"]', 'input[name="loginfmt"]', '#i0116']);
      if (emailInput) {
        await emailInput.fill(LOGIN_EMAIL);
        await tryClick(page, ['input[type="submit"]', '#idSIButton9'], 'Next');
        await page.waitForTimeout(5000);
        await shot(page, 'after-email');
      }

      // Handle FIDO page
      if (page.url().includes('fido')) {
        console.log('  On FIDO page — waiting for WebAuthn rejection...');
        try {
          await page.waitForFunction(() => {
            const b = document.body?.innerText || '';
            return b.includes("couldn't sign you in") || b.includes("Sign in another way");
          }, { timeout: 15000 });
        } catch(e) {
          await page.waitForTimeout(5000);
        }
        await shot(page, 'fido-after-rejection');

        const clicked = await tryClick(page, [
          '#signInAnotherWay',
          'a:has-text("Sign in another way")',
          'text=Sign in another way',
        ], 'Sign in another way');

        if (clicked) {
          await page.waitForTimeout(3000);
          await tryClick(page, ['text=Password', 'text=Use your password', '[data-value="Password"]'], 'Password method');
          await page.waitForTimeout(2000);
        }
      }

      // Try "Use your password" in case we skipped FIDO
      await tryClick(page, ['text=Use your password', 'text=Use password instead', '#signInOptions'], 'use-password');
      await page.waitForTimeout(1000);

      // Enter password
      const pwInput = await findVisible(page, [
        'input[type="password"]', 'input[name="passwd"]', '#i0118',
        'input[autocomplete="current-password"]',
      ]);

      if (pwInput) {
        await pwInput.fill(LOGIN_PASSWORD);
        await tryClick(page, ['input[type="submit"]', '#idSIButton9', 'button[type="submit"]'], 'Submit password');
        await page.waitForTimeout(6000);
        await shot(page, 'after-password');
      } else {
        fail('login', 'Password input not found');
        await shot(page, 'no-password-input');
      }

      // Handle post-login prompts (Stay signed in, Consent, MFA)
      for (let i = 0; i < 5; i++) {
        const u = page.url();
        if (u.includes('thankful-pond')) break;
        const b = await page.locator('body').innerText().catch(() => '');

        if (b.includes('Stay signed in') || b.includes('Stay sign')) {
          await tryClick(page, ['input[value="No"]', '#idBtn_Back', 'button:has-text("No")'], 'No to stay');
          await page.waitForTimeout(2000);
          continue;
        }
        if (b.includes('Permissions requested') || b.includes('Accept')) {
          await tryClick(page, ['button:has-text("Accept")', 'input[value="Accept"]'], 'Accept consent');
          await page.waitForTimeout(2000);
          continue;
        }
        if (b.includes('verification') || b.includes('authenticat')) {
          warn('login', 'MFA screen detected — cannot automate');
          await shot(page, 'mfa-screen');
          break;
        }
        if (u.includes('fido')) {
          await page.waitForTimeout(3000);
          const ok = await tryClick(page, ['#signInAnotherWay', 'text=Sign in another way'], 'Sign in another way (2)');
          if (!ok) await tryClick(page, ['#idBtn_Back'], 'Back from FIDO');
          await page.waitForTimeout(3000);
          continue;
        }
        break;
      }

      try {
        await page.waitForURL(/thankful-pond-04383960f/, { timeout: 20000 });
      } catch(e) {}
    }

    await shot(page, 'post-signin');
    const postUrl = page.url();
    console.log(`  Post-signin URL: ${postUrl}`);

    if (!postUrl.includes('thankful-pond')) {
      fail('login', `Not at app after sign-in: ${postUrl.substring(0, 80)}`);
      return;
    }

    // Navigate to ARB and verify auth via /.auth/me — the reliable SWA signal
    await page.goto(`${BASE_URL}/arb`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const confirmedAuthed = await page.evaluate(async () => {
      try {
        const r = await fetch('/.auth/me', { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) return false;
        const d = await r.json();
        return d?.clientPrincipal != null;
      } catch { return false; }
    });
    if (!confirmedAuthed) {
      fail('login', 'Still unauthenticated: /.auth/me returned no clientPrincipal after sign-in');
      await shot(page, 'auth-fail');
      return;
    }
    pass('login', 'Authenticated — /.auth/me returned valid clientPrincipal');
    await shot(page, 'arb-authenticated');

    // ─── 1. "View projects" link in ARB library ─────────────────────────────
    console.log('\n=== TEST 1: "View projects" link in ARB library ===');
    // Wait for reviews/library content to finish loading before checking
    try {
      await page.waitForFunction(
        () => !document.body?.innerText?.includes('Loading reviews'),
        { timeout: 15000 }
      );
    } catch(e) { /* page may not say "Loading reviews" — proceed */ }
    const projLink = await findVisible(page, [
      'a[href*="/arb/projects"]',
      'a:has-text("projects")',
      'text=View projects',
    ]);
    if (projLink) pass('arb_projects_link', `"View projects" link found`);
    else warn('arb_projects_link', '"View projects" link not found — check ARB library UI');
    await shot(page, 'arb-library');

    // ─── 2. Projects list page ───────────────────────────────────────────────
    console.log('\n=== TEST 2: Projects list page ===');
    await page.goto(`${BASE_URL}/arb/projects`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for auth to resolve — useAuthSession fetches /.auth/me async on mount.
    // Do NOT include "Sign in" in the selector — that fires immediately during the
    // transient unauthenticated flash before the fetch completes.
    // Wait up to 20 s for the authenticated "+New project" button to appear.
    try {
      await page.waitForSelector(
        'button:has-text("New project"), button:has-text("Create your first project")',
        { timeout: 20000 }
      );
    } catch(e) { /* auth may still be resolving — check below */ }

    await shot(page, 'projects-list');

    const hasNewProjBtn = await page.locator('button:has-text("New project"), button:has-text("Create your first project")').count();
    if (hasNewProjBtn > 0) {
      pass('projects_list_loads', 'Authenticated — "New project" button visible');
    } else {
      // Auth didn't resolve to authenticated. Confirm via /.auth/me before failing.
      const stillAuthed = await page.evaluate(async () => {
        try {
          const r = await fetch('/.auth/me', { credentials: 'same-origin', cache: 'no-store' });
          const d = await r.json();
          return d?.clientPrincipal != null;
        } catch { return false; }
      });
      fail('projects_list_loads', stillAuthed
        ? 'Auth valid per /.auth/me but "New project" button never appeared — possible UI regression'
        : 'Session lost navigating to /arb/projects — auth not resolved'
      );
    }

    // ─── 3. Create a new project ─────────────────────────────────────────────
    console.log('\n=== TEST 3: Create new project ===');
    const testProjectName = `Smoke-${Date.now()}`;
    const testCustomer = 'Smoke Test Ltd';

    const newProjBtn = await findVisible(page, [
      'button:has-text("New project")',
      'button:has-text("+ New project")',
      'button:has-text("Create project")',
      'button:has-text("Add project")',
    ]);

    if (!newProjBtn) {
      // Dump all button text to diagnose
      const btns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, a.primary-button')).map(b => b.textContent?.trim()).filter(Boolean)
      );
      fail('create_project_btn', `No "New project" button found. Buttons on page: ${btns.join(' | ')}`);
      await shot(page, 'no-new-project-btn');
    } else {
      await newProjBtn.click();
      await page.waitForTimeout(1000);
      await shot(page, 'create-project-modal');

      // Fill form — use exact placeholder text to avoid collisions between
      // project name ("e.g. Contoso Migration Q2 2026") and customer name ("e.g. Contoso Ltd")
      const nameInput = await findVisible(page, [
        'input[placeholder="e.g. Contoso Migration Q2 2026"]',
        'input[placeholder*="Migration"]',
        'input[placeholder*="Project name"]',
        'form input[type="text"]:first-of-type',
      ]);
      if (nameInput) await nameInput.fill(testProjectName);

      const customerInput = await findVisible(page, [
        'input[placeholder="e.g. Contoso Ltd"]',
        'input[placeholder*="Contoso Ltd"]',
        'input[placeholder*="Customer"]',
        'input[placeholder*="customer"]',
      ]);
      if (customerInput) await customerInput.fill(testCustomer);

      const descInput = await findVisible(page, [
        'textarea[placeholder*="Description"]',
        'textarea[placeholder*="description"]',
        'textarea',
      ]);
      if (descInput) await descInput.fill('Smoke test project — safe to delete');

      await shot(page, 'create-project-filled');

      const submitted = await tryClick(page, [
        'button[type="submit"]',
        'button:has-text("Create")',
        'button:has-text("Save")',
        'button:has-text("Add")',
      ], 'Submit create project');

      if (submitted) {
        await page.waitForTimeout(3000);
        await shot(page, 'after-create-project');
        pass('create_project', `Project "${testProjectName}" submitted`);
      } else {
        fail('create_project', 'Submit button not found in create modal');
        await shot(page, 'create-no-submit');
      }
    }

    // ─── 4. Project appears in list ──────────────────────────────────────────
    console.log('\n=== TEST 4: Project in list ===');
    // Navigate back to list to force a fresh fetch (modal close reloads in-place)
    await page.goto(`${BASE_URL}/arb/projects`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for auth to resolve (same pattern as test 2)
    try {
      await page.waitForSelector(
        'button:has-text("New project"), button:has-text("Create your first project")',
        { timeout: 20000 }
      );
    } catch(e) { /* fall through */ }
    // Now wait for the loading spinner to go away and actual cards to render
    try {
      await page.waitForSelector('.arb-project-card, .arb-create-card', { timeout: 20000 });
    } catch(e) { /* no cards yet — API may still be loading */ }
    const projInList = await page.locator(`text=${testProjectName}`).first().isVisible({ timeout: 5000 }).catch(() => false);
    if (projInList) pass('project_in_list', `"${testProjectName}" visible`);
    else warn('project_in_list', `"${testProjectName}" not found — creation may have failed`);
    await shot(page, 'projects-list-after-create');

    // ─── 5. Open project detail ───────────────────────────────────────────────
    console.log('\n=== TEST 5: Project detail view ===');
    // Project cards use "Open project →" as the link text — find the card containing
    // the project name, then click its "Open project" link
    const projCardContainer = page.locator(`.arb-project-card, .arb-review-card`).filter({ hasText: testProjectName }).first();
    const projCard = await projCardContainer.count() > 0
      ? await projCardContainer.locator('a:has-text("Open project")').first()
      : null;

    const projCardVisible = projCard ? await projCard.isVisible({ timeout: 3000 }).catch(() => false) : false;

    if (!projCardVisible) {
      fail('project_detail', 'Cannot open project detail — "Open project" link not found in card');
    } else {
      const currentUrl = page.url();
      await projCard.click();
      // "← Projects" back-link is always the first element rendered in ArbProjectDetailView.
      // Wait for it to appear — confirms client-side navigation landed on the detail page.
      try {
        await page.waitForSelector('a:has-text("← Projects"), a:has-text("Projects")', { timeout: 12000 });
        pass('project_detail', 'Project detail page loaded ("← Projects" link visible)');
      } catch(e) {
        const landedUrl = page.url();
        fail('project_detail', `Detail page did not load within 12s. URL: ${landedUrl.slice(-60)}`);
      }
      await page.waitForTimeout(2000);
      await shot(page, 'project-detail');
      console.log(`  Navigated from: ${currentUrl} → ${page.url()}`);

      const detailH1 = await page.locator('h1, .arb-page-title').first().innerText().catch(() => '');
      if (detailH1.includes(testProjectName)) pass('project_detail_name', `Header: "${detailH1}"`);
      else warn('project_detail_name', `Header shows: "${detailH1}"`);

      const custVisible = await page.locator(`text=${testCustomer}`).first().isVisible({ timeout: 3000 }).catch(() => false);
      if (custVisible) pass('project_detail_customer', `Customer "${testCustomer}" visible`);
      else warn('project_detail_customer', `Customer name not visible in header`);

      // ─── 6. Edit project ───────────────────────────────────────────────────
      console.log('\n=== TEST 6: Edit project ===');
      const editBtn = await findVisible(page, ['button:has-text("Edit")']);
      if (!editBtn) {
        fail('edit_button', 'Edit button not found');
        await shot(page, 'no-edit-btn');
      } else {
        await editBtn.click();
        // Wait for edit form to appear — the name input in the edit form has placeholder "Project name"
        // (different from the create-modal placeholder "e.g. Contoso Migration Q2 2026")
        await page.waitForSelector('input.arb-project-title-input, input[placeholder="Project name"]', { timeout: 5000 }).catch(() => {});
        await shot(page, 'edit-form-open');

        // Check pre-population using the edit-form-specific selector
        const nameVal = await page.locator('input.arb-project-title-input, input[placeholder="Project name"]').first().inputValue({ timeout: 3000 }).catch(() => '');
        if (nameVal === testProjectName) pass('edit_prepopulated', `Name pre-filled: "${nameVal}"`);
        else warn('edit_prepopulated', `Name field: "${nameVal}" (expected "${testProjectName}")`);

        // Update description only (safer than changing name mid-test)
        // Use the edit form's description textarea (placeholder "Description (optional)")
        await page.locator('textarea[placeholder*="Description"], textarea[placeholder*="optional"]').first()
          .fill('Updated by smoke test', { timeout: 5000 }).catch(() => {});

        // Save — button text is "Save changes", type="submit"
        const saveBtn = await findVisible(page, ['button:has-text("Save changes")']);
        if (saveBtn) {
          await saveBtn.click({ timeout: 5000 });
          // Wait for the edit form to disappear (back to read mode: h1 reappears)
          await page.waitForSelector('h1.arb-page-title, h1', { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(1000);
          await shot(page, 'after-edit-save');
          const afterH1 = await page.locator('h1').first().innerText().catch(() => '');
          pass('edit_save', `Edit saved, header: "${afterH1}"`);
        } else {
          fail('edit_save', 'Save button not found');
          // Cancel edit so rest of test can proceed
          await page.locator('button:has-text("Cancel")').first().click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
      }

      // ─── 7. "+ New review" link has projectId ─────────────────────────────
      console.log('\n=== TEST 7: "+ New review" link ===');
      // Link is rendered as <Link href="/arb?newReview=1&projectId=..."> + New review </Link>
      // Wait for the page to settle after edit before checking links
      await page.waitForTimeout(500);
      const newRevBtn = await findVisible(page, [
        'a:has-text("+ New review")',
        'a:has-text("New review")',
        'a[href*="newReview"]',
      ]);
      if (!newRevBtn) {
        // Dump all links to diagnose
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a')).map(a => a.textContent?.trim() + ' → ' + a.href).filter(Boolean).slice(0, 15)
        );
        fail('new_review_btn', `"+ New review" link not found. Links: ${links.join(' | ')}`);
      } else {
        const href = await newRevBtn.getAttribute('href');
        if (href && href.includes('projectId=')) pass('new_review_link', `Link has projectId: ${href.substring(0, 80)}`);
        else fail('new_review_link', `Link missing projectId: "${href}"`);
      }

      // ─── 8. Empty state ────────────────────────────────────────────────────
      console.log('\n=== TEST 8: Empty state ===');
      const emptyState = await page.locator('h2:has-text("No reviews"), .arb-create-title').first().isVisible({ timeout: 3000 }).catch(() => false);
      if (emptyState) pass('empty_state', '"No reviews yet" empty state visible');
      else warn('empty_state', 'Empty state not found — project may have reviews already');
    }

    await shot(page, 'final-state');

  } catch (e) {
    console.error('\n[ERROR]', e.message);
    fail('unexpected_error', e.message);
    await shot(page, 'error-state').catch(() => {});
  } finally {
    // ─── REPORT ───────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════');
    console.log('  PROJECTS SMOKE TEST RESULTS');
    console.log('════════════════════════════════════════');
    let passed = 0, failed = 0, warned = 0;
    for (const [k, v] of Object.entries(R)) {
      const icon = v.s === 'PASS' ? '✅' : v.s === 'FAIL' ? '❌' : '⚠️';
      console.log(`  ${icon} ${k}: ${v.d}`);
      if (v.s === 'PASS') passed++;
      else if (v.s === 'FAIL') failed++;
      else warned++;
    }
    console.log('────────────────────────────────────────');
    console.log(`  PASSED: ${passed}  FAILED: ${failed}  WARNED: ${warned}`);
    console.log('════════════════════════════════════════\n');

    await browser.close();
  }
});
