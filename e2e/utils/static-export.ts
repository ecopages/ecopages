import { rmSync } from 'node:fs';
import { vi } from 'vitest';
import { createApp, type EcopagesApp } from '../../packages/core/src/adapters/create-app.ts';
import { copyFixtureApp } from '../../packages/core/__fixtures__/app/copy-fixture-app.ts';
import { emitCopiedFixtureServerModules } from './emit-copied-fixture-server-modules.ts';

export type StaticExport = {
	/** Origin of a preview server that serves the exported files. */
	origin: string;
	/** The fixture app, still able to render a Page on request with `app.fetch()`. */
	app: EcopagesApp;
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
	const appConfig = await emitCopiedFixtureServerModules(appDir);

	const app = await createApp({ appConfig, serverOptions: { hostname: '127.0.0.1', port: 0 } });
	await app.fetch(new Request('http://localhost:3000/'));
	await app.serverAdapter!.buildStatic();
	const origin = await app.serverAdapter!.servePreviewOnly();
	if (!origin) throw new Error('Expected the static preview server to bind');

	return {
		origin,
		app,
		stop: async () => {
			await app.stop();
			rmSync(appDir, { recursive: true, force: true });
		},
	};
}
