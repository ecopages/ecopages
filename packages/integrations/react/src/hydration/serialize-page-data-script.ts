import {
	type EcoPageDataDocumentPayload,
	type EcoPageDataProps,
	createEcoPageDataManifestV1,
} from './page-data-manifest.ts';

export {
	ECO_PAGE_DATA_SCHEMA_VERSION,
	createEcoPageDataManifestV1,
	isEcoPageDataManifestV1,
	resolveEcoPageDataModuleUrl,
	resolveEcoPageDataProps,
	resolvePageDataDocumentPayload,
	type EcoPageDataDocumentPayload,
	type EcoPageDataManifestV1,
	type EcoPageDataProps,
} from './page-data-manifest.ts';

/**
 * Escapes page data JSON for safe embedding in HTML script bodies.
 */
export function escapePageDataJson(pageProps: EcoPageDataDocumentPayload | undefined): string {
	return JSON.stringify(pageProps ?? {}).replace(/</g, '\\u003c');
}

/**
 * Emits the canonical `__ECO_PAGE_DATA__` bootstrap script tag.
 *
 * @remarks
 * Accepts a v1 envelope or legacy flat props. Router-enabled documents should
 * use {@link serializePageDataManifestScript} so clients can discover the page
 * module without parsing hydration JavaScript.
 */
export function serializePageDataScript(pageProps: EcoPageDataDocumentPayload | undefined): string {
	return `<script id="__ECO_PAGE_DATA__" type="application/json">${escapePageDataJson(pageProps)}</script>`;
}

/**
 * Emits a versioned page-data envelope for React router documents.
 *
 * @remarks
 * Canonical HTML serializer for router-enabled pages. SPA commit paths that
 * build a React element instead of an HTML string use
 * {@link resolvePageDataDocumentPayload} with the same envelope shape.
 */
export function serializePageDataManifestScript(input: { moduleUrl: string; props: EcoPageDataProps }): string {
	return serializePageDataScript(createEcoPageDataManifestV1(input));
}
