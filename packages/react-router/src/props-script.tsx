import { type FC } from 'react';

export interface EcoPropsScriptProps {
	/** The page props to serialize for client-side hydration */
	data: Record<string, any>;
}

/**
 * Serializes page props as JSON for SPA navigation.
 * The hydration script reads this and sets window.__ECO_PAGE__.
 * Using application/json allows direct parsing without regex.
 */
export const EcoPropsScript: FC<EcoPropsScriptProps> = ({ data }) => {
	return (
		<script
			id="__ECO_PAGE_DATA__"
			type="application/json"
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data || {}) }}
		/>
	);
};
