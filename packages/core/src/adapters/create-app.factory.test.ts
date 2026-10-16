import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReturnParseCliArgs } from '../utils/parse-cli-args.ts';

afterEach(() => {
	vi.doUnmock('../utils/parse-cli-args.ts');
	vi.doUnmock('./node/create-app.ts');
	vi.resetModules();
});

describe('createApp initialization', () => {
	it('resolves command-line options once and passes them to the concrete app factory', async () => {
		const cliArgs: ReturnParseCliArgs = {
			preview: true,
			build: false,
			start: false,
			dev: false,
			serveOnly: true,
			port: 4200,
			hostname: '127.0.0.1',
		};
		const laterCliArgs: ReturnParseCliArgs = {
			...cliArgs,
			preview: false,
			serveOnly: false,
			start: true,
		};
		const parseCliArgs = vi.fn().mockReturnValueOnce(cliArgs).mockReturnValue(laterCliArgs);
		const createdApp = { created: true };
		const createNodeApp = vi.fn().mockReturnValue(createdApp);
		vi.doMock('../utils/parse-cli-args.ts', () => ({ parseCliArgs }));
		vi.doMock('./node/create-app.ts', () => ({
			createNodeApp,
			EcopagesApp: class EcopagesApp {},
		}));
		vi.resetModules();

		const { createApp } = await import('./create-app.ts');
		const appConfig = { marker: 'app-config' };
		const serverOptions = { port: 4300 };
		const app = await createApp({ appConfig: appConfig as never, serverOptions });

		expect(parseCliArgs).toHaveBeenCalledOnce();
		expect(createNodeApp).toHaveBeenCalledOnce();
		expect(createNodeApp).toHaveBeenCalledWith({ appConfig, serverOptions, cliArgs });
		expect(app).toBe(createdApp);
	});
});
