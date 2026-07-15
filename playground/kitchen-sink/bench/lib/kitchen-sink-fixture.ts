/**
 * Kitchen-sink fixture for benchmark tests.
 *
 * Always roots at `playground/kitchen-sink` and uses {@link createKitchenSinkConfig}
 * — the same factory as `eco.config.ts`. Benchmarks may override only `distDir`
 * and `workDir` to isolate output; sources, integrations, and processors are
 * identical to the real app.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EcoPagesAppConfig } from '../../../../packages/core/src/types/internal-types';
import { createKitchenSinkConfig } from '../../kitchen-sink-config';

const KITCHEN_SINK_DIR = fileURLToPath(new URL('../..', import.meta.url));

const configCache = new Map<string, EcoPagesAppConfig>();

export interface KitchenSinkBenchConfigOptions {
	/** Override dist dir relative to kitchen-sink root (default: `dist`). */
	distDir?: string;
	/** Override work dir relative to kitchen-sink root (default: `.eco`). */
	workDir?: string;
}

/**
 * Loads the kitchen-sink config for benchmarks and tests.
 *
 * @remarks
 * When `distDir` / `workDir` are omitted, this matches a normal `ecopages build`
 * from `playground/kitchen-sink` with default `dist/` and `.eco/`.
 */
export async function loadKitchenSinkConfig(options: KitchenSinkBenchConfigOptions = {}): Promise<EcoPagesAppConfig> {
	const distDir = options.distDir ?? 'dist';
	const workDir = options.workDir ?? '.eco';
	const cacheKey = `${distDir}::${workDir}`;
	const cached = configCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const config = await createKitchenSinkConfig({
		rootDir: KITCHEN_SINK_DIR,
		distDir,
		workDir,
		baseUrl: 'http://localhost:3000',
	});

	configCache.set(cacheKey, config);
	return config;
}

export const KITCHEN_SINK_PATHS = {
	root: KITCHEN_SINK_DIR,
	src: path.resolve(KITCHEN_SINK_DIR, 'src'),
	pages: path.resolve(KITCHEN_SINK_DIR, 'src/pages'),
	layouts: path.resolve(KITCHEN_SINK_DIR, 'src/layouts'),
	components: path.resolve(KITCHEN_SINK_DIR, 'src/components'),
	dist: path.resolve(KITCHEN_SINK_DIR, 'dist'),
} as const;

/** Representative pages across every kitchen-sink integration (micro-bench sample). */
export const KITCHEN_SINK_REPRESENTATIVE_PAGES = {
	index: path.join(KITCHEN_SINK_PATHS.pages, 'index.kita.tsx'),
	react: path.join(KITCHEN_SINK_PATHS.pages, 'react-lab.react.tsx'),
	reactServer: path.join(KITCHEN_SINK_PATHS.pages, 'react-server-metadata.react.tsx'),
	kita: path.join(KITCHEN_SINK_PATHS.pages, 'api-lab.kita.tsx'),
	kitaPostcss: path.join(KITCHEN_SINK_PATHS.pages, 'postcss.kita.tsx'),
	lit: path.join(KITCHEN_SINK_PATHS.pages, 'integration-matrix', 'lit-entry.lit.tsx'),
	ecopagesJsx: path.join(KITCHEN_SINK_PATHS.pages, 'integration-matrix', 'ecopages-jsx-entry.eco.tsx'),
	mdx: path.join(KITCHEN_SINK_PATHS.pages, 'docs.md'),
} as const;
