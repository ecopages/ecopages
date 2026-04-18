import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { gotoAndWait, trackRuntimeErrors } from './helpers';

const SEO_INCLUDE_FILE = fileURLToPath(new URL('../src/includes/seo.kita.tsx', import.meta.url));
const SEO_SUFFIX = '[include-hmr]';

function patchSeoTitle(content: string, suffix: string) {
	return content.replace('<title safe>{title}</title>', `<title safe>{\`${'${title}'} ${suffix}\`}</title>`);
}

async function waitForViteClientConnection(page: Page) {
	const connected = page.waitForEvent('console', {
		predicate: (message: ConsoleMessage) => message.type() === 'debug' && message.text() === '[vite] connected.',
		timeout: 10000,
	});

	await connected;
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

	test('reloads the page when a shared include template changes', async ({ page }, testInfo) => {
		const runtime = trackRuntimeErrors(page);
		const waitsForViteReload = testInfo.project.name.includes('vite');
		const viteClientConnected = waitsForViteReload ? waitForViteClientConnection(page) : undefined;

		await gotoAndWait(page, '/docs');
		await viteClientConnected;
		const initialTitle = await page.title();
		const reloaded = waitsForViteReload
			? page.waitForEvent('framenavigated', {
					predicate: (frame) => frame === page.mainFrame(),
					timeout: 10000,
				})
			: undefined;

		fs.writeFileSync(SEO_INCLUDE_FILE, patchSeoTitle(originalSeoInclude, SEO_SUFFIX), 'utf-8');
		await reloaded;
		await expect(page).toHaveTitle(`${initialTitle} ${SEO_SUFFIX}`, { timeout: 10000 });

		runtime.assertClean();
	});
});
