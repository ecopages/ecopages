import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture';
import { assertAllCountersInteractivity, gotoPathSimple } from './helpers';

test("A package's own dependencies resolve in the dev vendor graph", async ({ page, app }) => {
	expect(existsSync(path.join(app.dir, '.eco', 'dev-vendor-entries.json')), 'the dev cache is not fresh').toBe(false);
	const failedModules: string[] = [];
	page.on('response', (response) => {
		if (response.request().resourceType() === 'script' && response.status() >= 400) {
			failedModules.push(`${response.status()} ${response.url()}`);
		}
	});

	const hydrateSupport = page.waitForResponse((response) =>
		new URL(response.url()).pathname.endsWith('/packages/integrations/lit/src/lit-hydrate-support.js'),
	);
	await gotoPathSimple(page, '/integration-matrix/lit-entry');

	expect((await hydrateSupport).status(), app.getServerOutput()).toBe(200);
	await expect
		.poll(() =>
			page.evaluate(() => typeof (globalThis as { litElementHydrateSupport?: unknown }).litElementHydrateSupport),
		)
		.toBe('function');
	await assertAllCountersInteractivity(page.getByTestId('integration-matrix-lit-counters'));
	expect(failedModules, app.getServerOutput()).toEqual([]);
});
