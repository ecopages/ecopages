import fs from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	createTempRoot,
	startHmrManager,
	writeSourceFile,
} from '../../adapters/shared/hmr/hmr-manager.test-helpers.ts';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import type { ClientBridgeEvent } from '../../types/contracts.ts';
import type { AssetDefinition } from './assets.types.ts';
import { AssetProcessingService } from './asset-processing.service.ts';

const GOOD = 'console.log("good");\n';
const FIXED = 'console.log("fixed");\n';
const BROKEN = 'console.log(;\n';

afterEach(() => {
	vi.unstubAllEnvs();
});

/** An app, the asset service a Page render uses, and a running HMR manager that the overlay reports go to. */
async function startApp() {
	const rootDir = fs.realpathSync(createTempRoot('ecopages-dev-script-page'));
	const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
	const { manager, broadcasts } = startHmrManager(config, 1);
	const service = AssetProcessingService.createWithDefaultProcessors(config);
	const module = writeSourceFile(rootDir, 'src/components/label.ts', GOOD);
	/** What a watcher batch does before the next request: evicts what the file touched and tells the HMR manager. */
	const save = async (source: string) => {
		fs.writeFileSync(module, source);
		requireAppRuntime(config).buildInputIndex.recordChanges([module]);
		await manager.handleFileChanges([module]);
	};
	const request = (dependencies: AssetDefinition[]) => service.processDependencies(dependencies, undefined);
	const pendingErrors = () => {
		const received: ClientBridgeEvent[] = [];
		manager.sendPendingBuildErrors({ send: (payload) => received.push(JSON.parse(payload)) });
		return received;
	};
	return { module, save, request, broadcasts, pendingErrors, config, rootDir };
}

type App = Awaited<ReturnType<typeof startApp>>;

/** The script kinds a Page can declare whose bundle is built while the Page request runs. */
const kinds: Array<[string, (app: App) => AssetDefinition[]]> = [
	[
		'a content script',
		(app) => [
			{ kind: 'script', source: 'content', name: 'entry', content: `import ${JSON.stringify(app.module)};` },
		],
	],
	['an inline file script', (app) => [{ kind: 'script', source: 'file', filepath: app.module, inline: true }]],
	[
		'a grouped content script bundle',
		(app) => [
			{
				kind: 'script',
				source: 'content',
				name: 'entry',
				content: `import ${JSON.stringify(app.module)};`,
				groupedBundle: { id: 'page', entryName: 'entry' },
			},
		],
	],
];

const brokenScript = test;

describe.each(kinds)('a Page request in development for %s that is broken', (_label, declare) => {
	brokenScript('serves the last good bundle and shows the error', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const app = await startApp();
		const dependencies = declare(app);
		const [good] = await app.request(dependencies);
		expect(good).toBeDefined();
		expect(good.inline ? good.content : fs.readFileSync(good.filepath!, 'utf8')).toContain('good');

		await app.save(BROKEN);
		app.broadcasts.length = 0;
		const served = await app.request(dependencies);

		expect(served.map((asset) => asset.filepath)).toEqual([good.filepath]);
		expect(app.broadcasts).toContainEqual({ type: 'error', message: expect.stringContaining('Failed to process') });
		expect(app.pendingErrors()).toHaveLength(1);
	});

	brokenScript('renders without the script and shows the error when it never compiled', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const app = await startApp();
		fs.writeFileSync(app.module, BROKEN);

		expect(await app.request(declare(app))).toEqual([]);
		expect(app.broadcasts).toContainEqual({ type: 'error', message: expect.stringContaining('Failed to process') });
		expect(app.pendingErrors()).toHaveLength(1);
	});

	brokenScript('serves the fixed bundle and clears the error once a save fixes it', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const app = await startApp();
		const dependencies = declare(app);
		await app.request(dependencies);
		await app.save(BROKEN);
		await app.request(dependencies);

		await app.save(FIXED);
		const [fixed] = await app.request(dependencies);

		expect(fixed).toBeDefined();
		const output = fixed.inline ? fixed.content : fs.readFileSync(fixed.filepath!, 'utf8');
		expect(output).toContain('fixed');
		expect(app.pendingErrors()).toEqual([]);
	});
});

describe('a Page request outside development with a broken script', () => {
	test.each(kinds)('fails while the build generates static pages for %s', async (_label, declare) => {
		vi.stubEnv('NODE_ENV', 'production');
		const app = await startApp();
		fs.writeFileSync(app.module, BROKEN);
		requireAppRuntime(app.config).staticGenerationActive = true;

		await expect(app.request(declare(app))).rejects.toThrow();
		expect(app.broadcasts.some((event) => event.type === 'error')).toBe(false);
	});

	test.each(kinds)('fails when the build runs with a development NODE_ENV for %s', async (_label, declare) => {
		vi.stubEnv('NODE_ENV', 'development');
		const app = await startApp();
		fs.writeFileSync(app.module, BROKEN);
		requireAppRuntime(app.config).staticGenerationActive = true;

		await expect(app.request(declare(app))).rejects.toThrow();
	});

	test.each(kinds)('serves the Page without the script in production for %s', async (_label, declare) => {
		vi.stubEnv('NODE_ENV', 'production');
		const app = await startApp();
		fs.writeFileSync(app.module, BROKEN);

		expect(await app.request(declare(app))).toEqual([]);
		expect(app.broadcasts.some((event) => event.type === 'error')).toBe(false);
	});

	test.each(kinds)(
		'rejects in a test environment, which is neither development nor production, for %s',
		async (_label, declare) => {
			const app = await startApp();
			fs.writeFileSync(app.module, BROKEN);

			await expect(app.request(declare(app))).rejects.toThrow();
		},
	);
});
