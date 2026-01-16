import { createElement, type FC } from 'react';

export interface EcoPropsScriptProps {
	/** The page props to serialize for client-side hydration */
	data: Record<string, any>;
}

export const EcoPropsScript: FC<EcoPropsScriptProps> = ({ data }: EcoPropsScriptProps) => {
	return createElement('script', {
		id: '__ECO_PROPS__',
		type: 'application/json',
		dangerouslySetInnerHTML: { __html: JSON.stringify(data ?? {}) },
	});
};
