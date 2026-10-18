import { describe, expect, it } from 'vitest';
import type { EcoPagesElement } from '@ecopages/core';
import { requireAppRuntime } from '@ecopages/core/integration';
import { IntegrationPlugin } from '@ecopages/core/integration';
import { IntegrationRenderer } from '@ecopages/core/integration';
import { createStringMarkupIntegration, createTestAppConfig, setupTestIntegration } from './index.ts';

class TestRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'test';

	getRuntimeOrigin(): string {
		return requireAppRuntime(this.appConfig).origin;
	}

	override async render(): Promise<string> {
		return '';
	}

	override async renderComponent() {
		return {
			html: '<div>test</div>',
			canAttachAttributes: true,
			integrationName: this.name,
		};
	}
}

class TestPlugin extends IntegrationPlugin<EcoPagesElement> {
	renderer = TestRenderer;

	constructor() {
		super({
			name: 'test',
			extensions: ['.test.tsx'],
		});
	}
}

describe('createTestAppConfig', () => {
	it('installs the test-only string Integration by default', async () => {
		const config = await createTestAppConfig();

		expect(config.integrations.map((integration) => integration.name)).toEqual(['string', 'html-pages']);
		expect(config.templatesExt).toEqual(['.string.ts', '.html']);
	});

	it('keeps only the core HTML Pages Integration when integrations are cleared', async () => {
		const config = await createTestAppConfig({ integrations: [] });

		expect(config.integrations.map((integration) => integration.name)).toEqual(['html-pages']);
		expect(config.templatesExt).toEqual(['.html']);
	});

	it('allows user config overrides through configure', async () => {
		const config = await createTestAppConfig({
			configure: (userConfig) => ({ ...userConfig, rootDir: '/tmp/test-root', workDir: '.eco-parallel' }),
		});

		expect(config.rootDir).toBe('/tmp/test-root');
		expect(config.workDir).toBe('.eco-parallel');
	});

	it('allows integrations to use a runtime origin different from baseUrl', async () => {
		const plugin = new TestPlugin();

		const config = await createTestAppConfig({
			baseUrl: 'http://localhost:3100',
			runtimeOrigin: 'http://127.0.0.1:4100',
			integrations: [plugin],
		});
		await setupTestIntegration(plugin, config);

		const renderer = plugin.getRenderer() as TestRenderer;
		expect(renderer).toBeInstanceOf(TestRenderer);
		expect(renderer.getRuntimeOrigin()).toBe('http://127.0.0.1:4100');
		expect(requireAppRuntime(config).origin).toBe('http://127.0.0.1:4100');
	});
});

describe('createStringMarkupIntegration', () => {
	it('owns .string.ts files by default', () => {
		const integration = createStringMarkupIntegration();

		expect(integration.name).toBe('string');
		expect(integration.extensions).toEqual(['.string.ts']);
	});

	it('allows fixture ownership to use a custom name and extensions', () => {
		const integration = createStringMarkupIntegration({
			name: 'fixture-string',
			extensions: ['.fixture.ts'],
		});

		expect(integration.name).toBe('fixture-string');
		expect(integration.extensions).toEqual(['.fixture.ts']);
	});
});
