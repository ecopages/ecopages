import { describe, expect, it } from 'vitest';
import { ConfigBuilder } from '../../config/config-builder.js';
import { HmrStrategyType } from '../hmr-strategy.ts';
import { DevelopmentInvalidationService } from '../../services/invalidation/development-invalidation.service.ts';
import { ServerRenderedTemplateHmrStrategy } from './server-rendered-template-hmr-strategy.ts';

describe('ServerRenderedTemplateHmrStrategy', () => {
	it('matches include and explicit server view files', async () => {
		const appConfig = await new ConfigBuilder().setRootDir('/test/project').build();
		const invalidationService = new DevelopmentInvalidationService(appConfig);
		const strategy = new ServerRenderedTemplateHmrStrategy(invalidationService);

		expect(strategy.matches('/test/project/src/includes/seo.kita.tsx')).toBe(true);
		expect(strategy.matches('/test/project/src/views/explicit-team-view.kita.tsx')).toBe(true);
		expect(strategy.matches('/test/project/src/components/Button.tsx')).toBe(false);
	});

	it('outranks integration-owned strategies that also match shared dependencies', async () => {
		const strategy = new ServerRenderedTemplateHmrStrategy(
			new DevelopmentInvalidationService(await new ConfigBuilder().setRootDir('/test/project').build()),
		);

		expect(strategy.priority).toBeGreaterThan(HmrStrategyType.INTEGRATION);
	});

	it('broadcasts a layout-update event for server-rendered template changes', async () => {
		const appConfig = await new ConfigBuilder().setRootDir('/test/project').build();
		const invalidationService = new DevelopmentInvalidationService(appConfig);
		const strategy = new ServerRenderedTemplateHmrStrategy(invalidationService);
		const filePath = '/test/project/src/includes/seo.kita.tsx';

		const action = await strategy.process(filePath);

		expect(action).toMatchObject({
			type: 'broadcast',
			events: [
				{
					type: 'layout-update',
					path: filePath,
				},
			],
		});
	});
});
