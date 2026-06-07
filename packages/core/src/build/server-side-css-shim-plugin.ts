/**
 * Server-side CSS shim plugin for the bundler adapter.
 *
 * @remarks
 * Page modules imported by the server (so the framework can read
 * `getStaticProps` / `staticPaths` / page metadata) commonly have
 * `import './style.css'` at the top. The bundler does not bundle
 * CSS, and the server only needs the JS exports — the CSS itself
 * is delivered to the browser via the page's `dependencies.stylesheets`
 * declarations. This plugin:
 *
 * - Resolves `.css` imports to the absolute on-disk path.
 * - Loads them and returns an empty ESM module with
 *   `moduleSideEffects: true` so the bundler keeps the import in
 *   the dependency graph without trying to bundle the bytes.
 *
 * The plugin is added by the adapter on every server-side build.
 * Browser-side builds that want real CSS bundling should keep using
 * a dedicated CSS pipeline (e.g. the postcss processor's output)
 * and continue to declare stylesheets in `dependencies.stylesheets`
 * — the shim is intentionally inert for those flows.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type RolldownPluginLike = {
	name: string;
	resolveId: (source: string, importer: string | undefined) => Promise<string | null> | string | null;
	load: (id: string) => Promise<{ code: string; moduleType: 'js'; moduleSideEffects: boolean } | null> | {
		code: string;
		moduleType: 'js';
		moduleSideEffects: boolean;
	} | null;
};

const CSS_PATH = /\.css$/u;
const CSS_QUERY = '?ecopages-css-shim';

function stripShimQuery(id: string): string {
	const queryIndex = id.indexOf('?');
	return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

/**
 * Builds a Rolldown plugin that turns `.css` imports into no-op ESM
 * modules while preserving the dependency graph.
 */
export function createServerSideCssShimPlugin(): RolldownPluginLike {
	return {
		name: 'ecopages:server-side-css-shim',
		async resolveId(source, importer) {
			if (!CSS_PATH.test(source)) {
				return null;
			}

			const resolved = importer ? path.resolve(path.dirname(importer), source) : path.resolve(source);
			return existsSync(resolved) ? `${resolved}${CSS_QUERY}` : null;
		},
		async load(id) {
			if (!id.endsWith(CSS_QUERY)) {
				return null;
			}

			const realPath = stripShimQuery(id);
			readFileSync(realPath, 'utf-8');
			return {
				code: 'export {};',
				moduleType: 'js',
				moduleSideEffects: true,
			};
		},
	};
}
