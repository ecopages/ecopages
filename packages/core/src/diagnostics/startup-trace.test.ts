import { afterEach, describe, expect, it, vi } from 'vitest';
import { startupTrace } from './startup-trace.ts';

describe('startupTrace', () => {
	const originalTraceEnv = process.env.ECOPAGES_STARTUP_TRACE;
	const originalLoggerDebug = process.env.ECOPAGES_LOGGER_DEBUG;

	afterEach(() => {
		startupTrace.resetForTests();
		if (originalTraceEnv === undefined) {
			delete process.env.ECOPAGES_STARTUP_TRACE;
		} else {
			process.env.ECOPAGES_STARTUP_TRACE = originalTraceEnv;
		}
		if (originalLoggerDebug === undefined) {
			process.env.ECOPAGES_LOGGER_DEBUG = 'false';
		} else {
			process.env.ECOPAGES_LOGGER_DEBUG = originalLoggerDebug;
		}
		vi.restoreAllMocks();
	});

	it('is disabled unless ECOPAGES_STARTUP_TRACE or ECOPAGES_LOGGER_DEBUG is true', () => {
		process.env.ECOPAGES_STARTUP_TRACE = 'false';
		process.env.ECOPAGES_LOGGER_DEBUG = 'false';
		expect(startupTrace.isEnabled()).toBe(false);
	});

	it('enables when ECOPAGES_LOGGER_DEBUG is true', () => {
		process.env.ECOPAGES_LOGGER_DEBUG = 'true';
		expect(startupTrace.isEnabled()).toBe(true);
	});

	it('emits phase and first-request summary lines when ECOPAGES_STARTUP_TRACE is true', async () => {
		process.env.ECOPAGES_STARTUP_TRACE = 'true';
		process.env.ECOPAGES_LOGGER_DEBUG = 'false';

		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		startupTrace.markConfigReady();
		startupTrace.markPhaseStart('setupAppRuntimePlugins');
		startupTrace.markPhaseEnd('setupAppRuntimePlugins');

		await startupTrace.traceFirstRequest(new Request('http://localhost/docs/foo'), async () => 'ok');

		const output = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
		expect(output).toContain('phase=config-ready');
		expect(output).toContain('phase=setupAppRuntimePlugins');
		expect(output).toContain('phase=first-request-ssr');
		expect(output).toContain('summary path=/docs/foo bundleCount=0 clientBundleBytes=0');
	});
});
