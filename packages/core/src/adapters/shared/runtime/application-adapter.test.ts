import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import { ECOPAGES_DEV_RESTART_EXIT_CODE } from '../../../dev/development-restart.ts';
import { appLogger } from '../../../global/app-logger.ts';
import type { ApplicationAdapterOptions } from '../../abstract/application-adapter.ts';
import { SharedApplicationAdapter } from './application-adapter.ts';

class TestRestartFailureAdapter extends SharedApplicationAdapter<ApplicationAdapterOptions, unknown, Request> {
	constructor(private readonly stopError: unknown) {
		super({ appConfig: { runtime: {} } as ApplicationAdapterOptions['appConfig'] }, 'Node');
	}

	public getDevelopmentRestartHandlerForTest(): ((changedFile: string) => Promise<void>) | undefined {
		return this.createDevelopmentRestartHandler();
	}

	public override async stop(): Promise<void> {
		throw this.stopError;
	}

	protected async initializeServerAdapter(): Promise<void> {}

	protected async bootServer(): Promise<void> {}

	public async fetch(_request: Request): Promise<Response> {
		return new Response(null, { status: 204 });
	}
}

describe('development server restart', () => {
	it('logs the stop stack and still exits for a restart when shutdown rejects', async () => {
		const nestedError = new Error('nested cleanup failed');
		const stopError = new AggregateError([nestedError, { code: 'E_RESOURCE_CLEANUP' }], 'stop failed');
		const adapter = new TestRestartFailureAdapter(stopError);
		const errorArguments: unknown[][] = [];
		const errorLog = vi.spyOn(appLogger, 'error').mockImplementation((...args) => {
			errorArguments.push(args);
			return appLogger;
		});
		const processExit = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
			throw new Error(`process.exit:${code}`);
		});

		try {
			const restart = adapter.getDevelopmentRestartHandlerForTest();
			assert.ok(restart);
			await assert.rejects(
				restart('/src/lib/posts.ts'),
				new RegExp(`process\\.exit:${ECOPAGES_DEV_RESTART_EXIT_CODE}`),
			);
			assert.ok(stopError.stack);
			assert.ok(
				errorArguments
					.flat()
					.some(
						(argument) =>
							typeof argument === 'string' &&
							argument.includes(stopError.stack ?? '') &&
							argument.includes(nestedError.stack ?? '') &&
							argument.includes('{"code":"E_RESOURCE_CLEANUP"}'),
					),
			);
			assert.equal(processExit.mock.calls[0]?.[0], ECOPAGES_DEV_RESTART_EXIT_CODE);
		} finally {
			errorLog.mockRestore();
			processExit.mockRestore();
		}
	});

	it('logs the cause chain of a wrapped shutdown error', async () => {
		const rootCause = new Error('worker pool did not exit');
		const adapter = new TestRestartFailureAdapter(new Error('integration teardown failed', { cause: rootCause }));
		const logged: string[] = [];
		const errorLog = vi.spyOn(appLogger, 'error').mockImplementation((...args) => {
			logged.push(...args.filter((argument): argument is string => typeof argument === 'string'));
			return appLogger;
		});
		const processExit = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
			throw new Error(`process.exit:${code}`);
		});

		try {
			const restart = adapter.getDevelopmentRestartHandlerForTest();
			assert.ok(restart);
			await assert.rejects(
				restart('/src/lib/posts.ts'),
				new RegExp(`process\\.exit:${ECOPAGES_DEV_RESTART_EXIT_CODE}`),
			);
			assert.ok(logged.some((message) => message.includes(`Caused by: ${rootCause.stack}`)));
		} finally {
			errorLog.mockRestore();
			processExit.mockRestore();
		}
	});
});
