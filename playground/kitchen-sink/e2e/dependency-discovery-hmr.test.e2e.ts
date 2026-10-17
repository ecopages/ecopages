import { expect, test } from '../../../e2e/app-fixture';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	assertNoMainFrameNavigationAfterHmr,
	HMR_FULL_RELOAD_ASSERT_TIMEOUT_MS,
	HMR_MUTATION_ASSERT_TIMEOUT_MS,
	gotoPathSimple,
	installFullDocumentReloadWatcher,
	startEcopagesHmrConnectionWatch,
} from './test-support';

function captureFailureDiagnostics(page: import('@playwright/test').Page, app: import('../../../e2e/app-fixture').App) {
	const events: string[] = [];
	const startedAt = Date.now();
	const record = (event: string, detail: string) => {
		events.push(`+${Date.now() - startedAt}ms ${event}: ${detail}`);
		if (events.length > 100) events.shift();
	};
	const isDocumentOrStyle = (request: import('@playwright/test').Request) =>
		request.isNavigationRequest() ||
		request.resourceType() === 'document' ||
		request.resourceType() === 'stylesheet';

	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning')
			record(`console ${message.type()}`, message.text());
	});
	page.on('pageerror', (error) => record('pageerror', error.stack ?? error.message));
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) record('main-frame navigation', frame.url());
	});
	page.on('request', (request) => {
		if (isDocumentOrStyle(request))
			record('request', `${request.method()} ${request.resourceType()} ${request.url()}`);
	});
	page.on('response', (response) => {
		const request = response.request();
		if (isDocumentOrStyle(request) || response.status() >= 400) {
			record('response', `${response.status()} ${request.resourceType()} ${request.url()}`);
		}
	});
	page.on('requestfailed', (request) => {
		record('request failed', `${request.resourceType()} ${request.url()} ${request.failure()?.errorText ?? ''}`);
	});
	page.on('websocket', (socket) => {
		record('websocket opened', socket.url());
		socket.on('framereceived', (frame) => record('websocket received', String(frame.payload).slice(0, 500)));
		socket.on('framesent', (frame) => record('websocket sent', String(frame.payload).slice(0, 500)));
		socket.on('close', () => record('websocket closed', socket.url()));
	});

	return {
		mark: (label: string) => record('checkpoint', label),
		reportFailure: (error: unknown) => {
			console.error(
				[
					`HMR failure diagnostics: ${String(error)}`,
					'Browser events:',
					...events,
					'Dev server output:',
					app.getServerOutput(),
				].join('\n'),
			);
		},
	};
}

test('updates an imported React island component without a full reload @hmr', async ({ page, app }) => {
	const componentFile = path.join(app.dir, 'src/components/dependency-discovery/card.react.tsx');
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

test('invalidates discovered CSS after import addition, edit and removal @hmr', async ({ page, app }) => {
	test.setTimeout(210_000);
	const componentFile = path.join(app.dir, 'src/components/dependency-discovery/counter.lit.tsx');
	const cssFile = path.join(app.dir, 'src/components/dependency-discovery/hmr-extra.css');
	const originalComponent = readFileSync(componentFile, 'utf8');
	const originalCss = readFileSync(cssFile, 'utf8');
	const host = '.discovery-counter-host';
	const diagnostics = captureFailureDiagnostics(page, app);
	try {
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await gotoPathSimple(page, '/discovery');
		await hmrReady;
		await expect(page.locator(host)).toHaveCSS('border-top-width', '7px');
		diagnostics.mark('adding CSS import');
		writeFileSync(componentFile, `${originalComponent}\nimport './hmr-extra.css';\n`);
		await expect(page.locator(host)).toHaveCSS('border-top-width', '11px', {
			timeout: HMR_FULL_RELOAD_ASSERT_TIMEOUT_MS,
		});
		diagnostics.mark('editing imported CSS');
		writeFileSync(cssFile, originalCss.replace('11px', '13px'));
		await expect(page.locator(host)).toHaveCSS('border-top-width', '13px', {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		diagnostics.mark('removing CSS import');
		writeFileSync(componentFile, originalComponent);
		await expect(page.locator(host)).toHaveCSS('border-top-width', '7px', {
			timeout: HMR_FULL_RELOAD_ASSERT_TIMEOUT_MS,
		});
	} catch (error) {
		diagnostics.reportFailure(error);
		throw error;
	} finally {
		writeFileSync(componentFile, originalComponent);
		writeFileSync(cssFile, originalCss);
	}
});

test('invalidates discovered CSS after a live barrel retarget without editing the page @hmr', async ({ page, app }) => {
	test.setTimeout(210_000);
	const barrelFile = path.join(app.dir, 'src/components/dependency-discovery/barrel/index.ts');
	const originalBarrel = readFileSync(barrelFile, 'utf8');
	const host = '.discovery-barrel-host';
	const diagnostics = captureFailureDiagnostics(page, app);
	try {
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await gotoPathSimple(page, '/discovery-barrel');
		await hmrReady;
		await expect(page.locator(host)).toHaveCSS('border-top-width', '17px');
		diagnostics.mark('retargeting barrel');
		writeFileSync(barrelFile, `export { BarrelWidget } from './widget-b.lit';\n`);
		await expect(page.locator(host)).toHaveCSS('border-top-width', '19px', {
			timeout: HMR_FULL_RELOAD_ASSERT_TIMEOUT_MS,
		});
		writeFileSync(barrelFile, originalBarrel);
		await expect(page.locator(host)).toHaveCSS('border-top-width', '17px', {
			timeout: HMR_FULL_RELOAD_ASSERT_TIMEOUT_MS,
		});
	} catch (error) {
		diagnostics.reportFailure(error);
		throw error;
	} finally {
		writeFileSync(barrelFile, originalBarrel);
	}
});
