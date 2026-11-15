import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { HmrStrategyType } from '../hmr-strategy.ts';
import { DevelopmentInvalidationService } from '../../dev/invalidation/development-invalidation.service.ts';
import { ServerRenderedTemplateHmrStrategy } from './server-rendered-template-hmr-strategy.ts';

describe('ServerRenderedTemplateHmrStrategy', () => {
	afterEach(() => {
		vi.resetModules();
	});

	it('matches include files and the views the server entry imported, wherever they live', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		const invalidationService = new DevelopmentInvalidationService(appConfig);
		vi.resetModules();
		const { createViewReference } = await import('../../build/server/view-reference.ts');
		const { ServerRenderedTemplateHmrStrategy: IsolatedStrategy } =
			await import('./server-rendered-template-hmr-strategy.ts');
		const strategy = new IsolatedStrategy(invalidationService);
		createViewReference(path.resolve('/test/project/src/admin/dashboard.kita.tsx'), 'kitajs');

		expect(strategy.matches('/test/project/src/includes/seo.kita.tsx')).toBe(true);
		expect(strategy.matches('/test/project/src/admin/dashboard.kita.tsx')).toBe(true);
		expect(strategy.matches('/test/project/src/components/Button.tsx')).toBe(false);
	});

	it('does not treat a file in a views folder as a view unless the server entry imported it', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
		const strategy = new ServerRenderedTemplateHmrStrategy(new DevelopmentInvalidationService(appConfig));

		expect(strategy.matches('/test/project/src/views/never-imported.kita.tsx')).toBe(false);
	});

	it('outranks integration-owned strategies that also match shared dependencies', async () => {
		const strategy = new ServerRenderedTemplateHmrStrategy(
			new DevelopmentInvalidationService(await finalizeEcoPagesConfig({ rootDir: '/test/project' })),
		);

		expect(strategy.priority).toBeGreaterThan(HmrStrategyType.INTEGRATION);
	});

	it('broadcasts a layout-update event for server-rendered template changes', async () => {
		const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
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
