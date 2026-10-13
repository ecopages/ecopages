import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadFreshStartupTrace() {
	vi.resetModules();
	return (await import('./startup-trace.ts')).startupTrace;
}

describe('startupTrace', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('is disabled unless ECOPAGES_STARTUP_TRACE or ECOPAGES_LOGGER_DEBUG is true', async () => {
		const startupTrace = await loadFreshStartupTrace();
		vi.stubEnv('ECOPAGES_STARTUP_TRACE', 'false');
		vi.stubEnv('ECOPAGES_LOGGER_DEBUG', 'false');
		expect(startupTrace.isEnabled()).toBe(false);
	});

	it('enables when ECOPAGES_LOGGER_DEBUG is true', async () => {
		const startupTrace = await loadFreshStartupTrace();
		vi.stubEnv('ECOPAGES_LOGGER_DEBUG', 'true');
		expect(startupTrace.isEnabled()).toBe(true);
	});

	it('emits phase and first-request summary lines when ECOPAGES_STARTUP_TRACE is true', async () => {
		vi.stubEnv('ECOPAGES_STARTUP_TRACE', 'true');
		vi.stubEnv('ECOPAGES_LOGGER_DEBUG', 'false');

		const startupTrace = await loadFreshStartupTrace();
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		startupTrace.markConfigReady();
		startupTrace.markPhaseStart('setupAppRuntimePlugins');
		startupTrace.markPhaseEnd('setupAppRuntimePlugins');

		await startupTrace.traceFirstRequest(new Request('http://localhost/docs/foo'), async () => 'ok');

		const output = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
		expect(output).toContain('phase=config-ready');
		expect(output).toContain('phase=setupAppRuntimePlugins');
		expect(output).toContain('phase=first-request-ssr');
		expect(output).toContain('summary path=/docs/foo bundleCount=0 clientBundleBytes=0 graphBuildCount=0');
	});
});
