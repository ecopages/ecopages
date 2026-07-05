import { join } from 'node:path';
import type { DocsManifestConfig } from './manifest/docs-manifest';
import { clearDocsManifestCache } from './manifest/get-docs-manifest';

export type DocsKitConfig = {
	rootDir: string;
	contentRoot: string;
	manifest: DocsManifestConfig;
	mdxComponents: Record<string, unknown>;
	shellLayout: unknown;
	layoutComponents: unknown[];
	sectionIcons: Record<string, unknown>;
	strictImageImports?: boolean;
};

let kitConfig: DocsKitConfig | null = null;

/**
 * Registers docs-kit paths and app-specific dependencies.
 *
 * @remarks Call once from `docs-kit.instance.ts` before any docs-kit module runs.
 */
export function defineDocsKit(options: Omit<DocsKitConfig, 'contentRoot'> & { contentRoot?: string }): void {
	kitConfig = {
		...options,
		contentRoot: options.contentRoot ?? join(options.rootDir, 'src/content/docs'),
	};
	clearDocsManifestCache();
}

export function getDocsKit(): DocsKitConfig {
	if (!kitConfig) {
		throw new Error('Docs kit is not configured. Import docs-kit.instance.ts before using docs-kit.');
	}

	return kitConfig;
}

/** Clears registered config (for tests). */
export function clearDocsKitConfig(): void {
	kitConfig = null;
}
