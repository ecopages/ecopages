import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EcoBuildPlugin } from '../build/build-types.ts';

/**
 * Options for the shared foreign-JSX override build plugin.
 */
export interface ForeignJsxOverrideOptions {
	/** JSX runtime that should own the transformed foreign files. */
	hostJsxImportSource: string;
	/** Extensions claimed by other JSX integrations that may appear in the host graph. */
	foreignExtensions: string[];
	/** Optional plugin name override for debug output. */
	name?: string;
}

/**
 * Build plugin that prepends a `@jsxImportSource` pragma to foreign integration
 * files bundled into a host integration's client graph.
 *
 * When a host integration (e.g. React) bundles a component file that belongs to
 * another JSX integration (e.g. `.kita.tsx`), that file inherits the project
 * `tsconfig` JSX runtime which produces the wrong output (HTML strings instead
 * of framework elements). This plugin rewrites the source to explicitly target
 * the host's JSX factory so esbuild compiles every JSX expression into the
 * correct element creation calls.
 *
 * The plugin is intentionally framework-agnostic: any integration that does
 * client-side bundling can use it by passing its own `jsxImportSource` and the
 * set of foreign extensions collected from the app config.
 *
 * When no JSX-bearing foreign extensions are present, the returned plugin is a
 * no-op so integrations can register it unconditionally.
 */
export function createForeignJsxOverridePlugin(options: ForeignJsxOverrideOptions): EcoBuildPlugin {
	const extensions = options.foreignExtensions.filter((ext) => ext.endsWith('.tsx') || ext.endsWith('.jsx'));

	if (extensions.length === 0) {
		return {
			name: options.name ?? 'foreign-jsx-override',
			setup() {},
		};
	}

	const pragma = `/** @jsxImportSource ${options.hostJsxImportSource} */\n`;
	const filter = new RegExp(`(${extensions.map((e) => e.replace('.', '\\.')).join('|')})$`);

	return {
		name: options.name ?? 'foreign-jsx-override',
		setup(build) {
			build.onLoad({ filter }, (args) => {
				const source = readFileSync(args.path, 'utf-8');
				const loader = args.path.endsWith('.jsx') ? 'jsx' : 'tsx';

				if (source.includes('@jsxImportSource')) {
					return undefined;
				}

				return {
					contents: pragma + source,
					loader,
					resolveDir: path.dirname(args.path),
				};
			});
		},
	};
}
