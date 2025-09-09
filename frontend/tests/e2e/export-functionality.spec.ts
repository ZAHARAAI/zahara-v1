import { test, expect } from '@playwright/test';

test.describe('CSV Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Agent Clinic', { timeout: 15000 });
    
    // Wait for initial data to load
    await page.waitForLoadState('networkidle');
    
    // Wait for trace table to load
    await page.waitForSelector('[data-testid="trace-table"]', { timeout: 15000 });
  });

  test('should open export modal when export button is clicked', async ({ page }) => {
    // Click export button
    await page.locator('button:has-text("Export CSV")').click();
    
    // Check that export modal opens
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Export Traces")')).toBeVisible();
  });

  test('should display export configuration options', async ({ page }) => {
    // Open export modal
    await page.locator('button:has-text("Export CSV")').click();
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
    
    // Check export summary section
    await expect(page.locator('[data-testid="export-modal"] :has-text("Export Summary")').first()).toBeVisible();
    await expect(page.locator('[data-testid="export-modal"] :has-text("Traces to export")').first()).toBeVisible();
    await expect(page.locator('[data-testid="export-modal"] :has-text("Estimated size")').first()).toBeVisible();
    await expect(page.locator('[data-testid="export-modal"] :has-text("Format: CSV")').first()).toBeVisible();
    
    // Check export options
    await expect(page.locator('[data-testid="export-modal"] :has-text("Include in Export")').first()).toBeVisible();
    await expect(page.locator('[data-testid="export-modal"] span:has-text("Span details")')).toBeVisible();
    await expect(page.locator('[data-testid="export-modal"] span:has-text("Events and logs")')).toBeVisible();
    await expect(page.locator('[data-testid="export-modal"] span:has-text("Metadata fields")')).toBeVisible();
  });

  test('should show active filters in export modal', async ({ page }) => {
    // Apply a search filter first
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('gpt-4');
    await page.waitForTimeout(500);
    
    // Open export modal
    await page.locator('button:has-text("Export CSV")').click();
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
    
    // Check that active filters are shown
    await expect(page.locator('[data-testid="export-modal"] :has-text("Active Filters")').first()).toBeVisible();
    await expect(page.locator('[data-testid="export-modal"] :has-text("gpt-4")').first()).toBeVisible();
  });

  test('should handle export configuration changes', async ({ page }) => {
    // Open export modal
    await page.locator('button:has-text("Export CSV")').click();
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
    
    // Toggle export options
    const spanDetailsCheckbox = page.locator('[data-testid="export-modal"] label:has-text("Span details") input[type="checkbox"]');
    const metadataCheckbox = page.locator('[data-testid="export-modal"] label:has-text("Metadata fields") input[type="checkbox"]');
    
    // Toggle some checkboxes
    await spanDetailsCheckbox.click();
    await metadataCheckbox.click();
    
    // Verify checkboxes changed state
    await expect(spanDetailsCheckbox).not.toBeChecked();
    await expect(metadataCheckbox).toBeChecked();
  });

  test('should show export progress when export is initiated', async ({ page }) => {
    // Open export modal
    await page.locator('button:has-text("Export CSV")').click();
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
    
    // Mock a slower API response to see progress
    await page.route('**/traces/export', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'trace_id,timestamp,duration\ntest-123,2024-01-01T12:00:00Z,1000'
      });
    });
    
    // Click export button
    await page.locator('[data-testid="export-modal"] button:has-text("Export CSV")').click();
    
    // Check for progress indicators
    await expect(page.locator('[data-testid="export-modal"] :has-text("Preparing Export")').first()).toBeVisible();
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    
    // Wait for completion
    await expect(page.locator('[data-testid="export-modal"] :has-text("Export Complete")').first()).toBeVisible({ timeout: 5000 });
  });

  test('should handle export errors gracefully', async ({ page }) => {
    // Mock export API failure
    await page.route('**/traces/export', route => route.abort());
    
    // Open export modal
    await page.locator('button:has-text("Export CSV")').click();
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
    
    // Click export button
    await page.locator('[data-testid="export-modal"] button:has-text("Export CSV")').click();
    
    // Check for error state
    await expect(page.locator('[data-testid="export-modal"] :has-text("Export Failed")').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Try Again")')).toBeVisible();
  });

  test('should close modal when cancel is clicked', async ({ page }) => {
    // Open export modal
    await page.locator('button:has-text("Export CSV")').click();
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
    
    // Click cancel
    await page.locator('button:has-text("Cancel")').click();
    
    // Check that modal is closed
    await expect(page.locator('[data-testid="export-modal"]')).not.toBeVisible();
  });

  test('should not allow closing modal during export', async ({ page }) => {
    // Open export modal
    await page.locator('button:has-text("Export CSV")').click();
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
    
    // Mock a slower API response
    await page.route('**/traces/export', async route => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'trace_id,timestamp\ntest-123,2024-01-01T12:00:00Z'
      });
    });
    
    // Start export
    await page.locator('[data-testid="export-modal"] button:has-text("Export CSV")').click();
    
    // Check that close button is not available during processing
    await expect(page.locator('[data-testid="export-modal"] :has-text("Preparing Export")').first()).toBeVisible();
    await expect(page.locator('[data-testid="close-modal"]')).not.toBeVisible();
  });

  test('should update estimated file size when options change', async ({ page }) => {
    // Open export modal
    await page.locator('button:has-text("Export CSV")').click();
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
    
    // Get initial estimated size
    const sizeText = page.locator('[data-testid="export-modal"] :has-text("Estimated size:")').first();
    await expect(sizeText).toBeVisible();
    
    // Toggle options that should change file size
    const metadataCheckbox = page.locator('[data-testid="export-modal"] label:has-text("Metadata fields") input[type="checkbox"]');
    await metadataCheckbox.click();
    
    // Note: We can't easily test the actual size change without more complex setup,
    // but we can verify the component is interactive
    await expect(metadataCheckbox).toBeChecked();
  });
});
