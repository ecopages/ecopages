import { describe, expect, it, vi } from 'vitest';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import { PageCacheService } from '../page-cache/page-cache-service.ts';
import { clearPageCacheForPageScriptChange } from './page-script-page-cache.ts';

async function createCachedApp() {
	const appConfig = await finalizeEcoPagesConfig({ rootDir: '/tmp/eco-runtime-asset-cache' });
	const pageCache = new PageCacheService();
	requireAppRuntime(appConfig).pageCache = pageCache;
	await pageCache.getOrCreate('/', 'static', async () => ({ html: '<html>old</html>', strategy: 'static' }));
	return { appConfig, pageCache };
}

describe('clearPageCacheForPageScriptChange', () => {
	it('drops cached documents in development', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const { appConfig, pageCache } = await createCachedApp();

		await clearPageCacheForPageScriptChange(appConfig);

		const rendered = await pageCache.getOrCreate('/', 'static', async () => ({
			html: '<html>new</html>',
			strategy: 'static',
		}));
		expect(rendered.html).toBe('<html>new</html>');
	});

	it('keeps cached documents outside development', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const { appConfig, pageCache } = await createCachedApp();

		await clearPageCacheForPageScriptChange(appConfig);

		const rendered = await pageCache.getOrCreate('/', 'static', async () => ({
			html: '<html>new</html>',
			strategy: 'static',
		}));
		expect(rendered.html).toBe('<html>old</html>');
	});
});
