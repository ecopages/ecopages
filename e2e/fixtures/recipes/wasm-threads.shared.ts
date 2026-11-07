import { expect, type Page } from '@playwright/test';

/** Asserts the WebAssembly threads recipe: the isolation headers on the page and the Worker script, and shared memory counted by the Worker. */
export async function expectIsolatedWorkerCounts(page: Page): Promise<void> {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));

	const response = await page.goto('/');
	expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
	expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp');

	await expect(page.locator('[data-result]')).toHaveText('isolated, counter 1000');
	expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
	expect(errors).toEqual([]);

	const workerUrl = await page.evaluate(
		() => performance.getEntriesByType('resource').find((entry) => /counter\.worker/.test(entry.name))?.name,
	);
	expect(workerUrl).toBeTruthy();
	const worker = await page.request.get(workerUrl as string);
	expect(worker.headers()['cross-origin-embedder-policy']).toBe('require-corp');
}
