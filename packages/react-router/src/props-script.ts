import { createElement, type FC } from 'react';
import {
	createEcoPageDataManifestV1,
	ECO_PAGE_MODULE_PROP,
	escapePageDataJson,
	isEcoPageDataManifestV1,
	type EcoPageDataDocumentPayload,
	type EcoPageDataProps,
} from '@ecopages/react/serialize-page-data-script';

export { ECO_PAGE_MODULE_PROP } from '@ecopages/react/serialize-page-data-script';

export interface EcoPropsScriptProps {
	/**
	 * Page props or a versioned page-data envelope.
	 *
	 * @remarks
	 * Flat props may include the reserved {@link ECO_PAGE_MODULE_PROP} key. When
	 * present (or when `module` is passed explicitly), the script emits the v1
	 * envelope so SPA navigation can discover the page module without parsing
	 * hydration JavaScript. Legacy flat props remain supported for older documents.
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
 * Using `application/json` allows direct parsing without regex.
 */
export const EcoPropsScript: FC<EcoPropsScriptProps> = ({ data, module }) => {
	let payload: EcoPageDataDocumentPayload = data;

	if (!isEcoPageDataManifestV1(data)) {
		const propsRecord = { ...(data as EcoPageDataProps) };
		const inferredModule =
			module ??
			(typeof propsRecord[ECO_PAGE_MODULE_PROP] === 'string' ? propsRecord[ECO_PAGE_MODULE_PROP] : undefined);
		if (typeof propsRecord[ECO_PAGE_MODULE_PROP] !== 'undefined') {
			delete propsRecord[ECO_PAGE_MODULE_PROP];
		}
		payload = inferredModule
			? createEcoPageDataManifestV1({ module: inferredModule, props: propsRecord })
			: propsRecord;
	}

	return createElement('script', {
		id: '__ECO_PAGE_DATA__',
		type: 'application/json',
		dangerouslySetInnerHTML: { __html: escapePageDataJson(payload) },
	});
};
