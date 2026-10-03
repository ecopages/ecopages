import type { Server } from 'bun';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReturnParseCliArgs } from '../../utils/parse-cli-args.ts';
import type { RuntimeHost } from '../shared/runtime/runtime-host.ts';
import { BunEcopagesApp } from './create-app.ts';
import type { BunServerAdapterResult } from './server-adapter.ts';

class TestBunEcopagesApp extends BunEcopagesApp {
	public readonly getServerOptions = vi.fn(() => ({}));

	public async bootWith(cliArgs: Partial<ReturnParseCliArgs>): Promise<void> {
		this.cliArgs = {
			preview: false,
			build: false,
			start: false,
			dev: false,
			force: false,
			serveOnly: false,
			...cliArgs,
		};
		await this.bootServer();
	}

	protected override async initializeServerAdapter(): Promise<BunServerAdapterResult> {
		return {
			getServerOptions: this.getServerOptions,
			applyBoundPort: () => {},
			completeInitialization: async () => {},
			dispose: async () => {},
		} as unknown as BunServerAdapterResult;
	}
}

function createApp() {
	const runtimeHost: RuntimeHost<Server<undefined>, Bun.Serve.Options<undefined>> = {
		start: async () => ({}) as Server<undefined>,
		stop: async () => {},
		getOrigin: () => 'http://localhost:3000',
	};
	return new TestBunEcopagesApp({ appConfig: { runtime: {} } as never }, { runtimeHost });
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('BunEcopagesApp.bootServer', () => {
	it('serves production start without HMR endpoints or Bun development mode', async () => {
		const app = createApp();

		await app.bootWith({ start: true });

		expect(app.getServerOptions).toHaveBeenCalledWith({ enableHmr: false });
	});

	it('enables HMR endpoints in dev', async () => {
		const app = createApp();

		await app.bootWith({ dev: true });

		expect(app.getServerOptions).toHaveBeenCalledWith({ enableHmr: true });
	});
});
