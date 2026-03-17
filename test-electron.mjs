// End-to-end test: connect to Electron via CDP and test the full UI flow
import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';
const DB_PATH = 'D:/src/engine2/Sql/Picasso/Engine/src/.vs/server/v18/Browse.VC.db';
const SCREENSHOT_DIR = 'test-screenshots';

async function main() {
  console.log('[test] Connecting to Electron via CDP...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const page = browser.contexts()[0].pages()[0];
  console.log(`[test] Page: ${await page.title()} @ ${page.url()}`);

  // 1. Wait for app to fully initialize, then take initial state
  console.log('[test] Waiting for app bundle to load...');
  await page.waitForFunction(() => window.__telepathyStore, { timeout: 10000 });
  console.log('[test] Store available on window');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-initial.png` });
  console.log('[test] 01-initial saved');

  // 2. Open database via direct Zustand store action (reliable, no monkey-patch needed)
  console.log('[test] Opening database via store action...');
  await page.evaluate(async (dbPath) => {
    const store = window.__telepathyStore;
    await store.getState().openDatabase(dbPath);
  }, DB_PATH);
  console.log('[test] openDatabase() completed');

  // Wait for React re-render
  try {
    await page.locator('.tree-item').first().waitFor({ timeout: 15000 });
    console.log('[test] Tree items appeared!');
  } catch {
    console.log('[test] Timeout waiting for tree items, checking state...');
    const storeState = await page.evaluate(() => {
      const s = window.__telepathyStore?.getState();
      return { isConnected: s?.isConnected, classCount: s?.classes?.length };
    });
    console.log('[test] Store state:', storeState);
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-classes-loaded.png` });
  const itemCount = await page.locator('.tree-item').count();
  console.log(`[test] Visible tree items: ${itemCount} (0-member classes filtered out)`);

  if (itemCount === 0) {
    console.log('[test] No items loaded, aborting');
    browser.close();
    return;
  }

  // 3. Click first class → check expanded node in graph + members
  const firstName = await page.locator('.tree-item').first().locator('.item-name').textContent();
  console.log(`[test] Clicking first class: "${firstName}"`);
  await page.locator('.tree-item').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-class-selected.png` });
  console.log('[test] 03-class-selected saved');

  // 4. Filter for "ResourceGroup" which has inheritance (IResourceGroup → ResourceGroup → StrictResourceGroup)
  console.log('[test] Filtering for "ResourceGroup"...');
  await page.locator('.tree-filter').fill('ResourceGroup');
  await page.waitForTimeout(2000);
  const rgCount = await page.locator('.tree-item').count();
  console.log(`[test] ResourceGroup results: ${rgCount}`);

  if (rgCount > 0) {
    // Click "ResourceGroup" (not Trivial/Strict)
    const items = page.locator('.tree-item');
    for (let i = 0; i < rgCount; i++) {
      const name = await items.nth(i).locator('.item-name').textContent();
      if (name === 'ResourceGroup') {
        await items.nth(i).click();
        break;
      }
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-hierarchy-resourcegroup.png` });
    console.log('[test] 04-hierarchy-resourcegroup saved (should show inheritance edges!)');
  }

  // 5. Test member click → source jump
  console.log('[test] Testing member click...');
  const memberItems = page.locator('.member-item');
  const memberCount = await memberItems.count();
  console.log(`[test] Member count in right panel: ${memberCount}`);
  if (memberCount > 2) {
    // Click the 3rd member to test source jump
    const memberName = await memberItems.nth(2).locator('.member-name').textContent();
    console.log(`[test] Clicking member: "${memberName}"`);
    await memberItems.nth(2).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-member-clicked.png` });
    console.log('[test] 05-member-clicked saved (should show highlighted source line)');
  }

  // 6. Test graph member click (in the expanded node)
  const graphMembers = page.locator('.graph-member-row');
  const graphMemberCount = await graphMembers.count();
  console.log(`[test] Graph member rows: ${graphMemberCount}`);
  if (graphMemberCount > 0) {
    await graphMembers.first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-graph-member-click.png` });
    console.log('[test] 06-graph-member-click saved');
  }

  // 7. Ctrl+K search — test via store action first, then UI
  console.log('[test] Testing search via store...');
  const storeSearchResults = await page.evaluate(async () => {
    const store = window.__telepathyStore;
    await store.getState().search('ResourceGroup');
    const state = store.getState();
    return {
      count: state.searchResults?.length,
      first: state.searchResults?.[0],
      query: state.searchQuery,
    };
  });
  console.log(`[test] Store search results: ${storeSearchResults.count}, query: "${storeSearchResults.query}"`);
  if (storeSearchResults.first) {
    console.log(`[test] First result: ${storeSearchResults.first.name} (${storeSearchResults.first.kind})`);
  }

  // Now test via UI
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  const searchInput = page.locator('.search-input');
  if (await searchInput.isVisible()) {
    // Clear any existing text first
    await searchInput.fill('');
    await page.waitForTimeout(100);
    await searchInput.type('ResourceGroup', { delay: 30 });
    await page.waitForTimeout(2000);
  }
  const dropdownVisible = await page.locator('.search-results').isVisible();
  console.log(`[test] Search dropdown visible: ${dropdownVisible}`);
  const resultCount = await page.locator('.search-result-item').count();
  console.log(`[test] Search result items in DOM: ${resultCount}`);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-search.png` });
  console.log('[test] 07-search saved');

  browser.close();
  console.log('[test] Done!');
}

main().catch(err => {
  console.error('[test] Fatal:', err);
  process.exit(1);
});
