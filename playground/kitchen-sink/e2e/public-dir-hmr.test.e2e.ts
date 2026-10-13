import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture';
import type { APIRequestContext } from 'playwright-core';
import { HMR_MUTATION_ASSERT_TIMEOUT_MS, gotoPath, startEcopagesHmrConnectionWatch } from './test-support';

const PUBLIC_FILE = 'src/public/site.webmanifest';
const PUBLIC_URL = '/site.webmanifest';

async function fetchText(request: APIRequestContext, pathname: string): Promise<string> {
	try {
		return await (await request.get(pathname)).text();
	} catch {
		return '';
	}
}

test.describe('public directory reload @hmr', () => {
	let publicFile: string | undefined;
	let original: string | undefined;

	test.afterEach(async ({ request }) => {
		if (!publicFile || original === undefined) {
			return;
		}
		fs.writeFileSync(publicFile, original, 'utf-8');
		await expect
			.poll(() => fetchText(request, PUBLIC_URL), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
			.toBe(original);
	});

	test('a public file edit reloads the page', async ({ page, app }) => {
		publicFile = path.join(app.dir, PUBLIC_FILE);
		original = fs.readFileSync(publicFile, 'utf-8');

		const hmrConnected = startEcopagesHmrConnectionWatch(page);
		await gotoPath(page, '/');
		await hmrConnected;
		await page.evaluate(() => {
			(window as Window & { __beforePublicEdit?: boolean }).__beforePublicEdit = true;
		});

		fs.writeFileSync(publicFile, `${original}\n`, 'utf-8');

		await expect
			.poll(
				() =>
					page
						.evaluate(
							() => (window as Window & { __beforePublicEdit?: boolean }).__beforePublicEdit === true,
						)
						.catch(() => true),
				{ timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS },
			)
			.toBe(false);
	});
});
