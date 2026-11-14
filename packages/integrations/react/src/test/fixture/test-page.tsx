import type { EcoComponent, StaticPageContext } from '@ecopages/core';
import { path } from '@ecopages/file-system/path';
import type { JSX } from 'react';

export const Page: EcoComponent<StaticPageContext, JSX.Element> = () => <div>Hello World</div>;

Page.config = { identity: { id: 'test-page', file: path.fromFileUrl(import.meta.url), integration: 'react' } };
