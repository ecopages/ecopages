import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { isPagesUnifiedGraphPage } from '../../../packages/core/src/build/cache/pages-unified-graph-build';
import { resetRolldownBuildInvocationCounts } from '../../../packages/core/src/build/rolldown/rolldown-build-invocation-metrics';
import { KITCHEN_SINK_REPRESENTATIVE_PAGES, loadKitchenSinkConfig } from './lib/kitchen-sink-fixture';
import {
	resetBenchBuildState,
	loadStaticBuildBenchConfigWithScope,
	runStaticSiteGeneration,
} from './lib/static-build-fixture';

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
	afterEach(() => {
		resetRolldownBuildInvocationCounts();
	});

	it('marks kitchen-sink template pages as unified-graph eligible', async () => {
		const appConfig = await loadKitchenSinkConfig();

		for (const pagePath of Object.values(KITCHEN_SINK_REPRESENTATIVE_PAGES)) {
			assert.equal(isPagesUnifiedGraphPage(pagePath, appConfig), true, pagePath);
		}
	});

	it('produces identical static HTML with unified graph on vs off', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ECOPAGES_ROLLDOWN_BUILD_METRICS', '1');

		const baselineConfig = await loadStaticBuildBenchConfigWithScope(PARITY_SCOPE_BASELINE);
		resetBenchBuildState(baselineConfig);
		vi.stubEnv('ECOPAGES_UNIFIED_PAGES_GRAPH', '0');
		await runStaticSiteGeneration(baselineConfig, { force: true });

		const graphConfig = await loadStaticBuildBenchConfigWithScope(PARITY_SCOPE_GRAPH);
		resetBenchBuildState(graphConfig);
		vi.stubEnv('ECOPAGES_UNIFIED_PAGES_GRAPH', undefined);
		resetRolldownBuildInvocationCounts();
		await runStaticSiteGeneration(graphConfig, { force: true });

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
