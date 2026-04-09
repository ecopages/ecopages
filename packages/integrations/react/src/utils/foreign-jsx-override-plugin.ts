import { readFileSync } from 'node:fs';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';

interface ForeignJsxOverrideOptions {
	jsxImportSource: string;
	name?: string;
}

/**
 * Esbuild plugin that overrides the JSX import source for non-host integration
 * files (`.lit.tsx`, `.kita.tsx`, etc.) when bundled into a host client bundle.
 *
 * Without this plugin, non-host component files inherit the project-level
 * `jsxImportSource` from tsconfig (typically `@kitajs/html`), which produces
 * HTML strings from JSX. When the host framework calls those functions during
 * hydration, it renders the string as a text node instead of a DOM element.
 *
 * This plugin prepends the host's `@jsxImportSource` pragma so esbuild compiles
 * their JSX to the host framework's element creation calls.
 */
export function createForeignJsxOverridePlugin(
	nonReactExtensions: string[],
	options: ForeignJsxOverrideOptions,
): EcoBuildPlugin {
	const extensions = nonReactExtensions.filter((ext) => ext.endsWith('.tsx') || ext.endsWith('.jsx'));

	if (extensions.length === 0) {
		return {
			name: options.name ?? 'react-foreign-jsx-override',
			setup() {},
		};
	}

	function matchesNonReactExtension(id: string): boolean {
		for (const ext of extensions) {
			if (id.endsWith(ext)) {
				return true;
			}
		}
		return false;
	}

	const pragma = `/** @jsxImportSource ${options.jsxImportSource} */\n`;
	const filter = new RegExp(`(${extensions.map((e) => e.replace('.', '\\.')).join('|')})$`);

	return {
		name: options.name ?? 'react-foreign-jsx-override',
		setup(build) {
			build.onLoad({ filter }, (args) => {
				if (!matchesNonReactExtension(args.path)) {
					return undefined;
				}

				const source = readFileSync(args.path, 'utf-8');

				if (source.includes('@jsxImportSource')) {
					return undefined;
				}

				return {
					contents: pragma + source,
					loader: 'tsx',
				};
			});
		},
	};
}
