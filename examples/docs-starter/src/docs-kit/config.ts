import { join } from 'node:path';
import type { DocsSiteContent } from '@/docs-kit/content/docs-site-content.types';
import { clearDocsManifestCache } from './manifest/get-docs-manifest';

export type DocsKitConfig = {
	rootDir: string;
	contentRoot: string;
	content: DocsSiteContent;
	mdxComponents: Record<string, unknown>;
	shellLayout: unknown;
	layoutComponents: unknown[];
	strictImageImports?: boolean;
};

let kitConfig: DocsKitConfig | null = null;

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

export function clearDocsKitConfig(): void {
	kitConfig = null;
}
