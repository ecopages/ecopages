import type { EcoComponent, StaticPageContext } from '@ecopages/core';
import type { JSX } from 'react';

export const Page: EcoComponent<StaticPageContext, JSX.Element> = () => <div>Hello World</div>;

Page.config = { identity: { id: 'test-page', file: '/app/src/pages/test-page.tsx', integration: 'react' } };
