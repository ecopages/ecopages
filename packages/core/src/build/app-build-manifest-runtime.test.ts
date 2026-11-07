import { expect, test, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import { HtmlPagesPlugin } from '../html-pages/html-pages.plugin.ts';
import {
	ensureIntegrationRuntimeReady,
	resolveIntegrationDependencies,
	setupAppRuntimeIntegrations,
} from './app-build-manifest-runtime.ts';

async function createApp() {
	const integration = new HtmlPagesPlugin();
	const events: string[] = [];
	vi.spyOn(integration, 'setup').mockImplementation(async () => {
		events.push('setup');
	});
	vi.spyOn(integration, 'refreshResolvedIntegrationDependencies').mockImplementation(async () => {
		events.push('resolve');
	});
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/project', integrations: [integration] });
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

test('a deferred activation leaves global scripts to resolveIntegrationDependencies', async () => {
	const { appConfig, integration, events } = await createApp();

	await setupAppRuntimeIntegrations({ appConfig, deferGlobalScripts: true });
	await ensureIntegrationRuntimeReady({ appConfig, integrationName: integration.name });
	expect(events).toEqual(['setup']);

	await resolveIntegrationDependencies({ appConfig });
	expect(events).toEqual(['setup', 'resolve']);
});
