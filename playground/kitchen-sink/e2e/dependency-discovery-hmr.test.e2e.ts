import { expect, test } from '@playwright/test';
import type { Page } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { HMR_MUTATION_ASSERT_TIMEOUT_MS, gotoPathSimple } from './test-support';

async function readHostBorder(page: Page, hostSelector: string): Promise<string> {
	return page.locator(hostSelector).evaluate((element) => getComputedStyle(element).borderTopWidth);
}

/**
 * Source mutations run only in the existing isolated HMR fixture.
 *
 * @remarks
 * The first assertion is one document load. Polling `goto` aborted in-flight CSS
 * compiles and never observed the prewarmed stylesheet.
 */
test('invalidates discovered CSS after import addition, edit and removal @hmr', async ({ page }, testInfo) => {
	const root = testInfo.project.metadata.isolatedAppDir;
	if (typeof root !== 'string') throw new Error('Dependency discovery HMR requires an isolated app');
	const componentFile = path.join(root, 'src/components/dependency-discovery/counter.lit.tsx');
	const cssFile = path.join(root, 'src/components/dependency-discovery/hmr-extra.css');
	const originalComponent = readFileSync(componentFile, 'utf8');
	const originalCss = readFileSync(cssFile, 'utf8');
	const host = '.discovery-counter-host';
	const assertBorderAfterReload = async (width: string) => {
		await expect
			.poll(
				async () => {
					try {
						await page.reload({ waitUntil: 'domcontentloaded' });
						return await readHostBorder(page, host);
					} catch (error) {
						if (error instanceof Error && /ERR_ABORTED|Execution context was destroyed/.test(error.message))
							return 'navigation-in-progress';
						throw error;
					}
				},
				{ timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS, intervals: [400, 800, 1_200] },
			)
			.toBe(width);
	};
	try {
		await gotoPathSimple(page, '/discovery');
		await expect(page.locator(host)).toHaveCSS('border-top-width', '7px');
		writeFileSync(componentFile, `${originalComponent}\nimport './hmr-extra.css';\n`);
		await assertBorderAfterReload('11px');
		writeFileSync(cssFile, originalCss.replace('11px', '13px'));
		await assertBorderAfterReload('13px');
		writeFileSync(componentFile, originalComponent);
		await assertBorderAfterReload('7px');
	} finally {
		writeFileSync(componentFile, originalComponent);
		writeFileSync(cssFile, originalCss);
	}
});

test('invalidates discovered CSS after a live barrel retarget without editing the page @hmr', async ({
	page,
}, testInfo) => {
	const root = testInfo.project.metadata.isolatedAppDir;
	if (typeof root !== 'string') throw new Error('Dependency discovery HMR requires an isolated app');
	const barrelFile = path.join(root, 'src/components/dependency-discovery/barrel/index.ts');
	const originalBarrel = readFileSync(barrelFile, 'utf8');
	const host = '.discovery-barrel-host';
	const assertBorderAfterReload = async (width: string) => {
		await expect
			.poll(
				async () => {
					try {
						await page.reload({ waitUntil: 'domcontentloaded' });
						return await readHostBorder(page, host);
					} catch (error) {
						if (error instanceof Error && /ERR_ABORTED|Execution context was destroyed/.test(error.message))
							return 'navigation-in-progress';
						throw error;
					}
				},
				{ timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS, intervals: [400, 800, 1_200] },
			)
			.toBe(width);
	};
	try {
		await gotoPathSimple(page, '/discovery-barrel');
		await expect(page.locator(host)).toHaveCSS('border-top-width', '17px');
		writeFileSync(barrelFile, `export { BarrelWidget } from './widget-b.lit';\n`);
		await assertBorderAfterReload('19px');
		writeFileSync(barrelFile, originalBarrel);
		await assertBorderAfterReload('17px');
	} finally {
		writeFileSync(barrelFile, originalBarrel);
	}
});
