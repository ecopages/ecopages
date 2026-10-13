import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { isPagesUnifiedGraphPage } from '../../../packages/core/src/build/cache/pages-unified-graph-build';
import { appLogger } from '../../../packages/core/src/global/app-logger';
import { resetRolldownBuildInvocationCounts } from '../../../packages/core/src/build/rolldown/rolldown-build-invocation-metrics';
import { KITCHEN_SINK_REPRESENTATIVE_PAGES, loadKitchenSinkConfig } from './lib/kitchen-sink-fixture';
import {
	resetBenchBuildState,
	loadStaticBuildBenchConfigWithScope,
	runStaticSiteGeneration,
} from './lib/static-build-fixture';

/**
 * Puts the process in the state a production `ecopages build` has when run from `playground/kitchen-sink`,
 * before any import runs.
 *
 * @remarks
 * Each part fixes one failure that appeared when the oracle ran from the repository root:
 *
 * - `NODE_ENV` is `production` from the start. Setting it inside the test body is too late: `react`
 *   would already have loaded its development build next to a production `react-dom/server`, and
 *   every React page fails with `dispatcher.getOwner is not a function`.
 * - The working directory is the app root. The Lit static render worker reloads `eco.config.ts` with
 *   the working directory as root, and from the repository root it reads `src/includes/html.kita.tsx`
 *   from the wrong directory.
 * - Node resolves packages without the `development` condition. Vitest starts every worker with
 *   `--conditions development`, so `@lit-labs/ssr` loads the development `@lit/reactive-element`
 *   while the server modules the build emits import the production one, and a page with a
 *   server-rendered Lit script fails with `this.__markUpdated is not a function`.
 *
 * Only `discovery-foreign` exercises the last case, so the test also asserts that no page logged an
 * error: the static site generator logs a failed page and moves on, which would otherwise leave both
 * builds without it and still compare equal.
 */
const original = vi.hoisted(() => {
	const previous = { nodeEnv: process.env.NODE_ENV, cwd: process.cwd() };
	process.env.NODE_ENV = 'production';
	process.chdir(`${import.meta.dirname}/..`);
	const hooks = process.getBuiltinModule('node:module').registerHooks({
		resolve: (specifier, context, nextResolve) =>
			nextResolve(specifier, {
				...context,
				conditions: context.conditions.filter((condition) => condition !== 'development'),
			}),
	});
	return { ...previous, hooks };
});

const PARITY_SCOPE_BASELINE = '__bench-unified-graph-baseline__';
const PARITY_SCOPE_GRAPH = '__bench-unified-graph-treatment__';

function normalizeStaticHtml(html: string): string {
	return html
		.replace(/<!--lit-part[^>]*-->/gu, '<!--lit-part-->')
		.replace(/<!--\?-->/gu, '')
		.replace(/\?v=[^"'>\s]+/gu, '?v=__VERSION__')
		.replace(/\/images\/[^"'>\s]+/gu, '/images/__IMAGE__')
		.replace(/\d{13}/gu, '__TIMESTAMP__')
		.replace(/[a-f0-9]{8,}/giu, '__HASH__');
}

function collectHtmlArtifacts(distDir: string): Map<string, string> {
	const artifacts = new Map<string, string>();

	const walk = (currentDir: string): void => {
		for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
			const absolutePath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				walk(absolutePath);
				continue;
			}

			if (!entry.name.endsWith('.html')) {
				continue;
			}

			artifacts.set(
				path.relative(distDir, absolutePath),
				normalizeStaticHtml(fileSystem.readFileSync(absolutePath)),
			);
		}
	};

	walk(distDir);
	return artifacts;
}

describe('static-build unified graph parity', () => {
	const originalUnifiedGraph = process.env.ECOPAGES_UNIFIED_PAGES_GRAPH;
	const originalMetrics = process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS;

	afterAll(() => {
		process.env.NODE_ENV = original.nodeEnv;
		process.chdir(original.cwd);
		original.hooks.deregister();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalUnifiedGraph === undefined) {
			delete process.env.ECOPAGES_UNIFIED_PAGES_GRAPH;
		} else {
			process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = originalUnifiedGraph;
		}
		if (originalMetrics === undefined) {
			delete process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS;
		} else {
			process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = originalMetrics;
		}
		resetRolldownBuildInvocationCounts();
	});

	it('marks kitchen-sink template pages as unified-graph eligible', async () => {
		const appConfig = await loadKitchenSinkConfig();

		for (const pagePath of Object.values(KITCHEN_SINK_REPRESENTATIVE_PAGES)) {
			assert.equal(isPagesUnifiedGraphPage(pagePath, appConfig), true, pagePath);
		}
	});

	it('produces identical static HTML with unified graph on vs off', async () => {
		process.env.ECOPAGES_ROLLDOWN_BUILD_METRICS = '1';
		const logError = vi.spyOn(appLogger, 'error');

		const baselineConfig = await loadStaticBuildBenchConfigWithScope(PARITY_SCOPE_BASELINE);
		resetBenchBuildState(baselineConfig);
		process.env.ECOPAGES_UNIFIED_PAGES_GRAPH = '0';
		await runStaticSiteGeneration(baselineConfig, { force: true });

		const graphConfig = await loadStaticBuildBenchConfigWithScope(PARITY_SCOPE_GRAPH);
		resetBenchBuildState(graphConfig);
		delete process.env.ECOPAGES_UNIFIED_PAGES_GRAPH;
		resetRolldownBuildInvocationCounts();
		await runStaticSiteGeneration(graphConfig, { force: true });

		assert.deepEqual(
			logError.mock.calls.map(([message]) => message),
			[],
			'every static page should render without a logged error',
		);

		const baselineArtifacts = collectHtmlArtifacts(baselineConfig.absolutePaths.distDir);
		const graphArtifacts = collectHtmlArtifacts(graphConfig.absolutePaths.distDir);

		assert.deepEqual(
			[...graphArtifacts.keys()].sort(),
			[...baselineArtifacts.keys()].sort(),
			'exported HTML file set should match',
		);

		for (const [relativePath, baselineHtml] of baselineArtifacts) {
			assert.equal(graphArtifacts.get(relativePath), baselineHtml, `HTML mismatch for ${relativePath}`);
		}
	}, 120_000);
});
