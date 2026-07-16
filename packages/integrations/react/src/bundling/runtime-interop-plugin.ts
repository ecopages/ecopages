import fs from 'node:fs';
import path from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createReactDomRuntimeInteropPlugin(options?: {
	name?: string;
	reactSpecifier?: string;
}): EcoBuildPlugin {
	const reactDomFileFilter = /[\\/]react-dom[\\/].*\.js$/;
	const reactRequirePattern = /\brequire\((['"])react\1\)/g;
	const reactSpecifier = options?.reactSpecifier ?? 'react';

	return {
		name: options?.name ?? 'react-dom-runtime-interop',
		setup(build) {
			if (reactSpecifier.startsWith('/')) {
				build.onResolve({ filter: new RegExp(`^${escapeRegExp(reactSpecifier)}$`) }, (args) => ({
					path: args.path,
					external: true,
				}));
			}

			build.onLoad({ filter: reactDomFileFilter }, (args) => {
				const content = fs.readFileSync(args.path, 'utf-8');
				if (!reactRequirePattern.test(content)) {
					return undefined;
				}

				reactRequirePattern.lastIndex = 0;
				const rewritten = content.replace(reactRequirePattern, '__ecopages_react_runtime');

				return {
					contents: `import * as __ecopages_react_runtime from '${reactSpecifier}';\n${rewritten}`,
					loader: 'js',
					resolveDir: path.dirname(args.path),
				};
			});
		},
	};
}
