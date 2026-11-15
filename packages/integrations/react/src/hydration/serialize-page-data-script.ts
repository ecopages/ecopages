import {
	type EcoPageDataDocumentPayload,
	type EcoPageDataProps,
	resolvePageDataDocumentPayload,
} from './page-data-manifest.ts';

export {
	ECO_PAGE_DATA_SCHEMA_VERSION,
	ECO_PAGE_DATA_TIERS_KEY,
	createEcoPageDataManifestV1,
	isEcoPageDataManifestV1,
	resolveEcoPageDataModuleUrl,
	resolveEcoPageDataProps,
	resolveEcoPageDataTiers,
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
 * Canonical HTML serializer for router-enabled pages. It builds the envelope through
 * {@link resolvePageDataDocumentPayload}, as `EcoPropsScript` does, so the reserved tiers key in `props` becomes the
 * envelope's `tiers` and never stays in the page props.
 */
export function serializePageDataManifestScript(input: { moduleUrl: string; props: EcoPageDataProps }): string {
	return serializePageDataScript(resolvePageDataDocumentPayload(input.props, { moduleUrl: input.moduleUrl }));
}
