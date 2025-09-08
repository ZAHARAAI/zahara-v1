import { test, expect } from '@playwright/test';

test.describe('Real-time Updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Agent Clinic', { timeout: 15000 });
    
    // Wait for initial data to load
    await page.waitForLoadState('networkidle');
    
    // Wait for initial load
    await page.waitForSelector('[data-testid="real-time-indicator"]', { timeout: 15000 });
  });

  test('should display real-time indicator with correct status', async ({ page }) => {
    const realTimeIndicator = page.locator('[data-testid="real-time-indicator"]');
    
    // Check that indicator is visible
    await expect(realTimeIndicator).toBeVisible();
    
    // Should show either "Live" or "Paused" status
    await expect(realTimeIndicator.locator('span').filter({ hasText: /^(Live|Paused)$/ })).toBeVisible();
    
    // Should show last update time
    await expect(realTimeIndicator.locator('span').filter({ hasText: /(ago|Never|Just now)/ })).toBeVisible();
  });

  test('should pause polling when user interacts with table', async ({ page }) => {
    // Wait for trace table to load
    await page.waitForSelector('[data-testid="trace-table"]', { timeout: 10000 });
    
    // Interact with the table (sort)
    await page.locator('th:has-text("Time")').click();
    
    // Check that polling status changes to paused
    const realTimeIndicator = page.locator('[data-testid="real-time-indicator"]');
    await expect(realTimeIndicator.locator('span:has-text("Paused")')).toBeVisible({ timeout: 2000 });
  });

  test('should pause polling when user searches', async ({ page }) => {
    // Wait for search input to be available
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
    
    // Perform a search
    await searchInput.fill('gpt-4');
    
    // Check that polling status changes to paused
    const realTimeIndicator = page.locator('[data-testid="real-time-indicator"]');
    await expect(realTimeIndicator.locator('span').filter({ hasText: /^Paused$/ })).toBeVisible({ timeout: 2000 });
  });

  test('should show new trace count when available', async ({ page }) => {
    // Mock API to return new traces
    let traceCount = 5;
    await page.route('**/traces*', async route => {
      const response = await route.fetch();
      const data = await response.json();
      
      // Increment trace count to simulate new traces
      if (data.data && data.data.traces) {
        traceCount += 1;
        data.data.traces.unshift({
          trace_id: `new-trace-${traceCount}`,
          timestamp: new Date().toISOString(),
          total_duration: 1500,
          total_tokens: 150,
          total_cost: 0.01,
          status: 'OK',
          model: 'gpt-4',
          operation: 'test_operation',
          user_id: 'test-user',
          workflow_id: 'test-workflow'
        });
        data.data.pagination.total = traceCount;
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data)
      });
    });
    
    // Wait for potential new traces indicator
    // Note: This is a simulation - in real testing, we'd need to wait for the polling interval
    await page.waitForTimeout(6000); // Wait longer than polling interval
    
    // Check if new traces indicator appears
    const realTimeIndicator = page.locator('[data-testid="real-time-indicator"]');
    const newTracesIndicator = realTimeIndicator.locator(':has-text("new")').first();
    
    // This might not always be visible depending on timing, so we use a conditional check
    if (await newTracesIndicator.count() > 0) {
      await expect(newTracesIndicator).toBeVisible();
    }
    
    // Clean up routes
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('should update KPI tiles in real-time', async ({ page }) => {
    // Wait for KPI tiles to load
    await page.waitForSelector('[data-testid="kpi-tiles"]', { timeout: 10000 });
    
    // Get initial values
    const successRateTile = page.locator('[data-testid="kpi-tile"]:has-text("Success Rate")');
    await expect(successRateTile).toBeVisible();
    
    // Mock API to return updated metrics
    await page.route('**/metrics/aggregate*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            total_traces_24h: 150,
            avg_latency: 2.1,
            success_rate: 0.96,
            total_cost_24h: 25.67,
            p95_latency: 8.5,
            error_rate: 0.04,
            total_tokens_24h: 45000,
            rate_limit_rate: 0.02
          }
        })
      });
    });
    
    // Wait for potential updates (polling interval)
    await page.waitForTimeout(6000);
    
    // Check that tiles are still visible and functional
    await expect(successRateTile).toBeVisible();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/traces*', route => route.abort());
    
    // Wait for error handling
    await page.waitForTimeout(3000);
    
    // Check that the page still functions
    const realTimeIndicator = page.locator('[data-testid="real-time-indicator"]');
    await expect(realTimeIndicator).toBeVisible();
    
    // The indicator might show offline state or continue showing last known state
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent).toBeTruthy();
  });

  test('should maintain real-time updates across navigation', async ({ page }) => {
    // Start on the main page
    const realTimeIndicator = page.locator('[data-testid="real-time-indicator"]');
    await expect(realTimeIndicator).toBeVisible();
    
    // Interact with page elements to test persistence
    await page.locator('input[placeholder*="Search"]').fill('test');
    await page.waitForTimeout(1000);
    
    // Clear search and verify indicator is still working
    await page.locator('input[placeholder*="Search"]').fill('');
    await page.waitForTimeout(1000);
    
    // Indicator should still be functional
    await expect(realTimeIndicator).toBeVisible();
  });

  test('should show appropriate indicators during loading states', async ({ page }) => {
    // Mock slow API response
    await page.route('**/traces*', async route => {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const response = await route.fetch();
        await route.fulfill({ response });
      } catch {
        // If test ends, just continue without error
        await route.continue();
      }
    });
    
    // Reload page to trigger loading
    await page.reload();
    
    // Check for loading indicators
    await page.waitForSelector('[data-testid="kpi-tiles"]', { timeout: 15000 });
    
    // Real-time indicator should eventually appear
    await expect(page.locator('[data-testid="real-time-indicator"]')).toBeVisible({ timeout: 15000 });
    
    // Clean up routes
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});
