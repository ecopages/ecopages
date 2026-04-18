import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { gotoAndWait, trackRuntimeErrors } from './helpers';

const SEO_INCLUDE_FILE = fileURLToPath(new URL('../src/includes/seo.kita.tsx', import.meta.url));
const SEO_SUFFIX = '[include-hmr]';

function getSeoIncludeFile(projectMetadata: Record<string, unknown> | undefined) {
	const isolatedAppDir = typeof projectMetadata?.isolatedAppDir === 'string' ? projectMetadata.isolatedAppDir : null;

	if (!isolatedAppDir) {
		return SEO_INCLUDE_FILE;
	}

	return path.join(isolatedAppDir, 'src/includes/seo.kita.tsx');
}

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
	let seoIncludeFile = SEO_INCLUDE_FILE;

	test.describe.configure({ mode: 'serial' });

	test.beforeAll(async ({}, testInfo) => {
		seoIncludeFile = getSeoIncludeFile(testInfo.project.metadata as Record<string, unknown> | undefined);
		originalSeoInclude = fs.readFileSync(seoIncludeFile, 'utf-8');
	});

	test.afterAll(() => {
		fs.writeFileSync(seoIncludeFile, originalSeoInclude, 'utf-8');
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

		fs.writeFileSync(seoIncludeFile, patchSeoTitle(originalSeoInclude, SEO_SUFFIX), 'utf-8');
		await reloaded;
		await expect(page).toHaveTitle(`${initialTitle} ${SEO_SUFFIX}`, { timeout: 10000 });

		runtime.assertClean();
	});
});
