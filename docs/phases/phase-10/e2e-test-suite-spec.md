# E2E Test Suite Specification

## Overview

This document specifies the End-to-End (E2E) test suite for Phase 10, integrating all prior phase validation into a comprehensive regression safety net.

## Test Pyramid

### Layer 1: Unit Tests
- **Location**: `tests/unit/`
- **Coverage Target**: ≥90% for core libraries
- **Execution**: `npm run test:unit` on every PR
- **Scope**: Zod schemas, chunking logic, normalizer matching, cache key generation

### Layer 2: Integration Tests
- **Location**: `tests/integration/`
- **Coverage Target**: 100% of Phase 4-8 handoff contracts
- **Execution**: `npm run test:integration` on every PR
- **Scope**: Cross-component flows with mocked external services

### Layer 3: E2E Tests
- **Location**: `tests/e2e/`
- **Framework**: Playwright with headless Chrome
- **Execution**: `npm run test:e2e` on every push/PR
- **Scope**: Full user journeys in production-like environment

## Critical User Journeys

### Journey 1: Single-Paper Workflow
```typescript
test('single-paper journey', async ({ page }) => {
  // 1. Upload PDF
  await page.goto('/workspace');
  await page.setInputFiles('input[type="file"]', 'test-fixtures/sample-paper.pdf');
  
  // 2. View extraction progress via Realtime
  await expect(page.getByText('Processing')).toBeVisible();
  await expect(page.getByText('Completed')).toBeVisible({ timeout: 60000 });
  
  // 3. Explore graph
  await page.click('[data-testid="graph-view"]');
  await expect(page.locator('canvas')).toBeVisible();
  
  // 4. Click node and verify evidence
  await page.click('.graph-node[data-type="method"]');
  await expect(page.getByTestId('evidence-panel')).toBeVisible();
  
  // 5. Verify evidence highlight in PDF
  await page.click('[data-testid="show-evidence"]');
  const highlightVisible = await page.locator('.pdf-highlight').isVisible();
  expect(highlightVisible).toBeTruthy();
  
  // 6. Export citation
  await page.click('[data-testid="export-citation"]');
  const download = await page.waitForEvent('download');
  expect(download.suggestedFilename()).toContain('citation');
});
```

### Journey 2: Multi-Paper Synthesis
```typescript
test('multi-paper synthesis journey', async ({ page }) => {
  // 1. Select 3 papers
  await page.goto('/workspace');
  await page.check('input[name="paper-select"][value="paper-1"]');
  await page.check('input[name="paper-select"][value="paper-2"]');
  await page.check('input[name="paper-select"][value="paper-3"]');
  
  // 2. Trigger synthesis
  await page.click('[data-testid="synthesize-button"]');
  await expect(page.getByText('Merging graphs...')).toBeVisible();
  
  // 3. Navigate merged graph
  await page.click('.merged-graph-node');
  
  // 4. Resolve conflict
  const conflictIndicator = await page.locator('[data-testid="conflict-indicator"]').isVisible();
  if (conflictIndicator) {
    await page.click('[data-testid="view-conflict"]');
    await expect(page.getByTestId('conflict-resolution-panel')).toBeVisible();
  }
  
  // 5. Compare evidence from different papers
  await page.click('[data-testid="compare-evidence"]');
  const evidencePanels = await page.locator('.evidence-panel').count();
  expect(evidencePanels).toBeGreaterThanOrEqual(2);
});
```

### Journey 3: Error Recovery
```typescript
test('error recovery journey', async ({ page }) => {
  // 1. Upload corrupt PDF
  await page.goto('/workspace');
  await page.setInputFiles('input[type="file"]', 'test-fixtures/corrupt.pdf');
  
  // 2. Observe graceful failure
  await expect(page.getByText('Failed to parse PDF')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Please try again')).toBeVisible();
  
  // 3. Retry with valid file
  await page.click('[data-testid="retry-upload"]');
  await page.setInputFiles('input[type="file"]', 'test-fixtures/valid-paper.pdf');
  
  // 4. Verify success
  await expect(page.getByText('Upload successful')).toBeVisible({ timeout: 30000 });
});
```

### Journey 4: Auth/RLS Verification
```typescript
test('cross-user access denied', async ({ browser }) => {
  // User A creates paper
  const contextA = await browser.newContext({ storageState: 'auth-user-a.json' });
  const pageA = await contextA.newPage();
  await pageA.goto('/workspace');
  // ... upload paper ...
  
  // User B attempts access
  const contextB = await browser.newContext({ storageState: 'auth-user-b.json' });
  const pageB = await contextB.newPage();
  await pageB.goto(`/workspace/paper/${paperId}`);
  
  // Verify access denied
  await expect(pageB.getByText('Access Denied')).toBeVisible();
  
  // Service role bypass
  const servicePage = await createServiceRolePage();
  await servicePage.goto(`/workspace/paper/${paperId}`);
  await expect(servicePage.locator('canvas')).toBeVisible();
});
```

### Journey 5: Performance Regression
```typescript
test('performance budgets', async ({ page }) => {
  await page.goto('/workspace');
  
  // Measure LCP
  const lcp = await page.evaluate(() => {
    return new Promise(resolve => {
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        resolve(entries[entries.length - 1].startTime);
      }).observe({ entryTypes: ['largest-contentful-paint'] });
    });
  });
  expect(lcp).toBeLessThan(1500); // 1.5s target
  
  // Measure FID via interaction
  const startTime = Date.now();
  await page.click('.graph-node');
  const fid = Date.now() - startTime;
  expect(fid).toBeLessThan(100); // 100ms target
  
  // Measure CLS
  const cls = await page.evaluate(() => {
    return new Promise(resolve => {
      let clsValue = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          clsValue += entry.value;
        }
      }).observe({ entryTypes: ['layout-shift'] });
      setTimeout(() => resolve(clsValue), 5000);
    });
  });
  expect(cls).toBeLessThan(0.05);
});
```

## Flaky Test Protocol

### Quarantine Process
1. Test fails 3 consecutive times → auto-quarantine
2. GitHub issue created with failure artifacts
3. Test moved to `tests/e2e/quarantined/`
4. Alert sent to #test-failures Slack channel

### Re-integration Criteria
- Root cause identified and fixed
- Test passes 10 consecutive times locally
- PR review approval required

## CI Pipeline Configuration

See `.github/workflows/e2e.yml` for:
- Supabase test container setup
- Migration application
- Playwright browser installation
- Parallel test execution
- Artifact upload on failure

## Maintenance Guide

### Adding New Tests
1. Identify critical user journey
2. Create test file in `tests/e2e/`
3. Add to journey registry
4. Run locally: `npm run test:e2e -- --grep "journey name"`
5. Submit PR with test results

### Updating Test Data
- Gold standard corpus: `test-fixtures/gold-corpus/`
- Synthetic papers: Generated via `scripts/generate-test-papers.ts`
- Auth states: Created via `scripts/create-test-users.ts`

### Debugging Failures
1. Download artifacts from failed workflow
2. Open HTML report: `npx playwright show-report reports/e2e-report.html`
3. Review trace viewer for step-by-step execution
4. Check console logs and network requests

## Metrics Dashboard

Test metrics published to:
- GitHub Actions summary
- PR comments with pass/fail status
- Internal dashboard at `/test-metrics`

Key metrics tracked:
- Test duration (p50, p95, p99)
- Flakiness rate
- Coverage percentage
- Time to detect regressions
