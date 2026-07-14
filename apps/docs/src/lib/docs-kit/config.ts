export type DocsKitConfig = {
	rootDir: string;
	mdxComponents: Record<string, unknown>;
	shellLayout: unknown;
	layoutComponents: unknown[];
	strictImageImports?: boolean;
};

let kitConfig: DocsKitConfig | null = null;

/**
 * Registers docs-kit paths and app-specific dependencies.
 *
 * @remarks Call once from `docs-kit.instance.ts` before any docs-kit module runs.
 */
export function defineDocsKit(options: DocsKitConfig): void {
	kitConfig = options;
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
