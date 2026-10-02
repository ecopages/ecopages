import { afterEach, describe, expect, it, vi } from 'vitest';
import { Processor } from '../plugins/processor.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { createApp } from './create-app.ts';
import { BunEcopagesApp } from './bun/create-app.ts';
import { NodeEcopagesApp } from './node/create-app.ts';

describe('createApp', () => {
	const originalArgv = [...process.argv];

	afterEach(() => {
		process.argv = [...originalArgv];
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it('exits after finalizing the config under ecopages types, before creating the runtime app', async () => {
		process.argv = ['node', '/app/app.ts', '--types'];
		vi.stubEnv('NODE_ENV', 'test');
		const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
			throw new Error(`process.exit:${code}`);
		}) as never);
		const contexts: unknown[] = [];
		const processor = new (class extends Processor {
			buildPlugins = [];
			plugins = [];
			override setContext(config: EcoPagesAppConfig): void {
				contexts.push(config);
			}
			override async setup(): Promise<void> {}
			override async teardown(): Promise<void> {}
			override async process(): Promise<unknown> {
				return undefined;
			}
		})({ name: 'records-finalization' });

		await expect(createApp({ userConfig: { rootDir: '/project', processors: [processor] } })).rejects.toThrow(
			'process.exit:0',
		);
		expect(exit).toHaveBeenCalledWith(0);
		expect(contexts).toHaveLength(1);
	});

	it('leaves NODE_ENV alone for an embedded runtime, as the adapter does', async () => {
		process.argv = ['node', '/app/vite.js'];
		vi.stubEnv('NODE_ENV', 'development');

		await using app = await createApp({ appConfig: {} as never, adapter: 'node', runtime: { embedded: true } });

		expect(app).toBeInstanceOf(NodeEcopagesApp);
		expect(process.env.NODE_ENV).toBe('development');
	});

	it('falls back to Node adapter when Bun is not available', async () => {
		await using app = await createApp({ appConfig: {} as never });
		expect(app).toBeDefined();
		expect(typeof app.fetch).toBe('function');
	});

	it('uses the Node adapter when explicitly requested', async () => {
		await using app = await createApp({ appConfig: {} as never, adapter: 'node' });
		expect(app).toBeInstanceOf(NodeEcopagesApp);
	});

	it('uses the Bun adapter when explicitly requested', async () => {
		await using app = await createApp({ appConfig: {} as never, adapter: 'bun' });
		expect(app).toBeInstanceOf(BunEcopagesApp);
	});
});
