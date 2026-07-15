import { createElement, type FC } from 'react';
import {
	escapePageDataJson,
	resolvePageDataDocumentPayload,
	type EcoPageDataDocumentPayload,
} from '@ecopages/react/serialize-page-data-script';

export interface EcoPropsScriptProps {
	/**
	 * Page props or a versioned page-data envelope.
	 *
	 * @remarks
	 * When `module` is passed, the script emits the v1 envelope so SPA navigation can
	 * discover the page module without parsing hydration JavaScript. Legacy flat props
	 * remain supported for older documents.
	 */
	data: EcoPageDataDocumentPayload;
	/** Browser-importable page module URL for router-enabled documents. */
	module?: string;
}

/**
 * Serializes page props as JSON for SPA navigation.
 *
 * @remarks
 * The hydration script reads this and sets `window.__ECO_PAGES__.page`.
 * Clients parse `#__ECO_PAGE_DATA__` as JSON; module discovery uses the v1
 * envelope `moduleUrl`, the runtime page marker, or the page bootstrap script `src`.
 */
export const EcoPropsScript: FC<EcoPropsScriptProps> = ({ data, module: moduleUrl }) => {
	const payload = resolvePageDataDocumentPayload(data, { moduleUrl });

	return createElement('script', {
		id: '__ECO_PAGE_DATA__',
		type: 'application/json',
		dangerouslySetInnerHTML: { __html: escapePageDataJson(payload) },
	});
};
