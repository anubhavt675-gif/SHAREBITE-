// ==============================================================================
// ShareBite — India-Wide NGO Discovery Search Engine End-to-End Verification
// Tests all 10 required scenarios + Navbar dropdown + Details Page + Safety rules
// Usage: node scripts/verify_ngo_search_e2e.mjs <baseUrl> [screenshotDir]
// ==============================================================================

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = (process.argv[2] || 'http://127.0.0.1:4177').replace(/\/$/, '');
const screenshotDir = process.argv[3] || '';

const chromePaths = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = chromePaths.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Edge executable found.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;

function check(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`PASS  ${label}${detail ? ` (${detail})` : ''}`);
  } else {
    failed++;
    console.error(`FAIL  ${label}${detail ? ` (${detail})` : ''}`);
  }
}

async function waitForSearchDone(page) {
  await sleep(350);
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="ngo-results-count"]');
      return Boolean(el && el.textContent && !/Searching/i.test(el.textContent));
    },
    { timeout: 12000 }
  );
  await sleep(150);
}

async function runSearchOnPage(page, query) {
  const input = await page.waitForSelector('[data-testid="ngo-page-search-input"]', { timeout: 10000 });
  const clearBtn = await page.$('[data-testid="ngo-page-clear-btn"]');
  if (clearBtn) {
    await clearBtn.click();
    await sleep(100);
  }
  await input.click();
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  if (query) {
    await input.type(query, { delay: 10 });
  }
  await page.click('[data-testid="ngo-page-search-btn"]');
  await waitForSearchDone(page);
}

