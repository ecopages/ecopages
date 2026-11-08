import fs from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	createTempRoot,
	startHmrManager,
	writeSourceFile,
} from '../../adapters/shared/hmr/hmr-manager.test-helpers.ts';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { Processor } from '../../plugins/processor.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import type { ClientBridgeEvent } from '../../types/contracts.ts';
import type { AssetDefinition } from './assets.types.ts';
import { AssetProcessingService } from './asset-processing.service.ts';

/** Compiles `@apply text-red;` and throws on an unclosed block, as a CSS Processor does. */
class StrictProcessor extends Processor {
	async setup(): Promise<void> {}

	override async transformStylesheet(css: string): Promise<{ css: string; exports?: Record<string, string> }> {
		if (css.includes('{{')) throw new Error('Unclosed block');
		const compiled = css.replace('@apply text-red;', 'color: red;');
		return this.capabilities.some((capability) => capability.cssModules)
			? { css: compiled, exports: { card: 'card_hash' } }
			: { css: compiled };
	}
}

const GOOD_CSS = '.card { @apply text-red; }\n';
const BROKEN_CSS = '.card {{\n';

afterEach(() => {
	vi.unstubAllEnvs();
});

/** An app with the strict stylesheet Processor, the asset service a Page render uses, and a running HMR manager. */
async function startApp(options: { cssModules?: boolean } = {}) {
	const rootDir = createTempRoot('ecopages-dev-stylesheet-page');
	const config = await finalizeEcoPagesConfig({
		rootDir,
		integrations: [],
		processors: [
			new StrictProcessor({
				name: 'strict',
				capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: options.cssModules }],
			}),
		],
	});
	const { manager, broadcasts } = startHmrManager(config, 1);
	const service = AssetProcessingService.createWithDefaultProcessors(config);
	const file = (relativePath: string, css: string) => writeSourceFile(rootDir, relativePath, css);
	/** What a watcher batch does to the asset service before the next request: evicts what the file touched. */
	const save = async (filePath: string, css: string) => {
		fs.writeFileSync(filePath, css);
		requireAppRuntime(config).buildInputIndex.recordChanges([filePath]);
		await manager.handleFileChanges([filePath]);
	};
	const request = (filePath: string) => {
		const dependency: AssetDefinition = { kind: 'stylesheet', source: 'file', filepath: filePath, inline: false };
		return service.processDependencies([dependency], undefined);
	};
	const pendingErrors = () => {
		const received: ClientBridgeEvent[] = [];
		manager.sendPendingBuildErrors({ send: (payload) => received.push(JSON.parse(payload)) });
		return received;
	};
	return { file, save, request, broadcasts, pendingErrors, config, manager };
}

describe.each([
	['a stylesheet', 'src/components/card.css', false],
	['a CSS Module', 'src/components/card.module.css', true],
])('a Page request in development for %s that is broken', (_label, relativePath, cssModules) => {
	test.fails('links the last good output and shows the error', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const app = await startApp({ cssModules });
		const css = app.file(relativePath, GOOD_CSS);
		const [good] = await app.request(css);

		await app.save(css, BROKEN_CSS);
		app.broadcasts.length = 0;
		const [served] = await app.request(css);

		expect(served?.filepath).toBe(good.filepath);
		expect(fs.readFileSync(served.filepath!, 'utf8')).toBe('.card { color: red; }\n');
		expect(app.broadcasts).toContainEqual({ type: 'error', message: expect.stringContaining('Unclosed block') });
		expect(app.pendingErrors()).toHaveLength(1);
	});

	test.fails('renders without the link and shows the error when it never compiled', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const app = await startApp({ cssModules });
		const css = app.file(relativePath, BROKEN_CSS);

		expect(await app.request(css)).toEqual([]);
		expect(app.broadcasts).toContainEqual({ type: 'error', message: expect.stringContaining('Unclosed block') });
		expect(app.pendingErrors()).toHaveLength(1);
	});

	test.fails('serves the fixed output and clears the error once a save fixes it', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const app = await startApp({ cssModules });
		const css = app.file(relativePath, GOOD_CSS);
		await app.request(css);
		await app.save(css, BROKEN_CSS);
		await app.request(css);

		await app.save(css, '.card { @apply text-red; margin: 0; }\n');
		const [fixed] = await app.request(css);

		expect(fs.readFileSync(fixed.filepath!, 'utf8')).toBe('.card { color: red; margin: 0; }\n');
		expect(app.pendingErrors()).toEqual([]);
	});
});

describe('a Page request outside development with a broken stylesheet', () => {
	test('fails while the build generates static pages', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const app = await startApp();
		const css = app.file('src/components/card.css', BROKEN_CSS);
		requireAppRuntime(app.config).staticGenerationActive = true;

		await expect(app.request(css)).rejects.toThrow('Unclosed block');
		expect(app.broadcasts.some((event) => event.type === 'error')).toBe(false);
	});

	test('fails when the build runs with a development NODE_ENV', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const app = await startApp();
		const css = app.file('src/components/card.css', BROKEN_CSS);
		requireAppRuntime(app.config).staticGenerationActive = true;

		await expect(app.request(css)).rejects.toThrow('Unclosed block');
	});

	test('serves the Page without the stylesheet in production, and keeps no last good output', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const app = await startApp();
		const css = app.file('src/components/card.css', GOOD_CSS);
		await app.request(css);
		await app.save(css, BROKEN_CSS);

		expect(await app.request(css)).toEqual([]);
		expect(app.broadcasts.some((event) => event.type === 'error')).toBe(false);
	});

	test('rejects in a test environment, which is neither development nor production', async () => {
		const app = await startApp();
		const css = app.file('src/components/card.css', BROKEN_CSS);

		await expect(app.request(css)).rejects.toThrow('Unclosed block');
	});
});
