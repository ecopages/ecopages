import type { EcoComponent, StaticPageContext } from '@ecopages/core';
import type { JSX } from 'react';

export const ErrorPage: EcoComponent<StaticPageContext, JSX.Element> = () => {
	throw new Error('Page failed to render');
};
