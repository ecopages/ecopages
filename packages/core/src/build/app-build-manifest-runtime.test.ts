import { expect, test, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import type { GlobalScriptResolution } from '../config/assembly/app-runtime.ts';
import { HtmlPagesPlugin } from '../html-pages/html-pages.plugin.ts';
import {
	ensureIntegrationRuntimeReady,
	resolveIntegrationDependencies,
	setupAppRuntimeIntegrations,
} from './app-build-manifest-runtime.ts';

async function createApp(globalScriptResolution?: GlobalScriptResolution) {
	const integration = new HtmlPagesPlugin();
	const events: string[] = [];
	vi.spyOn(integration, 'setup').mockImplementation(async () => {
		events.push('setup');
	});
	vi.spyOn(integration, 'refreshResolvedIntegrationDependencies').mockImplementation(async () => {
		events.push('resolve');
	});
	const appConfig = await finalizeEcoPagesConfig(
		{ rootDir: '/project', integrations: [integration] },
		{ globalScriptResolution },
	);
	return { appConfig, integration, events };
}

test('activation resolves global scripts once, after setup, however many callers join it', async () => {
	const { appConfig, integration, events } = await createApp();

	await Promise.all([
		setupAppRuntimeIntegrations({ appConfig }),
		ensureIntegrationRuntimeReady({ appConfig, integrationName: integration.name }),
	]);
	await ensureIntegrationRuntimeReady({ appConfig, integrationName: integration.name });

	expect(events).toEqual(['setup', 'resolve']);
});

test('a browser-build runtime leaves global scripts to resolveIntegrationDependencies, whichever caller activates first', async () => {
	const { appConfig, integration, events } = await createApp('browser-build');

	await ensureIntegrationRuntimeReady({ appConfig, integrationName: integration.name });
	await setupAppRuntimeIntegrations({ appConfig });
	expect(events).toEqual(['setup']);

	await resolveIntegrationDependencies({ appConfig });
	expect(events).toEqual(['setup', 'resolve']);
});

test('the runtime resolves at activation unless the process runs a production export', async () => {
	const argv = process.argv;
	try {
		process.argv = ['node', '/project/app.ts'];
		expect((await createApp()).appConfig.appRuntime?.globalScriptResolution).toBe('activation');
		process.argv = ['node', '/project/app.ts', '--build'];
		expect((await createApp()).appConfig.appRuntime?.globalScriptResolution).toBe('browser-build');
	} finally {
		process.argv = argv;
	}
});

test('resolveIntegrationDependencies rejects a runtime that resolves at activation', async () => {
	const { appConfig, events } = await createApp('activation');

	await expect(resolveIntegrationDependencies({ appConfig })).rejects.toThrow(/'browser-build'/);
	expect(events).toEqual([]);
});
