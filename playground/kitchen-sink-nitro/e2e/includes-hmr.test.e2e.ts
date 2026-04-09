import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { gotoAndWait, trackRuntimeErrors } from './helpers';

const SEO_INCLUDE_FILE = fileURLToPath(new URL('../src/includes/seo.kita.tsx', import.meta.url));
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

		await expect(page).toHaveTitle(`${initialTitle} ${SEO_SUFFIX}`, { timeout: 10000 });
		runtime.assertClean();
	});
});
