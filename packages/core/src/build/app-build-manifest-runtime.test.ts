import { expect, test, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import type { GlobalScriptResolution } from '../config/assembly/app-runtime.ts';
import { HtmlPagesPlugin } from '../html-pages/html-pages.plugin.ts';
import {
	ensureIntegrationRuntimeReady,
	resolveIntegrationDependencies,
	setupAppRuntimeIntegrations,
	teardownAppRuntimeIntegrations,
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

test('an activation after the browser build resolves global scripts again, as an app.fetch() after a build needs', async () => {
	const { appConfig, integration, events } = await createApp('browser-build');

	await ensureIntegrationRuntimeReady({ appConfig, integrationName: integration.name });
	await resolveIntegrationDependencies({ appConfig });
	await teardownAppRuntimeIntegrations({ appConfig });
	events.length = 0;

	await ensureIntegrationRuntimeReady({ appConfig, integrationName: integration.name });

	expect(events).toEqual(['setup', 'resolve']);
});

test('the global script of an Integration is back in its resolved list when it activates after the build', async () => {
	const { IntegrationPlugin } = await import('../plugins/integration-plugin.ts');
	const { IntegrationRenderer } = await import('../route-renderer/orchestration/integration-renderer.ts');
	const { AssetProcessingService } = await import('../assets/asset-processing-service/asset-processing.service.ts');
	class Renderer extends IntegrationRenderer {
		declare name: string;
		override async render() {
			return '';
		}
	}
	class GlobalScriptPlugin extends IntegrationPlugin {
		renderer = Renderer;
	}
	const script = { kind: 'script' as const, content: 'globalThis.x = 1;', inline: true };
	vi.spyOn(AssetProcessingService.prototype, 'processDependencies').mockResolvedValue([script]);
	const plugin = new GlobalScriptPlugin({ name: 'global-script', extensions: ['.gs'] });
	const appConfig = await finalizeEcoPagesConfig(
		{ rootDir: '/project', integrations: [plugin] },
		{ globalScriptResolution: 'browser-build' },
	);

	await setupAppRuntimeIntegrations({ appConfig });
	await resolveIntegrationDependencies({ appConfig });
	await teardownAppRuntimeIntegrations({ appConfig });
	expect(plugin.getResolvedIntegrationDependencies()).toEqual([script]);

	await setupAppRuntimeIntegrations({ appConfig });
	expect(plugin.getResolvedIntegrationDependencies()).toEqual([script]);
});
