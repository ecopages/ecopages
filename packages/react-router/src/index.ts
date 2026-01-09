/**
 * EcoPages React Router - SPA navigation for React with SSR support.
 * @module
 */

export { EcoRouter, PageContent, EcoReactRouter } from './router';
export type { EcoRouterProps, EcoReactRouterProps } from './router';

export { EcoPropsScript } from './props-script';
export type { EcoPropsScriptProps } from './props-script';

export { useRouter } from './context';
export type { RouterContextValue } from './context';

export type { EcoReactRouterOptions } from './types';

export { morphHead } from './head-morpher';

export type { PageState } from './navigation';

export { ecoRouter } from './adapter';
