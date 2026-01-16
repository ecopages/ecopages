/**
 * Renders a script tag containing serialized page props.
 * Used in the HTML template to enable client-side prop extraction.
 * @module
 */

import * as React from 'react';
import type { FC } from 'react';

export interface EcoPropsScriptProps {
	/** The page props to serialize for client-side hydration */
	data: Record<string, any>;
}

export const EcoPropsScript: FC<EcoPropsScriptProps> = ({ data }: EcoPropsScriptProps) => {
	return (
		<script id="__ECO_PROPS__" type="application/json">
			{JSON.stringify(data ?? {})}
		</script>
	);
};
