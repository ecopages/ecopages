import { describe, expect, it } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { DevelopmentInvalidationService } from '../../dev/invalidation/development-invalidation.service.ts';
import type { ResolvedHmrEntrypoint } from '../../types/contracts.ts';
import { TemplateSourceHmrStrategy } from './template-source-hmr-strategy.ts';

async function createStrategy(
	registered: ReadonlyMap<string, ResolvedHmrEntrypoint> = new Map(),
): Promise<TemplateSourceHmrStrategy> {
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/test/project' });
	appConfig.templatesExt = ['.kita.tsx', '.mdx'];
	return new TemplateSourceHmrStrategy(new DevelopmentInvalidationService(appConfig), {
		getRegisteredEntrypoints: () => registered,
	});
}

describe('TemplateSourceHmrStrategy', () => {
	it('matches template sources under the source directory', async () => {
		const strategy = await createStrategy();

		expect(strategy.matches('/test/project/src/pages/index.kita.tsx')).toBe(true);
		expect(strategy.matches('/test/project/src/layouts/base-layout.kita.tsx')).toBe(true);
		expect(strategy.matches('/test/project/src/pages/docs/intro.mdx')).toBe(true);
		expect(strategy.matches('/test/project/src/lib/data.ts')).toBe(false);
		expect(strategy.matches('/test/project/other/page.kita.tsx')).toBe(false);
	});

	it('leaves a registered script entrypoint to the strategies that rerun it', async () => {
		const scriptPath = '/test/project/src/components/widget.script.kita.tsx';
		const strategy = await createStrategy(
			new Map([
				[scriptPath, { sourcePath: scriptPath, outputPath: scriptPath, outputUrl: '/w.js', role: 'script' }],
			]),
		);

		expect(strategy.matches(scriptPath)).toBe(false);
	});

	it('broadcasts a layout-update so a navigation runtime refreshes the page in place', async () => {
		const strategy = await createStrategy();
		const filePath = '/test/project/src/pages/index.kita.tsx';

		await expect(strategy.process(filePath)).resolves.toMatchObject({
			type: 'broadcast',
			events: [{ type: 'layout-update', path: filePath }],
		});
	});
});
