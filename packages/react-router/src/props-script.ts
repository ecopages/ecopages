import { createElement, type FC } from 'react';
import { escapePageDataJson } from '@ecopages/react/serialize-page-data-script';

export interface EcoPropsScriptProps {
	/** The page props to serialize for client-side hydration */
	data: Record<string, any>;
}

/**
 * Serializes page props as JSON for SPA navigation.
 * The hydration script reads this and sets window.__ECO_PAGES__.page.
 * Using application/json allows direct parsing without regex.
 */
export const EcoPropsScript: FC<EcoPropsScriptProps> = ({ data }) => {
	return createElement('script', {
		id: '__ECO_PAGE_DATA__',
		type: 'application/json',
		dangerouslySetInnerHTML: { __html: escapePageDataJson(data) },
	});
};
