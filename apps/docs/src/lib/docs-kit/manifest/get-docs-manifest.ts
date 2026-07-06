import type { DocsManifest } from './docs-manifest';
import type { DocsSiteContent } from '@/lib/docs-kit/content/docs-site-content.types';
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
export async function getDocsManifest(nav?: DocsSiteContent): Promise<DocsManifest> {
	if (nav) {
		return buildDocsManifest(nav);
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
