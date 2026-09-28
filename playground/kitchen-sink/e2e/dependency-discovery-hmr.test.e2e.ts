import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Source mutations run only in the existing isolated HMR fixture. */
test('invalidates discovered CSS after import addition, edit and removal @hmr', async ({ page }, testInfo) => {
	const root = testInfo.project.metadata.isolatedAppDir;
	if (typeof root !== 'string') throw new Error('Dependency discovery HMR requires an isolated app');
	const componentFile = path.join(root, 'src/components/dependency-discovery/counter.lit.tsx');
	const cssFile = path.join(root, 'src/components/dependency-discovery/hmr-extra.css');
	const originalComponent = readFileSync(componentFile, 'utf8');
	const originalCss = readFileSync(cssFile, 'utf8');
	const assertBorder = async (width: string) => {
		await expect
			.poll(
				async () => {
					try {
						await page.goto('/discovery');
						return await page
							.locator('.discovery-counter-host')
							.evaluate((element) => getComputedStyle(element).borderTopWidth);
					} catch (error) {
						if (error instanceof Error && /ERR_ABORTED|Execution context was destroyed/.test(error.message))
							return 'navigation-in-progress';
						throw error;
					}
				},
				{ timeout: 30_000 },
			)
			.toBe(width);
	};
	try {
		await assertBorder('7px');
		writeFileSync(componentFile, `${originalComponent}\nimport './hmr-extra.css';\n`);
		await assertBorder('11px');
		writeFileSync(cssFile, originalCss.replace('11px', '13px'));
		await assertBorder('13px');
		writeFileSync(componentFile, originalComponent);
		await assertBorder('7px');
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
	const assertBorder = async (width: string) => {
		await expect
			.poll(
				async () => {
					try {
						await page.goto('/discovery-barrel');
						return await page
							.locator('.discovery-barrel-host')
							.evaluate((element) => getComputedStyle(element).borderTopWidth);
					} catch (error) {
						if (error instanceof Error && /ERR_ABORTED|Execution context was destroyed/.test(error.message))
							return 'navigation-in-progress';
						throw error;
					}
				},
				{ timeout: 30_000 },
			)
			.toBe(width);
	};
	try {
		await assertBorder('17px');
		writeFileSync(barrelFile, `export { BarrelWidget } from './widget-b.lit';\n`);
		await assertBorder('19px');
		writeFileSync(barrelFile, originalBarrel);
		await assertBorder('17px');
	} finally {
		writeFileSync(barrelFile, originalBarrel);
	}
});
