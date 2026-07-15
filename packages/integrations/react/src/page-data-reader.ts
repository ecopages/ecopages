import { resolveEcoPageDataModuleUrl, resolveEcoPageDataProps, type EcoPageDataProps } from './page-data-manifest.ts';

export type ReadPageDataDocumentResult = {
	moduleUrl?: string;
	props: EcoPageDataProps;
};

/**
 * Reads `__ECO_PAGE_DATA__`, supporting both v1 envelopes and legacy flat props.
 *
 * @remarks
 * Always returns unwrapped `props`. `moduleUrl` is set only when the document
 * carries a valid v1 envelope.
 */
export function readPageDataDocument(): ReadPageDataDocumentResult {
	const element = document.getElementById('__ECO_PAGE_DATA__');
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

/**
 * Returns page props from `__ECO_PAGE_DATA__` for hydration and HMR handlers.
 */
export function getPageDataFromDocument(): EcoPageDataProps {
	return readPageDataDocument().props;
}
