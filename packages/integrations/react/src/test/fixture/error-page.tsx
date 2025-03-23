import type { EcoPage, StaticPageContext } from '@ecopages/core';
import type { JSX } from 'react';

export const ErrorPage: EcoPage<StaticPageContext, JSX.Element> = () => {
  throw new Error('Page failed to render');
};
