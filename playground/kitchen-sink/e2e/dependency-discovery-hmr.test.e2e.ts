import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	assertNoMainFrameNavigationAfterHmr,
	HMR_MUTATION_ASSERT_TIMEOUT_MS,
	gotoPathSimple,
	installFullDocumentReloadWatcher,
	startEcopagesHmrConnectionWatch,
} from './test-support';

test('updates an imported React island component without a full reload @hmr', async ({ page }, testInfo) => {
	test.skip(!testInfo.project.name.endsWith('-node-e2e'), 'Node-only coverage while Bun support is being removed');
	const root = testInfo.project.metadata.isolatedAppDir;
	if (typeof root !== 'string') throw new Error('Dependency discovery HMR requires an isolated app');
	const componentFile = path.join(root, 'src/components/dependency-discovery/card.react.tsx');
	const originalComponent = readFileSync(componentFile, 'utf8');
	try {
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await installFullDocumentReloadWatcher(page);
		await gotoPathSimple(page, '/discovery-react');
		await hmrReady;
		await expect(page.getByRole('button', { name: 'Count 0' })).toBeVisible();

		writeFileSync(componentFile, originalComponent.replace('Count {count}', 'Updated Count {count}'));
		await expect(page.getByRole('button', { name: 'Updated Count 0' })).toBeVisible({
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		await assertNoMainFrameNavigationAfterHmr(page);
	} finally {
		writeFileSync(componentFile, originalComponent);
	}
});

test('invalidates discovered CSS after import addition, edit and removal @hmr', async ({ page }, testInfo) => {
	const root = testInfo.project.metadata.isolatedAppDir;
	if (typeof root !== 'string') throw new Error('Dependency discovery HMR requires an isolated app');
	const componentFile = path.join(root, 'src/components/dependency-discovery/counter.lit.tsx');
	const cssFile = path.join(root, 'src/components/dependency-discovery/hmr-extra.css');
	const originalComponent = readFileSync(componentFile, 'utf8');
	const originalCss = readFileSync(cssFile, 'utf8');
	const host = '.discovery-counter-host';
	try {
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await gotoPathSimple(page, '/discovery');
		await hmrReady;
		await expect(page.locator(host)).toHaveCSS('border-top-width', '7px');
		writeFileSync(componentFile, `${originalComponent}\nimport './hmr-extra.css';\n`);
		await expect(page.locator(host)).toHaveCSS('border-top-width', '11px', {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		writeFileSync(cssFile, originalCss.replace('11px', '13px'));
		await expect(page.locator(host)).toHaveCSS('border-top-width', '13px', {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		writeFileSync(componentFile, originalComponent);
		await expect(page.locator(host)).toHaveCSS('border-top-width', '7px', {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
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
	try {
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await gotoPathSimple(page, '/discovery-barrel');
		await hmrReady;
		await expect(page.locator(host)).toHaveCSS('border-top-width', '17px');
		writeFileSync(barrelFile, `export { BarrelWidget } from './widget-b.lit';\n`);
		await expect(page.locator(host)).toHaveCSS('border-top-width', '19px', {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		writeFileSync(barrelFile, originalBarrel);
		await expect(page.locator(host)).toHaveCSS('border-top-width', '17px', {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
	} finally {
		writeFileSync(barrelFile, originalBarrel);
	}
});
