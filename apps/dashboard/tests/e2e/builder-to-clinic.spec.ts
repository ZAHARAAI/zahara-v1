import { test, expect } from '@playwright/test';

test.describe('Builder to Clinic Flow', () => {
  test('should save and test configuration, then redirect to clinic', async ({ page }) => {
    // Navigate to builder page
    await page.goto('/builder');

    // Fill configuration
    await page.fill('input[id="name"]', 'Test Configuration');
    await page.fill('textarea[id="description"]', 'This is a test configuration for the builder');
    await page.selectOption('select[id="type"]', 'workflow');
    
    // Configure settings
    await page.fill('input[id="timeout"]', '45');
    await page.fill('input[id="retries"]', '1');
    await page.check('input[type="checkbox"]');
    
    // Mock the API response
    await page.route('**/run', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          request_id: 'builder-test-456',
          status: 'success',
          result: { 
            configuration: 'saved',
            test: 'completed',
            message: 'Configuration saved and test completed successfully!'
          },
          duration_ms: 2000
        })
      });
    });
    
    // Click Save & Test
    await page.click('button:has-text("Save & Test")');
    
    // Should show success message
    await expect(page.locator('text=Configuration saved and test completed successfully!')).toBeVisible();
    await expect(page.locator('text=builder-test-456')).toBeVisible();
    
    // Should redirect to clinic after delay
    await expect(page).toHaveURL(/\/clinic\?requestId=builder-test-456/, { timeout: 5000 });
    
    // Verify clinic page shows the request
    await expect(page.locator('text=builder-test-456')).toBeVisible();
    await expect(page.locator('text=Build and test: Test Configuration')).toBeVisible();
  });

  test('should handle builder test errors', async ({ page }) => {
    await page.goto('/builder');

    // Fill configuration
    await page.fill('input[id="name"]', 'Error Test Config');
    await page.fill('textarea[id="description"]', 'This configuration will fail');
    await page.selectOption('select[id="type"]', 'custom');
    
    // Mock API error response
    await page.route('**/run', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Invalid configuration'
        })
      });
    });
    
    // Click Save & Test
    await page.click('button:has-text("Save & Test")');
    
    // Should show error message
    await expect(page.locator('text=Test failed')).toBeVisible();
    await expect(page.locator('text=Invalid configuration')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/builder');

    // Try to save without filling required fields
    await page.click('button:has-text("Save & Test")');
    
    // Button should be disabled
    await expect(page.locator('button:has-text("Save & Test")')).toBeDisabled();
    
    // Fill only name
    await page.fill('input[id="name"]', 'Partial Config');
    
    // Button should still be disabled (description required)
    await expect(page.locator('button:has-text("Save & Test")')).toBeDisabled();
    
    // Fill description
    await page.fill('textarea[id="description"]', 'Now it should work');
    
    // Button should be enabled
    await expect(page.locator('button:has-text("Save & Test")')).toBeEnabled();
  });
});
