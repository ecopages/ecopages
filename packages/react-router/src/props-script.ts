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
	 * When `moduleUrl` is passed and `data` is not already a v1 envelope, the script
	 * emits `schemaVersion:1` with that field. Passing `moduleUrl` alongside an
	 * existing envelope does not rewrite the envelope's `moduleUrl`.
	 */
	data: EcoPageDataDocumentPayload;
	/** Browser-importable page module URL; serialized as envelope field `moduleUrl`. */
	moduleUrl?: string;
}

/**
 * Serializes page props as JSON for SPA navigation.
 *
 * @remarks
 * Emits `#__ECO_PAGE_DATA__`. Hydration scripts and SPA commit write
 * `window.__ECO_PAGES__.page` from that payload. Module discovery uses envelope
 * `moduleUrl`, then the runtime page marker, then the page bootstrap script `src`.
 */
export const EcoPropsScript: FC<EcoPropsScriptProps> = ({ data, moduleUrl }) => {
	const payload = resolvePageDataDocumentPayload(data, { moduleUrl });

	return createElement('script', {
		id: '__ECO_PAGE_DATA__',
		type: 'application/json',
		dangerouslySetInnerHTML: { __html: escapePageDataJson(payload) },
	});
};
