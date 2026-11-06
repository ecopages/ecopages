import { expect, type Page } from '@playwright/test';

/** Asserts what the `headers` option of `html-pages/eco.config.headers.ts` promises, against the server `page` is pointed at. */
export async function expectConfiguredResponseHeaders(page: Page): Promise<void> {
	const response = await page.goto('/about');
	expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
	expect(response?.headers()['cross-origin-embedder-policy']).toBe('require-corp');
	expect(response?.headers()['content-type']).toContain('text/html');

	const isolation = await page.evaluate(() => {
		let sharedArrayBuffer = false;
		try {
			sharedArrayBuffer = new SharedArrayBuffer(8).byteLength === 8;
		} catch {
			sharedArrayBuffer = false;
		}
		return { crossOriginIsolated: self.crossOriginIsolated, sharedArrayBuffer };
	});
	expect(isolation).toEqual({ crossOriginIsolated: true, sharedArrayBuffer: true });

	const scoped = await page.request.get('/images/team.svg');
	expect(scoped.headers()['access-control-allow-origin']).toBe('*');
	expect(scoped.headers()['content-type']).toContain('image/svg+xml');
	expect(scoped.headers()['etag']).toBeTruthy();

	const unscoped = await page.request.get('/about');
	expect(unscoped.headers()['access-control-allow-origin']).toBeUndefined();
}
