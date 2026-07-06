import type { DocsManifest } from './docs-manifest';
import type { DocsSiteContent } from '@/docs-kit/content/docs-site-content.types';
import { buildDocsManifest } from './build-docs-manifest';

let cachedManifest: DocsManifest | null = null;
let manifestPromise: Promise<DocsManifest> | null = null;

export function clearDocsManifestCache(): void {
	cachedManifest = null;
	manifestPromise = null;
}

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
