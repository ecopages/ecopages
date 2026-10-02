import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './create-app.ts';
import { BunEcopagesApp } from './bun/create-app.ts';
import { NodeEcopagesApp } from './node/create-app.ts';

describe('createApp', () => {
	const originalArgv = [...process.argv];

	afterEach(() => {
		process.argv = [...originalArgv];
		vi.restoreAllMocks();
	});

	it('exits after finalizing the config under ecopages types, before creating the runtime app', async () => {
		process.argv = ['node', '/app/app.ts', '--types'];
		const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
			throw new Error(`process.exit:${code}`);
		}) as never);

		await expect(createApp({ appConfig: {} as never })).rejects.toThrow('process.exit:0');
		expect(exit).toHaveBeenCalledWith(0);
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
