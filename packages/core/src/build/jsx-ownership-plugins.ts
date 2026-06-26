import { createForeignJsxOverridePlugin } from '../plugins/foreign-jsx-override-plugin.ts';
import type { EcoBuildPlugin } from './build-types.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

type JsxExtensionEntry = {
	integration: NonNullable<EcoPagesAppConfig['integrations']>[number];
	extension: string;
};

function collectJsxExtensionEntries(appConfig: EcoPagesAppConfig): JsxExtensionEntry[] {
	return (appConfig.integrations ?? [])
		.filter((integration) => integration.jsxImportSource)
		.flatMap((integration) =>
			integration.extensions
				.filter((extension) => extension.endsWith('.tsx') || extension.endsWith('.jsx'))
				.map((extension) => ({ integration, extension })),
		)
		.sort((left, right) => right.extension.length - left.extension.length);
}

/**
 * Foreign JSX override plugins for mixed-integration app builds.
 *
 * Each plugin rewrites files for one `(integration, extension)` pair with that
 * integration's own `@jsxImportSource` so the bundler preserves the owning JSX
 * runtime for native extension ownership.
 *
 * Extensions are sorted longest-first so `.page.react.tsx` wins over `.tsx`.
 */
export function getJsxOwnershipPlugins(appConfig: EcoPagesAppConfig): EcoBuildPlugin[] {
	const jsxExtensions = collectJsxExtensionEntries(appConfig);

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

/**
 * Host-scoped JSX override plugins for one integration's client bundle graph.
 *
 * When a host integration (for example React) bundles foreign `.tsx` files, those
 * files must compile with the host JSX runtime instead of the project default.
 * Use this helper for host-owned client bundles. For app-wide transpilation that
 * should preserve each integration's native JSX runtime, use
 * {@link getJsxOwnershipPlugins} instead.
 */
export function getHostScopedJsxOwnershipPlugins(
	appConfig: EcoPagesAppConfig,
	hostIntegrationName: string,
	options?: { name?: string },
): EcoBuildPlugin[] {
	const hostIntegration = (appConfig.integrations ?? []).find((integration) => integration.name === hostIntegrationName);
	const hostJsxImportSource = hostIntegration?.jsxImportSource;
	if (!hostJsxImportSource) {
		return [];
	}

	const foreignExtensions = (appConfig.integrations ?? [])
		.filter((integration) => integration.name !== hostIntegrationName)
		.flatMap((integration) =>
			integration.extensions.filter((extension) => extension.endsWith('.tsx') || extension.endsWith('.jsx')),
		);

	return [
		createForeignJsxOverridePlugin({
			name: options?.name ?? `ecopages-jsx-ownership-host-${hostIntegrationName}`,
			hostJsxImportSource,
			foreignExtensions,
		}),
	];
}
