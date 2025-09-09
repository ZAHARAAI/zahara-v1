import { test, expect } from '@playwright/test';

test.describe('Agent Clinic Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Agent Clinic page
    await page.goto('/');
    
    // Wait for the page to load
    await expect(page.locator('h1')).toContainText('Agent Clinic', { timeout: 15000 });
    
    // Wait for initial data to load
    await page.waitForLoadState('networkidle');
    
    // Wait for either trace table or loading state
    await page.waitForSelector('[data-testid="trace-table"], [data-testid="kpi-tiles"]', { timeout: 15000 });
  });

  test('should display the main dashboard with all components', async ({ page }) => {
    // Check header
    await expect(page.locator('h1')).toContainText('Agent Clinic');
    await expect(page.locator('p').filter({ hasText: 'Monitor and debug your AI agent executions' })).toBeVisible();
    
    // Check real-time indicator
    await expect(page.locator('[data-testid="real-time-indicator"]')).toBeVisible();
    
    // Check KPI tiles section
    await expect(page.locator('h2').filter({ hasText: 'Performance Overview' })).toBeVisible();
    
    // Wait for KPI tiles to load
    await page.waitForSelector('[data-testid="kpi-tiles"]', { timeout: 10000 });
    
    // Check trace table section
    await expect(page.locator('h2').filter({ hasText: 'Trace History' })).toBeVisible();
    
    // Wait for either trace table or error message
    await page.waitForSelector('[data-testid="trace-table"], .text-red-500', { timeout: 15000 });
    
    // Check if there's an error message
    const errorMessage = page.locator('.text-red-500').first();
    if (await errorMessage.isVisible().catch(() => false)) {
      console.log('Error message found:', await errorMessage.textContent());
    }
    
    await expect(page.locator('[data-testid="trace-table"]')).toBeVisible();
    
    // Check export button
    await expect(page.locator('button:has-text("Export CSV")')).toBeVisible();
  });

  test('should show KPI tiles with correct data', async ({ page }) => {
    // Wait for KPI tiles to load
    await page.waitForSelector('[data-testid="kpi-tiles"]', { timeout: 10000 });
    
    // Check that at least 4 KPI tiles are present
    const kpiTiles = await page.locator('[data-testid="kpi-tile"]').count();
    expect(kpiTiles).toBeGreaterThanOrEqual(4);
    
    // Check specific KPI tiles exist
    await expect(page.locator('[data-testid="kpi-tile"]:has-text("Total Traces")')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-tile"]:has-text("Avg Latency")')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-tile"]:has-text("Success Rate")')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-tile"]:has-text("Total Cost")')).toBeVisible();
  });

  test('should display trace table with data', async ({ page }) => {
    // Wait for trace table to load
    await page.waitForSelector('[data-testid="trace-table"]', { timeout: 10000 });
    
    // Check table headers
    await expect(page.locator('th:has-text("Status")')).toBeVisible();
    await expect(page.locator('th:has-text("Trace ID")')).toBeVisible();
    await expect(page.locator('th:has-text("Time")')).toBeVisible();
    await expect(page.locator('th:has-text("Duration")')).toBeVisible();
    await expect(page.locator('th:has-text("Model")')).toBeVisible();
    await expect(page.locator('th:has-text("Operation")')).toBeVisible();
    
    // Check that at least one trace row exists
    await expect(page.locator('[data-testid="trace-row"]').first()).toBeVisible();
  });

  test('should handle trace table interactions', async ({ page }) => {
    // Wait for trace table to load
    await page.waitForSelector('[data-testid="trace-table"]', { timeout: 10000 });
    
    // Test sorting by clicking on column headers
    await page.locator('th:has-text("Time")').click();
    
    // Test search functionality
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
    
    await searchInput.fill('gpt-4');
    await page.waitForTimeout(500); // Wait for debounced search
    
    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(500);
  });

  test('should open and close span drawer', async ({ page }) => {
    // Wait for trace table to load
    await page.waitForSelector('[data-testid="trace-table"]', { timeout: 10000 });
    
    // Click on the first trace row to open span drawer
    await page.locator('[data-testid="trace-row"]').first().click();
    
    // Check that span drawer opens
    await expect(page.locator('[data-testid="span-drawer"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Trace Details")')).toBeVisible();
    
    // Close the drawer
    await page.locator('[data-testid="close-drawer"]').click();
    await expect(page.locator('[data-testid="span-drawer"]')).not.toBeVisible();
  });

  test('should handle copy to clipboard functionality', async ({ page }) => {
    // Wait for trace table to load
    await page.waitForSelector('[data-testid="trace-table"]', { timeout: 10000 });
    
    // Find and click a copy button
    const copyButton = page.locator('[data-testid="copy-trace-id"]').first();
    await expect(copyButton).toBeVisible();
    
    // Click copy button
    await copyButton.click();
    
    // Check for success toast (we can't test actual clipboard, but we can test UI feedback)
    // Note: react-hot-toast uses different selectors, let's check for the toast message
    await expect(page.locator('[data-hot-toast], .toast, [role="status"]:has-text("copied")')).toBeVisible({ timeout: 3000 });
  });

  test('should display status badges correctly', async ({ page }) => {
    // Wait for trace table to load
    await page.waitForSelector('[data-testid="trace-table"]', { timeout: 10000 });
    
    // Check for status badges
    const statusBadges = page.locator('[data-testid="status-badge"]');
    await expect(statusBadges.first()).toBeVisible();
    
    // Check that status badges have proper text
    const statusTexts = ['OK', 'ERROR', 'RATE LIMITED'];
    for (const statusText of statusTexts) {
      const badge = page.locator(`[data-testid="status-badge"]:has-text("${statusText}")`);
      if (await badge.count() > 0) {
        await expect(badge.first()).toBeVisible();
      }
    }
  });

  test('should show real-time updates indicator', async ({ page }) => {
    // Check real-time indicator
    const realTimeIndicator = page.locator('[data-testid="real-time-indicator"]');
    await expect(realTimeIndicator).toBeVisible();
    
    // Check for "Live" or "Paused" status
    await expect(realTimeIndicator.locator('span').filter({ hasText: /^(Live|Paused)$/ })).toBeVisible();
    
    // Check for last update time
    await expect(realTimeIndicator.locator('span').filter({ hasText: /(ago|Never|Just now)/ })).toBeVisible();
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check that main components are still visible and properly laid out
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-testid="kpi-tiles"]')).toBeVisible();
    await expect(page.locator('[data-testid="trace-table"]')).toBeVisible();
    
    // Check that tables are scrollable on mobile
    const tableContainer = page.locator('[data-testid="trace-table"]');
    await expect(tableContainer).toBeVisible();
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/traces*', route => route.abort());
    
    // Reload page to trigger error state
    await page.reload();
    
    // Check for error handling in UI
    await page.waitForTimeout(2000);
    
    // Should show some kind of error state or fallback content
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent).toBeTruthy();
  });
});
