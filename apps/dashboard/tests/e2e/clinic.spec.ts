import { test, expect } from '@playwright/test';

test.describe('Clinic Page', () => {
  test('should display runs table and allow selection', async ({ page }) => {
    await page.goto('/clinic');

    // Wait for the table to load
    await expect(page.locator('text=Recent Runs')).toBeVisible();
    
    // Check that mock data is displayed
    await expect(page.locator('text=req-001')).toBeVisible();
    await expect(page.locator('text=req-002')).toBeVisible();
    await expect(page.locator('text=req-003')).toBeVisible();
    await expect(page.locator('text=req-004')).toBeVisible();
    
    // Check status badges
    await expect(page.locator('text=Success')).toBeVisible();
    await expect(page.locator('text=Error')).toBeVisible();
    await expect(page.locator('text=Running')).toBeVisible();
    
    // Click on a run to view details
    await page.click('tr:has-text("req-001")');
    
    // Check that details panel shows the selected run
    await expect(page.locator('text=Run Details')).toBeVisible();
    await expect(page.locator('text=req-001')).toBeVisible();
    await expect(page.locator('text=Process user data')).toBeVisible();
    await expect(page.locator('text=1.25s')).toBeVisible();
    
    // Check Jaeger link
    await expect(page.locator('a:has-text("View in Jaeger")')).toBeVisible();
  });

  test('should handle URL parameter for specific request ID', async ({ page }) => {
    // Navigate with specific request ID
    await page.goto('/clinic?requestId=req-002');
    
    // Wait for the page to load
    await expect(page.locator('text=Recent Runs')).toBeVisible();
    
    // Check that the specific run is highlighted/selected
    await expect(page.locator('text=Run Details')).toBeVisible();
    await expect(page.locator('text=req-002')).toBeVisible();
    await expect(page.locator('text=Generate report')).toBeVisible();
    
    // Check error details are shown
    await expect(page.locator('text=Connection timeout')).toBeVisible();
  });

  test('should show loading state initially', async ({ page }) => {
    // Mock a slow response
    await page.route('**/clinic', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });
    
    await page.goto('/clinic');
    
    // Should show loading spinner
    await expect(page.locator('.animate-spin')).toBeVisible();
    
    // Wait for content to load
    await expect(page.locator('text=Recent Runs')).toBeVisible({ timeout: 5000 });
  });

  test('should display different status badges correctly', async ({ page }) => {
    await page.goto('/clinic');
    
    // Check success badge
    await expect(page.locator('.bg-green-100.text-green-800:has-text("Success")')).toBeVisible();
    
    // Check error badge
    await expect(page.locator('.bg-red-100.text-red-800:has-text("Error")')).toBeVisible();
    
    // Check running badge
    await expect(page.locator('.bg-yellow-100.text-yellow-800:has-text("Running")')).toBeVisible();
  });
});
