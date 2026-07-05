import type { DocsManifest, DocsManifestConfig } from './docs-manifest';
import { buildDocsManifest } from './build-docs-manifest';

let cachedManifest: DocsManifest | null = null;
let manifestPromise: Promise<DocsManifest> | null = null;

/** Clears the cached manifest (for tests and config resets). */
export function clearDocsManifestCache(): void {
	cachedManifest = null;
	manifestPromise = null;
}

/**
 * Returns the validated docs manifest, building and caching it on first access.
 */
export async function getDocsManifest(config?: DocsManifestConfig): Promise<DocsManifest> {
	if (config) {
		return buildDocsManifest(config);
	}

	if (cachedManifest) {
		return cachedManifest;
	}

	if (!manifestPromise) {
		manifestPromise = buildDocsManifest().then((manifest) => {
			cachedManifest = manifest;
			return manifest;
		});
	}

	return manifestPromise;
}
