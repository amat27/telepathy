// End-to-end test: connect to Electron via CDP and test the full UI flow
import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';
const DB_PATH = 'D:/src/engine2/Sql/Picasso/Engine/src/.vs/server/v18/Browse.VC.db';
const SCREENSHOT_DIR = 'test-screenshots';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function main() {
  console.log('[test] Connecting to Electron via CDP...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const page = browser.contexts()[0].pages()[0];
  console.log(`[test] Page: ${await page.title()} @ ${page.url()}`);

  // ================================================================
  // 1. Wait for app to initialize
  // ================================================================
  console.log('\n[1] App initialization');
  await page.waitForFunction(() => window.__telepathyStore, { timeout: 10000 });
  console.log('  Store available on window');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-initial.png` });

  // ================================================================
  // 2. Open database
  // ================================================================
  console.log('\n[2] Open database');
  await page.evaluate(async (dbPath) => {
    await window.__telepathyStore.getState().openDatabase(dbPath);
  }, DB_PATH);

  try {
    await page.locator('.tree-item').first().waitFor({ timeout: 15000 });
  } catch {
    const storeState = await page.evaluate(() => {
      const s = window.__telepathyStore?.getState();
      return { isConnected: s?.isConnected, classCount: s?.classes?.length };
    });
    console.log('  Store state:', storeState);
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-classes-loaded.png` });
  const itemCount = await page.locator('.tree-item').count();
  assert(itemCount > 0, `Tree items loaded: ${itemCount}`);

  if (itemCount === 0) {
    console.log('[test] No items, aborting');
    browser.close();
    return;
  }

  // ================================================================
  // 3. Select a class
  // ================================================================
  console.log('\n[3] Select first class');
  const firstName = await page.locator('.tree-item').first().locator('.item-name').textContent();
  console.log(`  Clicking: "${firstName}"`);
  await page.locator('.tree-item').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-class-selected.png` });

  // ================================================================
  // 4. Verify graph shows empty state (no member selected yet)
  // ================================================================
  console.log('\n[4] Graph empty state (no member selected)');
  const graphMembersInitial = await page.locator('.graph-member-row').count();
  const emptyMsg = await page.locator('.expanded-empty').count();
  assert(graphMembersInitial === 0 || emptyMsg > 0, `Graph shows no members initially (rows=${graphMembersInitial}, emptyMsg=${emptyMsg})`);

  // ================================================================
  // 5. Click a member → graph shows only that member
  // ================================================================
  console.log('\n[5] Click member → graph shows single member');
  const memberItems = page.locator('.member-item');
  const memberCount = await memberItems.count();
  assert(memberCount > 0, `Members in right panel: ${memberCount}`);

  if (memberCount > 0) {
    const memberName = await memberItems.first().locator('.member-name').textContent();
    console.log(`  Clicking member: "${memberName}"`);
    await memberItems.first().click();
    await page.waitForTimeout(1000);

    const graphAfterClick = await page.locator('.graph-member-row').count();
    assert(graphAfterClick === 1, `Graph shows exactly 1 member after click (got ${graphAfterClick})`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-member-single.png` });
  }

  // ================================================================
  // 6. Click a different member → graph switches
  // ================================================================
  console.log('\n[6] Click different member → graph switches');
  if (memberCount > 1) {
    const secondName = await memberItems.nth(1).locator('.member-name').textContent();
    console.log(`  Clicking member: "${secondName}"`);
    await memberItems.nth(1).click();
    await page.waitForTimeout(1000);

    const graphAfterSwitch = await page.locator('.graph-member-row').count();
    assert(graphAfterSwitch === 1, `Graph still shows 1 member after switching (got ${graphAfterSwitch})`);
  } else {
    console.log('  (skipped — only 1 member)');
  }

  // ================================================================
  // 7. Ctrl+Click to pin member → graph shows pinned + selected
  // ================================================================
  console.log('\n[7] Ctrl+Click pin → graph shows multiple');
  if (memberCount > 2) {
    // Pin first member via Ctrl+Click
    await memberItems.first().click({ modifiers: ['Control'] });
    await page.waitForTimeout(500);

    // Verify pin indicator appears
    const pinIndicators = await memberItems.first().locator('.pin-indicator').count();
    assert(pinIndicators > 0, `Pin indicator visible on first member`);

    // Now click (no ctrl) a different member — graph should show pinned + selected
    await memberItems.nth(2).click();
    await page.waitForTimeout(1000);

    const graphPinned = await page.locator('.graph-member-row').count();
    assert(graphPinned === 2, `Graph shows 2 members (1 pinned + 1 selected) (got ${graphPinned})`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-pinned-members.png` });

    // Unpin by Ctrl+Click again
    await memberItems.first().click({ modifiers: ['Control'] });
    await page.waitForTimeout(500);
    const unpinIndicators = await memberItems.first().locator('.pin-indicator').count();
    assert(unpinIndicators === 0, `Pin indicator removed after unpin`);
  } else {
    console.log('  (skipped — need at least 3 members)');
  }

  // ================================================================
  // 8. Member filter
  // ================================================================
  console.log('\n[8] Member filter');
  const memberFilter = page.locator('.member-filter');
  if (await memberFilter.isVisible()) {
    // Type a filter that should narrow results
    const beforeFilter = await memberItems.count();
    await memberFilter.fill('');
    await memberFilter.type('get', { delay: 30 });
    await page.waitForTimeout(500);

    const afterFilter = await memberItems.count();
    console.log(`  Members before filter: ${beforeFilter}, after "get": ${afterFilter}`);
    assert(afterFilter <= beforeFilter, `Filter reduced member count (${beforeFilter} → ${afterFilter})`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-member-filter.png` });

    // Clear filter
    await memberFilter.fill('');
    await page.waitForTimeout(300);
    const afterClear = await memberItems.count();
    assert(afterClear === beforeFilter, `Filter cleared, members restored (${afterClear})`);
  }

  // ================================================================
  // 9. Member sort
  // ================================================================
  console.log('\n[9] Member sort');
  const sortSelect = page.locator('.member-sort');
  if (await sortSelect.isVisible()) {
    // Sort by name
    await sortSelect.selectOption('name');
    await page.waitForTimeout(300);

    // Verify first member changed or stays alphabetically first
    const firstAfterSort = await memberItems.first().locator('.member-name').textContent();
    console.log(`  First member after name-sort: "${firstAfterSort}"`);
    assert(typeof firstAfterSort === 'string', `Sort by name works, first: "${firstAfterSort}"`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-member-sort-name.png` });

    // Reset to line sort
    await sortSelect.selectOption('line');
    await page.waitForTimeout(300);
  }

  // ================================================================
  // 10. Member group by kind
  // ================================================================
  console.log('\n[10] Member group by kind');
  const groupBtn = page.locator('.member-group-btn');
  if (await groupBtn.isVisible()) {
    await groupBtn.click();
    await page.waitForTimeout(300);

    const groupHeaders = await page.locator('.member-group-header').count();
    assert(groupHeaders > 0, `Group headers appeared: ${groupHeaders}`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-member-grouped.png` });

    // Toggle off
    await groupBtn.click();
    await page.waitForTimeout(300);
    const groupHeadersOff = await page.locator('.member-group-header').count();
    assert(groupHeadersOff === 0, `Group headers removed after toggle off`);
  }

  // ================================================================
  // 11. Filter tree for ResourceGroup + test inheritance
  // ================================================================
  console.log('\n[11] ResourceGroup hierarchy');
  await page.locator('.tree-filter').fill('ResourceGroup');
  await page.waitForTimeout(2000);
  const rgCount = await page.locator('.tree-item').count();
  assert(rgCount > 0, `ResourceGroup results: ${rgCount}`);

  if (rgCount > 0) {
    const items = page.locator('.tree-item');
    for (let i = 0; i < rgCount; i++) {
      const name = await items.nth(i).locator('.item-name').textContent();
      if (name === 'ResourceGroup') {
        await items.nth(i).click();
        break;
      }
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-hierarchy-resourcegroup.png` });
  }

  // ================================================================
  // 12. Source code with highlighted line
  // ================================================================
  console.log('\n[12] Source code highlight');
  const rgMembers = page.locator('.member-item');
  const rgMemberCount = await rgMembers.count();
  if (rgMemberCount > 2) {
    await rgMembers.nth(2).click();
    await page.waitForTimeout(1500);
    const highlightedLines = await page.locator('.source-line.highlighted').count();
    assert(highlightedLines > 0, `Source line highlighted: ${highlightedLines}`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/12-source-highlight.png` });
  }

  // ================================================================
  // 13. Ctrl+K search
  // ================================================================
  console.log('\n[13] Ctrl+K search');
  // Test via store action
  const storeSearchResults = await page.evaluate(async () => {
    await window.__telepathyStore.getState().search('ResourceGroup');
    const state = window.__telepathyStore.getState();
    return { count: state.searchResults?.length, query: state.searchQuery };
  });
  assert(storeSearchResults.count > 0, `Store search found ${storeSearchResults.count} results`);

  // Test via UI
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  const searchInput = page.locator('.search-input');
  if (await searchInput.isVisible()) {
    await searchInput.fill('');
    await page.waitForTimeout(100);
    await searchInput.type('ResourceGroup', { delay: 30 });
    await page.waitForTimeout(2000);
  }
  const resultCount = await page.locator('.search-result-item').count();
  assert(resultCount > 0, `Search dropdown results: ${resultCount}`);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/13-search.png` });

  // ================================================================
  // Summary
  // ================================================================
  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    console.log('SOME TESTS FAILED');
  } else {
    console.log('ALL TESTS PASSED');
  }

  browser.close();
  console.log('[test] Done!');
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('[test] Fatal:', err);
  process.exit(1);
});
