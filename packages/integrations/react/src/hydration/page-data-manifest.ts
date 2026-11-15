/**
 * Versioned React page-data document payload.
 *
 * @remarks
 * The `__ECO_PAGE_DATA__` script emits this envelope so client navigation can
 * read module identity without parsing generated hydration JavaScript. Older
 * documents may still contain a flat props object; consumers must detect both.
 *
 * Compatibility matrix:
 * - new client / new document: prefer `schemaVersion:1` envelope (`moduleUrl` + `props`)
 * - new client / old document: accept legacy flat props; module discovery uses
 *   `window.__ECO_PAGES__.page.module` or `script[data-eco-page-bootstrap="react-router"]`
 * - old client / new document: old clients that only read flat props should be
 *   upgraded; envelope consumers must unwrap `props` before hydration
 * - malformed / unknown schema (numeric `schemaVersion` present but envelope invalid):
 *   empty props and no module URL from the manifest
 * - HMR: `moduleUrlOverride` still bypasses document discovery
 * - legacy flat props may include a string `schemaVersion` field without being treated as an envelope
 * - `tiers` (the props each layout tier renders with, outer to inner) is optional on the same schema version:
 *   new client / old document finds none and runs layout factories as before; old client / new document ignores
 *   it; a legacy flat payload carries it under {@link ECO_PAGE_DATA_TIERS_KEY}, which never reaches page props;
 *   an invalid `tiers` is ignored without rejecting the envelope
 */
export const ECO_PAGE_DATA_SCHEMA_VERSION = 1 as const;

/** Reserved key carrying `tiers` inside a legacy flat payload. */
export const ECO_PAGE_DATA_TIERS_KEY = '__ecoTiers';

export type EcoPageDataProps = Record<string, unknown>;

export type EcoPageDataManifestV1 = {
	schemaVersion: typeof ECO_PAGE_DATA_SCHEMA_VERSION;
	navigationOwner: 'react-router';
	moduleUrl: string;
	props: EcoPageDataProps;
	/** The props each layout tier renders with, outer to inner, resolved on the server. */
	tiers?: readonly EcoPageDataProps[];
};

export type EcoPageDataDocumentPayload = EcoPageDataManifestV1 | EcoPageDataProps;

/**
 * Returns whether a parsed JSON value is a versioned page-data envelope.
 */
export function isEcoPageDataManifestV1(value: unknown): value is EcoPageDataManifestV1 {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Partial<EcoPageDataManifestV1>;
	return (
		candidate.schemaVersion === ECO_PAGE_DATA_SCHEMA_VERSION &&
		candidate.navigationOwner === 'react-router' &&
		typeof candidate.moduleUrl === 'string' &&
		typeof candidate.props === 'object' &&
		candidate.props !== null &&
		!Array.isArray(candidate.props)
	);
}

/**
 * Returns whether a payload claims a numeric schema version without being a valid v1 envelope.
 *
 * @remarks
 * Only numeric `schemaVersion` values are treated as envelope attempts. Legacy flat props may
 * legitimately include a string `schemaVersion` field (e.g. a version string) and must not be
 * wiped. Near-miss numeric envelopes must not fall through to the flat-props path.
 */
function isMalformedPageDataEnvelope(payload: object): boolean {
	return 'schemaVersion' in payload && typeof (payload as { schemaVersion: unknown }).schemaVersion === 'number';
}

/**
 * Extracts browser page props from either a v1 envelope or a legacy flat payload.
 */
export function resolveEcoPageDataProps(payload: unknown): EcoPageDataProps {
	if (isEcoPageDataManifestV1(payload)) {
		return payload.props;
	}

	if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
		if (isMalformedPageDataEnvelope(payload)) {
			return {};
		}

		const { [ECO_PAGE_DATA_TIERS_KEY]: _tiers, ...props } = payload as EcoPageDataProps;
		return props;
	}

	return {};
}

function isPlainObject(value: unknown): value is EcoPageDataProps {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toTiers(value: unknown): readonly EcoPageDataProps[] | undefined {
	return Array.isArray(value) && value.every(isPlainObject) ? (value as EcoPageDataProps[]) : undefined;
}

/**
 * Extracts the server-resolved layout tier props from a v1 envelope or a legacy flat payload.
 *
 * @remarks
 * Returns `undefined` unless the value is an array of plain objects, so a malformed value falls back to layout
 * factories instead of rendering a layout with garbage props.
 */
export function resolveEcoPageDataTiers(payload: unknown): readonly EcoPageDataProps[] | undefined {
	if (isEcoPageDataManifestV1(payload)) {
		return toTiers(payload.tiers);
	}

	if (isPlainObject(payload) && !isMalformedPageDataEnvelope(payload)) {
		return toTiers(payload[ECO_PAGE_DATA_TIERS_KEY]);
	}

	return undefined;
}

/**
 * Extracts the page module URL from a v1 envelope when present.
 */
export function resolveEcoPageDataModuleUrl(payload: unknown): string | null {
	return isEcoPageDataManifestV1(payload) ? payload.moduleUrl : null;
}

/**
 * Builds the canonical v1 page-data envelope for React documents.
 */
export function createEcoPageDataManifestV1(input: {
	moduleUrl: string;
	props: EcoPageDataProps;
	tiers?: readonly EcoPageDataProps[];
}): EcoPageDataManifestV1 {
	return {
		schemaVersion: ECO_PAGE_DATA_SCHEMA_VERSION,
		navigationOwner: 'react-router',
		moduleUrl: input.moduleUrl,
		props: input.props,
		...(input.tiers && { tiers: input.tiers }),
	};
}

/**
 * Normalizes flat page props or an existing envelope into the document payload shape.
 *
 * @remarks
 * Shared by server serializers and `EcoPropsScript` so envelope rules stay in one place.
 * A valid v1 envelope is returned as-is; `options.moduleUrl` is ignored in that case.
 * Flat props wrap into a v1 envelope only when `options.moduleUrl` is provided; the reserved
 * {@link ECO_PAGE_DATA_TIERS_KEY} is then lifted into the envelope's `tiers`, and otherwise stays in the flat object.
 */
export function resolvePageDataDocumentPayload(
	data: EcoPageDataDocumentPayload,
	options?: { moduleUrl?: string },
): EcoPageDataDocumentPayload {
	if (isEcoPageDataManifestV1(data)) {
		return data;
	}

	const props = { ...(data as EcoPageDataProps) };
	const moduleUrl = options?.moduleUrl;

	if (!moduleUrl) {
		return props;
	}

	const { [ECO_PAGE_DATA_TIERS_KEY]: rawTiers, ...pageProps } = props;
	return createEcoPageDataManifestV1({ moduleUrl, props: pageProps, tiers: toTiers(rawTiers) });
}
