import { resolveEcoPageDataModuleUrl, resolveEcoPageDataProps, type EcoPageDataProps } from './page-data-manifest.ts';

export type ReadPageDataDocumentResult = {
	moduleUrl?: string;
	props: EcoPageDataProps;
};

/**
 * Reads `__ECO_PAGE_DATA__` from `source`, supporting both v1 envelopes and legacy flat props.
 *
 * @remarks
 * Always returns unwrapped `props`. `moduleUrl` is set only when the document
 * carries a valid v1 envelope. `source` defaults to the live document; a direct HMR update passes the document it
 * fetched, whose data is the newer.
 */
export function readPageDataDocument(source: Pick<Document, 'getElementById'> = document): ReadPageDataDocumentResult {
	const element = source.getElementById('__ECO_PAGE_DATA__');
	if (!element?.textContent) {
		return { props: {} };
	}

	try {
		const parsed: unknown = JSON.parse(element.textContent);
		const moduleUrl = resolveEcoPageDataModuleUrl(parsed) ?? undefined;
		return {
			...(moduleUrl && { moduleUrl }),
			props: resolveEcoPageDataProps(parsed),
		};
	} catch {
		return { props: {} };
	}
}
