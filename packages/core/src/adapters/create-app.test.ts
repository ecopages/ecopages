import fs from 'node:fs';
import type { Server as NodeHttpServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { requireAppRuntime } from '../config/app-runtime.ts';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { eco } from '../eco/eco.ts';
import { defineIntegration } from '../plugins/define-integration.ts';
import { StringMarkupRenderer } from '../route-renderer/orchestration/string-markup-renderer.ts';
import { ProjectWatcher } from '../watchers/project-watcher.ts';
import { createApp } from './create-app.ts';
import { EcopagesApp } from './node/create-app.ts';
import type { NodeRuntimeServeOptions } from './node/runtime-host.ts';
import type { RuntimeHost } from './shared/runtime/runtime-host.ts';
import { parseCliArgs } from '../utils/parse-cli-args.ts';

describe('createApp', () => {
	it('creates the Node host', async () => {
		await using app = await createApp({ appConfig: {} as never });
		expect(app).toBeInstanceOf(EcopagesApp);
		expect(typeof app.fetch).toBe('function');
	});

	it('reaches every renderer with http://localhost:3001 when port 3000 is busy and dev falls back to port 3001', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-fallback-origin-'));
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });
		fs.writeFileSync(
			path.join(pagesDir, 'index.first.ts'),
			[
				'export default Object.assign(',
				'	({ origin }: { origin: string }) => `<p id="first-origin">${origin}</p>`,',
				'	{',
				'		config: { integration: "first-renderer" },',
				'		staticProps: async ({ runtimeOrigin }: { runtimeOrigin: string }) => ({',
				'			props: { origin: runtimeOrigin },',
				'		}),',
				'	},',
				');',
			].join('\n'),
			'utf8',
		);

		const previousArgv = [...process.argv];
		process.argv = [...previousArgv.filter((arg) => arg !== '--build' && arg !== '--preview'), '--dev'];
		vi.spyOn(ProjectWatcher.prototype, 'createWatcherSubscription').mockResolvedValue(undefined as never);

		class FirstRenderer extends StringMarkupRenderer {
			name = 'first-renderer';
			override async getHtmlTemplate() {
				return ({ children }: { children?: unknown }) =>
					`<!DOCTYPE html><html><body>${String(children ?? '')}</body></html>`;
			}
		}
		class SecondRenderer extends StringMarkupRenderer {
			name = 'second-renderer';
			override async getHtmlTemplate() {
				return ({ children }: { children?: unknown }) =>
					`<!DOCTYPE html><html><body>${String(children ?? '')}</body></html>`;
			}
		}
		const firstIntegration = defineIntegration({
			name: 'first-renderer',
			extensions: ['.first.ts'],
			renderer: FirstRenderer,
		})();
		const secondIntegration = defineIntegration({
			name: 'second-renderer',
			extensions: ['.second.ts'],
			renderer: SecondRenderer,
		})();
		const appConfig = await finalizeEcoPagesConfig({
			rootDir,
			integrations: [firstIntegration, secondIntegration],
		});
		const collision = Object.assign(new Error('listen EADDRINUSE: address already in use :::3000'), {
			code: 'EADDRINUSE',
		});
		const runtimeHost: RuntimeHost<NodeHttpServer, NodeRuntimeServeOptions> = {
			start: vi.fn(async ({ serveOptions }) => {
				if (Number(serveOptions.port) === 3000) {
					throw collision;
				}
				return {
					on: vi.fn(),
					off: vi.fn(),
				} as unknown as NodeHttpServer;
			}),
			stop: vi.fn(async () => {}),
			getOrigin: vi.fn((_server, serveOptions) => {
				return `http://${serveOptions.hostname ?? 'localhost'}:${serveOptions.port}`;
			}),
		};

		const app = new EcopagesApp(
			{
				appConfig,
				cliArgs: parseCliArgs(),
			},
			{ runtimeHost },
		);

		const explicitPage = eco.page<{ origin: string }>({
			integration: 'second-renderer',
			staticProps: async ({ runtimeOrigin }) => ({ props: { origin: runtimeOrigin } }),
			render: ({ origin }) => `<p id="second-origin">${origin}</p>`,
		});
		app.static('/explicit', async () => ({ default: explicitPage }));

		try {
			await app.start();

			expect(requireAppRuntime(appConfig).origin).toBe('http://localhost:3001');

			const fsResponse = await app.fetch(new Request('http://localhost:3001/'));
			expect(fsResponse.status).toBe(200);
			expect(await fsResponse.text()).toContain('<p id="first-origin">http://localhost:3001</p>');

			const explicitResponse = await app.fetch(new Request('http://localhost:3001/explicit'));
			expect(explicitResponse.status).toBe(200);
			expect(await explicitResponse.text()).toContain('<p id="second-origin">http://localhost:3001</p>');
		} finally {
			await app.stop();
			process.argv = previousArgv;
			vi.restoreAllMocks();
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
