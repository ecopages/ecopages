import { createForeignJsxOverridePlugin } from '../plugins/foreign-jsx-override-plugin.ts';
import type { EcoBuildPlugin } from './build-types.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

/**
 * Foreign JSX override plugins for mixed-integration apps (Kita + React, etc.).
 *
 * Each plugin rewrites files for one `(integration, extension)` pair with a
 * `@jsxImportSource` pragma so the bundler compiles against the owning runtime.
 * Extensions are sorted longest-first so `.page.react.tsx` wins over `.tsx`.
 */
export function getJsxOwnershipPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	const jsxExtensions = (appConfig.integrations ?? [])
		.filter((integration) => integration.jsxImportSource)
		.flatMap((integration) =>
			integration.extensions
				.filter((extension) => extension.endsWith('.tsx') || extension.endsWith('.jsx'))
				.map((extension) => ({ integration, extension })),
		)
		.sort((left, right) => right.extension.length - left.extension.length);

	return jsxExtensions.map(({ integration, extension }) =>
		createForeignJsxOverridePlugin({
			hostJsxImportSource: integration.jsxImportSource!,
			foreignExtensions: [extension],
			excludeExtensions: jsxExtensions
				.filter((candidate) => candidate.extension.length > extension.length)
				.filter((candidate) => candidate.extension.endsWith(extension))
				.map((candidate) => candidate.extension),
			name: `ecopages-jsx-ownership-${integration.name}-${extension.replace(/[^a-zA-Z0-9]+/g, '-')}`,
		}),
	);
}
