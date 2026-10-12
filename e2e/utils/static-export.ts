import type { AddressInfo } from 'node:net';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { createApp } from '../../packages/core/src/adapters/create-app.ts';
import { NodeEcopagesApp } from '../../packages/core/src/adapters/node/create-app.ts';
import { NodeStaticContentServer } from '../../packages/core/src/adapters/node/static-content-server.ts';
import { loadEcoPagesConfig } from '../../packages/core/src/config/load-eco-config.ts';
import { copyFixtureApp } from '../../packages/core/__fixtures__/app/copy-fixture-app.ts';

export type StaticExport = {
	/** Origin of a preview server that serves the exported files. */
	origin: string;
	/** The fixture app, still able to render a Page on request with `app.fetch()`. */
	app: NodeEcopagesApp;
	/** Stops the servers and removes the private copy of the fixture. */
	stop: () => Promise<void>;
};

/**
 * Builds the static export of an e2e fixture app in this process and serves it on a free port.
 *
 * @remarks
 * The export is built from a private copy with `NODE_ENV=production`, the same pipeline as `ecopages build`,
 * so a suite can assert on exported HTML without a browser, a spawned CLI or a fixed port. The app creates its
 * server adapter on the first request, so one request runs before the export. Call
 * `vi.unstubAllEnvs()` after `stop()` to restore `NODE_ENV`.
 */
export async function startStaticExport(fixtureDir: string): Promise<StaticExport> {
	vi.stubEnv('NODE_ENV', 'production');
	const appDir = copyFixtureApp(fixtureDir);
	const configFile = path.join(appDir, 'eco.config.ts');

	const app = await createApp({ configFile });
	if (!(app instanceof NodeEcopagesApp)) {
		throw new Error('Expected the Node host');
	}
	await app.fetch(new Request('http://localhost:3000/'));
	await app.serverAdapter!.buildStatic();

	const preview = new NodeStaticContentServer({
		appConfig: await loadEcoPagesConfig({ cwd: appDir, configFile }),
		options: { hostname: '127.0.0.1', port: 0 },
	});
	const { port } = (await preview.start()).address() as AddressInfo;

	return {
		origin: `http://127.0.0.1:${port}`,
		app,
		stop: async () => {
			await preview.stop();
			await app.stop();
			rmSync(appDir, { recursive: true, force: true });
		},
	};
}
