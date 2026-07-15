/**
 * Versioned React page-data document payload.
 *
 * @remarks
 * The `__ECO_PAGE_DATA__` script emits this envelope so client navigation can
 * read module identity without parsing generated hydration JavaScript. Older
 * documents may still contain a flat props object; consumers must detect both.
 *
 * Compatibility matrix:
 * - new client / new document: prefer `v:1` envelope (`module` + `props`)
 * - new client / old document: accept legacy flat props; module falls back to
 *   hydration markers/regex for one compatibility release
 * - old client / new document: old clients that only read flat props should be
 *   upgraded; envelope consumers must unwrap `props` before hydration
 * - malformed / unknown schema (`v` present but envelope invalid): empty props
 *   and no module URL
 * - HMR: `moduleUrlOverride` still bypasses document discovery
 */
export const ECO_PAGE_DATA_SCHEMA_VERSION = 1 as const;

export type EcoPageDataProps = Record<string, unknown>;

export type EcoPageDataManifestV1 = {
	v: typeof ECO_PAGE_DATA_SCHEMA_VERSION;
	navigationOwner: 'react-router';
	module: string;
	props: EcoPageDataProps;
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
		candidate.v === ECO_PAGE_DATA_SCHEMA_VERSION &&
		candidate.navigationOwner === 'react-router' &&
		typeof candidate.module === 'string' &&
		typeof candidate.props === 'object' &&
		candidate.props !== null &&
		!Array.isArray(candidate.props)
	);
}

/**
 * Returns whether a payload claims a schema version field without being a valid v1 envelope.
 *
 * @remarks
 * Near-miss objects must not fall through to the legacy flat-props path; that
 * would hydrate garbage keys like `v` / `module` as React page props.
 */
function isMalformedPageDataEnvelope(payload: object): boolean {
	return 'v' in payload;
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

		return payload as EcoPageDataProps;
	}

	return {};
}

/**
 * Extracts the page module URL from a v1 envelope when present.
 */
export function resolveEcoPageDataModuleUrl(payload: unknown): string | null {
	return isEcoPageDataManifestV1(payload) ? payload.module : null;
}

/**
 * Builds the canonical v1 page-data envelope for React documents.
 */
export function createEcoPageDataManifestV1(input: { module: string; props: EcoPageDataProps }): EcoPageDataManifestV1 {
	return {
		v: ECO_PAGE_DATA_SCHEMA_VERSION,
		navigationOwner: 'react-router',
		module: input.module,
		props: input.props,
	};
}
