import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { copyFixtureApp } from '../../__fixtures__/app/copy-fixture-app.ts';
import { createFixtureUserConfig } from '../../__fixtures__/app/fixture-user-config.ts';
import { createNodeServerAdapter } from '../adapters/node/server-adapter.ts';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { DEV_TOOLBAR_RUNTIME_IMPORT } from './dev-toolbar-runtime-paths.ts';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) {
		await cleanup();
	}
});

/** Renders the fixture home page through the Node request path with the dev toolbar configured. */
async function renderHome(options: { watch: boolean }): Promise<string> {
	const appDir = copyFixtureApp();
	cleanups.push(() => rmSync(appDir, { recursive: true, force: true }));

	const appConfig = await finalizeEcoPagesConfig(
		createFixtureUserConfig({ rootDir: appDir, devToolbar: { package: '@ecopages/dev-toolbar' } }),
	);
	for (const integration of appConfig.integrations) {
		integration.setConfig(appConfig);
		integration.setRuntimeOrigin('http://localhost:3000');
	}

	const adapter = await createNodeServerAdapter({
		appConfig,
		runtimeOrigin: 'http://localhost:3000',
		serveOptions: {},
		options,
	});
	cleanups.push(() => adapter.dispose());

	const response = await adapter.handleRequest(new Request('http://localhost:3000/'));
	expect(response.status).toBe(200);
	return await response.text();
}

describe('dev toolbar HTML', () => {
	it('loads the toolbar runtime at the end of a page rendered in watch mode', async () => {
		const html = await renderHome({ watch: true });

		expect(html).toContain(`<script type="module">${DEV_TOOLBAR_RUNTIME_IMPORT};</script></html>`);
		expect(html.split(DEV_TOOLBAR_RUNTIME_IMPORT)).toHaveLength(2);
	});

	it('leaves the toolbar runtime out of a page rendered without watch mode', async () => {
		const html = await renderHome({ watch: false });

		expect(html).not.toContain(DEV_TOOLBAR_RUNTIME_IMPORT);
	});
});
