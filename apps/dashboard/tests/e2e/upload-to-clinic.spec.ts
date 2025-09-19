import { test, expect } from '@playwright/test';

test.describe('Upload Wizard to Clinic Flow', () => {
  test('should complete upload wizard and redirect to clinic', async ({ page }) => {
    // Navigate to upload page
    await page.goto('/upload');

    // Step 1: Fill task details
    await page.fill('input[id="taskName"]', 'Test Upload Task');
    await page.fill('textarea[id="description"]', 'This is a test task for the upload wizard');
    
    // Click Next
    await page.click('button:has-text("Next")');
    
    // Step 2: Configure parameters
    await page.fill('input[id="timeout"]', '60');
    await page.fill('input[id="retries"]', '2');
    await page.check('input[type="checkbox"]');
    
    // Click Next
    await page.click('button:has-text("Next")');
    
    // Step 3: Review and submit
    await expect(page.locator('text=Test Upload Task')).toBeVisible();
    await expect(page.locator('text=This is a test task for the upload wizard')).toBeVisible();
    await expect(page.locator('text=60s')).toBeVisible();
    await expect(page.locator('text=2')).toBeVisible();
    await expect(page.locator('text=Enabled')).toBeVisible();
    
    // Mock the API response
    await page.route('**/run', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          request_id: 'test-request-123',
          status: 'success',
          result: { message: 'Task completed successfully' },
          duration_ms: 1500
        })
      });
    });
    
    // Click Upload & Run
    await page.click('button:has-text("Upload & Run")');
    
    // Should redirect to clinic with request ID
    await expect(page).toHaveURL(/\/clinic\?requestId=test-request-123/);
    
    // Verify clinic page shows the request
    await expect(page.locator('text=test-request-123')).toBeVisible();
    await expect(page.locator('text=Test Upload Task')).toBeVisible();
  });

  test('should handle upload errors gracefully', async ({ page }) => {
    await page.goto('/upload');

    // Fill required fields
    await page.fill('input[id="taskName"]', 'Error Test Task');
    await page.fill('textarea[id="description"]', 'This task will fail');
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")');
    
    // Mock API error response
    await page.route('**/run', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Internal server error'
        })
      });
    });
    
    // Click Upload & Run
    await page.click('button:has-text("Upload & Run")');
    
    // Should show error message
    await expect(page.locator('text=Upload failed')).toBeVisible();
  });
});
