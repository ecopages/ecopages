import { expect, test } from '@playwright/test';

test('static export renders Kita Pages concurrently', async ({ page }) => {
	for (const pathname of ['/static-concurrency/first', '/static-concurrency/second']) {
		await page.goto(pathname);
		await expect(page.getByTestId('static-concurrency-page')).toHaveAttribute('data-peak-concurrent-renders', '2');
	}
});
