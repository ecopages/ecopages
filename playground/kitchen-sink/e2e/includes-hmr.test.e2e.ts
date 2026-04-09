import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { gotoAndWait, trackRuntimeErrors } from './helpers';

const SEO_INCLUDE_FILE = path.join(process.cwd(), 'playground/kitchen-sink/src/includes/seo.kita.tsx');
const SEO_SUFFIX = '[include-hmr]';

function patchSeoTitle(content: string, suffix: string) {
	return content.replace('<title safe>{title}</title>', `<title safe>{\`${'${title}'} ${suffix}\`}</title>`);
}

test.describe('Kitchen Sink Playground Includes HMR', () => {
	let originalSeoInclude = '';

	test.describe.configure({ mode: 'serial' });

	test.beforeAll(() => {
		originalSeoInclude = fs.readFileSync(SEO_INCLUDE_FILE, 'utf-8');
	});

	test.afterAll(() => {
		fs.writeFileSync(SEO_INCLUDE_FILE, originalSeoInclude, 'utf-8');
	});

	test('reloads the page when a shared include template changes', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/docs');
		const initialTitle = await page.title();

		fs.writeFileSync(SEO_INCLUDE_FILE, patchSeoTitle(originalSeoInclude, SEO_SUFFIX), 'utf-8');

		const expectedTitle = `${initialTitle} ${SEO_SUFFIX}`;

		try {
			await expect(page).toHaveTitle(expectedTitle, { timeout: 5000 });
		} catch {
			await expect
				.poll(async () => {
					await page.reload({ waitUntil: 'networkidle' });
					return page.title();
				})
				.toBe(expectedTitle);
		}

		runtime.assertClean();
	});
});
