import { availableParallelism } from 'node:os';
import { expect, test } from '@playwright/test';

test('static export renders Kita Pages concurrently', async ({ page }) => {
	test.skip(
		availableParallelism() < 3,
		'Static export reserves one logical CPU and needs at least three to schedule two workers.',
	);

	await page.goto('/static-concurrency/first');
	const firstPage = page.getByTestId('static-concurrency-page');
	await expect(firstPage).toHaveText('First page');
	await expect(firstPage).toHaveAttribute('data-peak-concurrent-renders', '2');

	await page.goto('/static-concurrency/second');
	const secondPage = page.getByTestId('static-concurrency-page');
	await expect(secondPage).toHaveText('Second page');
	await expect(secondPage).toHaveAttribute('data-peak-concurrent-renders', '2');
});