async function readCards(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="ngo-result-card"]'));
    return cards.map((card) => ({
      text: card.textContent || '',
      listingType: card.getAttribute('data-listing-type'),
      hasOfferFood: /offer food/i.test(card.textContent || ''),
      hasShareBiteBadge: Boolean(card.querySelector('[data-testid="badge-sharebite-registered"]')),
      hasExternalBadge: Boolean(card.querySelector('[data-testid="badge-external-listing"]')),
      hasViewDetails: Boolean(card.querySelector('[data-testid="ngo-view-details-btn"]')),
    }));
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,920'],
  });

  const pageErrors = [];
  const consoleErrors = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 920 });

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected network-failure test errors
        if (!text.includes('ERR_FAILED') && !text.includes('429') && !text.includes('Failed to load resource')) {
          consoleErrors.push(text);
        }
      }
    });

    // Enable request interception so we can test normal, 429 quota, and network-error modes deterministically
    let mockMode = 'normal'; // 'normal' | 'quota429' | 'networkFail'
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/ngo-search')) {
        if (mockMode === 'quota429') {
          return req.respond({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'QUOTA_EXCEEDED',
              quotaExceeded: true,
              message: 'Google Places API quota reached. Showing ShareBite registered NGOs and public listings.',
              ngos: [],
            }),
          });
        }
        if (mockMode === 'networkFail') {
          return req.abort('failed');
        }
        // Normal local preview mode: return clean unconfigured JSON (no HTML 404)
        return req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ngos: [],
            apiConfigured: false,
            source: 'google_places',
          }),
        });
      }
      if (mockMode === 'networkFail' && url.includes('nominatim.openstreetmap.org')) {
        return req.abort('failed');
      }
      if (mockMode === 'normal' && url.includes('nominatim.openstreetmap.org')) {
        // Return clean fast empty JSON with CORS header so tests don't flake on external OSM rate limits
        return req.respond({
          status: 200,
          headers: { 'access-control-allow-origin': '*' },
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
      if (mockMode === 'quota429' && url.includes('nominatim.openstreetmap.org')) {
        return req.respond({
          status: 200,
          headers: { 'access-control-allow-origin': '*' },
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
      return req.continue();
    });

    // ── 0. Homepage preservation + Navbar Search Dropdown & Keyboard Navigation ──
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 25000 });
    const homeHasWeCare = await page.evaluate(() =>
      (document.body.textContent || '').includes('We Care Foundation')
    );
    check('Homepage We Care Foundation section preserved', homeHasWeCare);

    const navSearch = await page.waitForSelector('[data-testid="navbar-ngo-search-input"]', { timeout: 10000 });
    await navSearch.click();
    await sleep(300);

    const dropdownVisible = Boolean(await page.$('[data-testid="navbar-ngo-search-dropdown"]'));
    check('Navbar search dropdown opens on focus', dropdownVisible);

    // Type query, test clear button, re-type & submit with Keyboard ArrowDown + Enter
    await navSearch.type('We Care', { delay: 15 });
    await sleep(350);
    const clearVisible = Boolean(await page.$('[data-testid="navbar-ngo-search-clear"]'));
    check('Navbar search clear (X) button appears', clearVisible);

    await page.click('[data-testid="navbar-ngo-search-clear"]');
    const clearedVal = await page.$eval('[data-testid="navbar-ngo-search-input"]', (el) => el.value);
    check('Navbar clear button resets input', clearedVal === '');

    await navSearch.type('We Care Foundation', { delay: 15 });
    await sleep(350);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.location.pathname === '/ngo-search', { timeout: 10000 });
    await waitForSearchDone(page);

    // ── Scenario 1: We Care Foundation + Details Page ─────────────────────────
    let cards = await readCards(page);
    const weCareCard = cards.find((c) => /We Care Foundation/i.test(c.text));
    check(
      'Scenario 1: "We Care Foundation" returns accurate listing',
      Boolean(weCareCard && weCareCard.hasExternalBadge && !weCareCard.hasShareBiteBadge && !weCareCard.hasOfferFood),
      weCareCard ? 'External NGO Listing, no Offer Food button' : 'Not found'
    );

    if (screenshotDir) {
      await page.screenshot({ path: join(screenshotDir, 'ngo_search_wecare.png'), fullPage: false });
    }

    // Click View Details -> inspect NGO Details Page
    await page.click('[data-testid="ngo-view-details-btn"]');
    await page.waitForSelector('[data-testid="ngo-details-page"]', { timeout: 10000 });
    await sleep(600);
    const detailsInfo = await page.evaluate(() => ({
      title: document.querySelector('[data-testid="ngo-details-title"]')?.textContent || '',
      hasExternalBadge: Boolean(document.querySelector('[data-testid="details-badge-external"]')),
      hasWebsite: Boolean(document.querySelector('[data-testid="ngo-details-website-btn"]')),
      websiteTarget: document.querySelector('[data-testid="ngo-details-website-btn"]')?.getAttribute('target') || '',
      hasMap: Boolean(document.querySelector('[data-testid="ngo-details-embedded-map"]')),
      hasAttribution: Boolean(document.querySelector('[data-testid="ngo-source-attribution"]')),
      platformNotice: document.querySelector('[data-testid="ngo-platform-status-box"]')?.textContent || '',
    }));

    check(
      'NGO Details Page renders We Care Foundation truthfully',
      detailsInfo.title.includes('We Care Foundation') &&
        detailsInfo.hasExternalBadge &&
        detailsInfo.hasWebsite &&
        detailsInfo.websiteTarget === '_blank' &&
        detailsInfo.hasMap &&
        detailsInfo.hasAttribution &&
        /disabled for external listings/i.test(detailsInfo.platformNotice),
      detailsInfo.title
    );

    if (screenshotDir) {
      await page.screenshot({ path: join(screenshotDir, 'ngo_details_wecare.png'), fullPage: false });
    }

    // Navigate back to search page
    await page.click('[data-testid="ngo-details-back-btn"]');
    await page.waitForSelector('[data-testid="ngo-page-search-input"]', { timeout: 10000 });

    // ── Scenario 2: NGOs in Delhi ─────────────────────────────────────────────
    await runSearchOnPage(page, 'NGOs in Delhi');
    cards = await readCards(page);
    check(
      'Scenario 2: "NGOs in Delhi" returns Delhi NGOs with truthful badges',
      cards.length >= 3 && cards.every((c) => c.hasViewDetails && !c.hasOfferFood),
      `${cards.length} results`
    );

    // ── Scenario 3: Food donation NGOs in Gurugram ────────────────────────────
    await runSearchOnPage(page, 'Food donation NGOs in Gurugram');
    cards = await readCards(page);
    const hasGurugramFood = cards.some((c) => /We Care Foundation/i.test(c.text)) && cards.some((c) => /Feeding India/i.test(c.text));
    check(
      'Scenario 3: "Food donation NGOs in Gurugram" returns food NGOs in Gurugram',
      hasGurugramFood,
      `${cards.length} results`
    );

    // ── Scenario 4: NGOs in Mumbai ────────────────────────────────────────────
    await runSearchOnPage(page, 'NGOs in Mumbai');
    cards = await readCards(page);
    const hasMumbai = cards.some((c) => /Roti Bank/i.test(c.text)) && cards.some((c) => /Khaana Chahiye/i.test(c.text));
    check('Scenario 4: "NGOs in Mumbai" returns Mumbai NGOs', hasMumbai, `${cards.length} results`);

    // ── Scenario 5: NGOs in Punjab ────────────────────────────────────────────
    await runSearchOnPage(page, 'NGOs in Punjab');
    cards = await readCards(page);
    const hasPunjab = cards.some((c) => /Pingalwara/i.test(c.text)) && cards.some((c) => /Khalsa Aid/i.test(c.text));
    check('Scenario 5: "NGOs in Punjab" returns Punjab NGOs', hasPunjab, `${cards.length} results`);

    // ── Scenario 6: Invalid NGO name ──────────────────────────────────────────
    await runSearchOnPage(page, 'xyznonexistentngo99999');
    cards = await readCards(page);
    const emptyVisible = Boolean(await page.$('[data-testid="ngo-empty-state"]'));
    check(
      'Scenario 6: Invalid NGO name returns 0 results & clean empty state',
      cards.length === 0 && emptyVisible,
      `cards=${cards.length}`
    );

    // ── Scenario 7: Location permission denied ────────────────────────────────
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok, errCb) =>
            errCb({ code: 1, PERMISSION_DENIED: 1, message: 'User denied Geolocation' }),
        },
      });
    });
    await page.click('[data-testid="ngo-use-location-btn"]');
    await sleep(400);
    const locBannerText = await page.$eval('[data-testid="ngo-location-banner"]', (el) => el.textContent || '');
    check(
      'Scenario 7: Location permission denied handled gracefully',
      /denied/i.test(locBannerText),
      locBannerText.slice(0, 60)
    );

    // ── Scenario 8: No search results via strict Gov. Registration filter ─────
    await runSearchOnPage(page, 'NGOs in Mumbai');
    await page.click('[data-testid="filter-gov-verified"]');
    await sleep(700);
    cards = await readCards(page);
    const filterEmpty = Boolean(await page.$('[data-testid="ngo-empty-state"]'));
    check(
      'Scenario 8: Strict Gov. Registration Confirmed filter excludes unverified external listings cleanly',
      cards.length === 0 && filterEmpty,
      `cards=${cards.length}`
    );
    // Uncheck filter
    await page.click('[data-testid="filter-gov-verified"]');
    await sleep(500);

    // ── Scenario 9: API Quota Exceeded (HTTP 429) ─────────────────────────────
    mockMode = 'quota429';
    await runSearchOnPage(page, 'NGOs in Delhi');
    const quotaText = await page.$eval('[data-testid="ngo-quota-banner"]', (el) => el.textContent || '').catch(() => '');
    cards = await readCards(page);
    check(
      'Scenario 9: API quota exceeded (429) shows clear banner while keeping fallback NGOs visible',
      /quota/i.test(quotaText) && cards.length >= 1,
      `banner="${quotaText.slice(0, 48)}...", fallbackCards=${cards.length}`
    );

    // ── Scenario 10: Network failure ──────────────────────────────────────────
    mockMode = 'networkFail';
    await runSearchOnPage(page, 'xyznonexistentnetworktest');
    const netBanner = await page.$eval('[data-testid="ngo-network-banner"]', (el) => el.textContent || '').catch(() => '');
    check(
      'Scenario 10: Network failure displays retryable error banner cleanly',
      /network|connect|retry/i.test(netBanner),
      netBanner.slice(0, 65)
    );

    check('Zero uncaught page errors', pageErrors.length === 0, pageErrors.join('; '));
    check('Zero unexpected console errors', consoleErrors.length === 0, consoleErrors.join('; '));

    console.log(`\nSUMMARY: ${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
  } finally {
    await browser.close();
  }
})();
