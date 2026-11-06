import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { registerReactAppTests } from './react-production-start.e2e-shared';

const distDir = path.join(import.meta.dirname, 'dist-react-production-start-e2e');

function listFilesWrittenAfter(dir: string, timeMs: number): string[] {
	return readdirSync(dir, { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(entry.parentPath, entry.name))
		.filter((filePath) => statSync(filePath).mtimeMs > timeMs)
		.map((filePath) => path.relative(distDir, filePath));
}

test.describe.configure({ mode: 'serial' });

test.describe('A built React app under `ecopages start`', () => {
	registerReactAppTests(test, {
		rendersRequests: true,
		checkReactModule: (reactModule) => {
			expect(reactModule.url).toMatch(/-[A-Za-z0-9_-]{8}\.js$/);
			expect(reactModule.cacheControl).toBe('public, max-age=31536000, immutable');
		},
	});

	for (const { pathname, status, heading } of [
		{ pathname: '/missing', status: 404, heading: 'not-found-page' },
		{ pathname: '/boom', status: 500, heading: 'server-error-page' },
	]) {
		test(`serves the ${status} page for ${pathname} and hydrates its island`, async ({ page }) => {
			const response = await page.goto(pathname);

			expect(response?.status()).toBe(status);
			await expect(page.locator('h1')).toHaveText(heading);
			const counter = page.locator('[data-counter]');
			await expect(counter).toHaveText('count 0');
			await counter.click();
			await expect(counter).toHaveText('count 1');
		});
	}

	test('writes nothing into the build output while it serves', () => {
		const ledgerWrittenAt = statSync(path.join(distDir, 'server/processed-assets.json')).mtimeMs;

		expect(listFilesWrittenAfter(distDir, ledgerWrittenAt)).toEqual([]);
	});
});
